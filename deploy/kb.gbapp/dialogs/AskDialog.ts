/*****************************************************************************\
|                                               ( )_  _                       |
|    _ _    _ __   _ _    __    ___ ___     _ _ | ,_)(_)  ___   ___     _     |
|   ( '_`\ ( '__)/'_` ) /'_ `\/' _ ` _ `\ /'_` )| |  | |/',__)/' _ `\ /'_`\   |
|   | (_) )| |  ( (_| |( (_) || ( ) ( ) |( (_| || |_ | |\__, \| ( ) |( (_) )  |
|   | ,__/'(_)  `\__,_)`\__  |(_) (_) (_)`\__,_)`\__)(_)(____/(_) (_)`\___/'  |
|   | |                ( )_) |                                                |
|   (_)                 \___/'                                                |
|                                                                             |
| General Bots Copyright (c) Pragmatismo.io. All rights reserved.             |
| Licensed under the AGPL-3.0.                                                |
|                                                                             | 
| According to our dual licensing model, this program can be used either      |
| under the terms of the GNU Affero General Public License, version 3,        |
| or under a proprietary license.                                             |
|                                                                             |
| The texts of the GNU Affero General Public License with an additional       |
| permission and of our proprietary license can be found at and               |
| in the LICENSE file you have received along with this program.              |
|                                                                             |
| This program is distributed in the hope that it will be useful,             |
| but WITHOUT ANY WARRANTY without even the implied warranty of              |
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the                |
| GNU Affero General Public License for more details.                         |
|                                                                             |
| "General Bots" is a registered trademark of Pragmatismo.io.                 |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights, title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/

"use strict"

import { IGBDialog } from "botlib"
import { AzureText } from "pragmatismo-io-framework"
import { GBMinInstance } from "botlib"
import { KBService } from './../services/KBService'
import { BotAdapter } from "botbuilder"
import { LuisRecognizer } from "botbuilder-ai"

const logger = require("../../../src/logger")

export class AskDialog extends IGBDialog {
  /**
   * Setup dialogs flows and define services call.
   * 
   * @param bot The bot adapter.
   * @param min The minimal bot instance data.
   */
  static setup(bot: BotAdapter, min: GBMinInstance) {

    const service = new KBService(min.core.sequelize)

    const model = new LuisRecognizer({
      appId: min.instance.nlpAppId,
      subscriptionKey: min.instance.nlpSubscriptionKey,
      serviceEndpoint: min.instance.nlpServerUrl
    })


    min.dialogs.add("/answer", [



      async (dc, args) => {

        // Initialize values.

        const user = min.userState.get(dc.context)
        let text = args.query
        if (!text) {
          throw new Error(`/answer being called with no args.query text.`)
        }

        let locale = await AzureText.getLocale(min.instance.textAnalyticsKey,
          min.instance.textAnalyticsServerUrl, text)
        if (locale != dc.context.activity.locale.split("-")[0])
        {
          switch(locale)
          {
            case "pt":
              await dc.context.sendActivity("OK, mundando de idioma para o Português...");
              dc.context.activity.locale = "pt-BR";
            break;
            case "en":
              await dc.context.sendActivity("OK, changing language to English...");
              dc.context.activity.locale = "en-US";
            break;
            default:
              await dc.context.sendActivity(`Unknown language: ${locale}`);
            break;

          }
          
        }

        // Stops any content on projector.

        await min.conversationalService.sendEvent(dc, "stop", null)

        // Handle extra text from FAQ.

        if (args && args.query) {
          text = args.query
        } else if (args && args.fromFaq) {
          let messages = [
            `Ótima escolha, procurando resposta para sua questão...`,
            `Pesquisando sobre o termo...`,
            `Aguarde, por favor, enquanto acho sua resposta...`
          ]

          await dc.context.sendActivity(messages[0]) // TODO: Handle rnd.
        }

        // Spells check the input text before sending Search or NLP.

        if (min.instance.spellcheckerKey) {
          let data = await AzureText.getSpelledText(
            min.instance.spellcheckerKey,
            text)

          if (data != text) {
            logger.info(`Spelling corrected: ${data}`)
            text = data
          }
        }

        // Searches KB for the first time.

        user.lastQuestion = text
        let resultsA = await service.ask(
          min.instance,
          text,
          min.instance.searchScore,
          user.subjects)

        // If there is some result, answer immediately.

        if (resultsA && resultsA.answer) {

          // Saves some context info.

          user.isAsking = false
          user.lastQuestionId = resultsA.questionId

          // Sends the answer to all outputs, including projector.

          await service.sendAnswer(min.conversationalService, dc, resultsA.answer)

          // Goes to ask loop, again.

          await dc.replace("/ask", { isReturning: true })

        } else {

          // Second time running Search, now with no filter.

          let resultsB = await service.ask(min.instance, text,
            min.instance.searchScore, null)

          // If there is some result, answer immediately.

          if (resultsB && resultsB.answer) {

            // Saves some context info.

            const user = min.userState.get(dc.context)
            user.isAsking = false
            user.lastQuestionId = resultsB.questionId

            // Informs user that a broader search will be used.

            if (user.subjects.length > 0) {
              let subjectText =
                `${KBService.getSubjectItemsSeparatedBySpaces(
                  user.subjects
                )}`
              let messages = [
                `Respondendo nao apenas sobre ${subjectText}... `,
                `Respondendo de modo mais abrangente...`,
                `Vou te responder de modo mais abrangente... 
                                Não apenas sobre ${subjectText}`
              ]
              await dc.context.sendActivity(messages[0]) // TODO: Handle rnd.
            }

            // Sends the answer to all outputs, including projector.

            await service.sendAnswer(min.conversationalService, dc, resultsB.answer)
            await dc.replace("/ask", { isReturning: true })

          } else {

            let data = await min.conversationalService.runNLP(dc, min, text)
            if (!data) {
              let messages = [
                "Desculpe-me, não encontrei nada a respeito.",
                "Lamento... Não encontrei nada sobre isso. Vamos tentar novamente?",
                "Desculpe-me, não achei nada parecido. Poderia tentar escrever de outra forma?"
              ]

              await dc.context.sendActivity(messages[0]) // TODO: Handle rnd.
              await dc.replace("/ask", { isReturning: true })
            }
          }
        }
      }
    ])

    min.dialogs.add("/ask", [
      async (dc, args) => {
        const user = min.userState.get(dc.context)
        user.isAsking = true
        if (!user.subjects) {
          user.subjects = []
        }
        let text = []
        if (user.subjects.length > 0) {
          text = [
            `Faça sua pergunta...`,
            `Pode perguntar sobre o assunto em questão... `,
            `Qual a pergunta?`
          ]
        }

        if (args && args.isReturning) {
          text = [
            "Sobre o que mais posso ajudar?",
            "Então, posso ajudar em algo a mais?",
            "Deseja fazer outra pergunta?"
          ]
        }
        if (text.length > 0) {
          await dc.prompt('textPrompt', text[0])
        }
      },
      async (dc, value) => {
        await dc.endAll()
        await dc.begin("/answer", { query: value })
      }
    ])
  }
}
