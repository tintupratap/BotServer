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
| but WITHOUT ANY WARRANTY, without even the implied warranty of              |
| MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the                |
| GNU Affero General Public License for more details.                         |
|                                                                             |
| "General Bots" is a registered trademark of Pragmatismo.io.                 |
| The licensing of the program under the AGPLv3 does not imply a              |
| trademark license. Therefore any rights, title and interest in              |
| our trademarks remain entirely with us.                                     |
|                                                                             |
\*****************************************************************************/

"use strict";

const UrlJoin = require("url-join");

import { BotAdapter, CardFactory, MessageFactory } from "botbuilder";
import { IGBDialog } from "botlib";
import { GBMinInstance } from "botlib";
import { GuaribasSubject } from "../models";
import { KBService } from "../services/KBService";
import { Messages } from "../strings";
import { AzureText } from "pragmatismo-io-framework";
import { WaterfallDialog } from "botbuilder-dialogs";

export class MenuDialog extends IGBDialog {
  /**
   * Setup dialogs flows and define services call.
   *
   * @param bot The bot adapter.
   * @param min The minimal bot instance data.
   */
  static setup(bot: BotAdapter, min: GBMinInstance) {
    var service = new KBService(min.core.sequelize);

    min.dialogs.add(new WaterfallDialog("/menu", [
      async step => {
        const locale = step.context.activity.locale;
        var rootSubjectId = null;

        if (step.options && step.options["data"]) {
          var subject = step.result.data;

          // If there is a shortcut specified as subject destination, go there.

          if (subject.to) {
            let dialog = subject.to.split(":")[1];
            await step.replaceDialog("/" + dialog);
            await step.endDialog();
            return;
          }

          // Adds to bot a perception of a new subject.

          const user = await min.userProfile.get(context, {});
          user.subjects.push(subject);
          rootSubjectId = subject.subjectId;

          // Whenever a subject is selected, shows a faq about it.

          if (user.subjects.length > 0) {
            let data = await service.getFaqBySubjectArray(
              "menu",
              user.subjects
            );
            await min.conversationalService.sendEvent(step, "play", {
              playerType: "bullet",
              data: data.slice(0, 10)
            });
          }
        } else {
          const user = await min.userProfile.get(context, {});
          user.subjects = [];

          await step.context.sendActivity(Messages[locale].here_is_subjects); // TODO: Handle rnd.
          user.isAsking = false;
        }

        const msg = MessageFactory.text("");
        var attachments = [];

        let data = await service.getSubjectItems(
          min.instance.instanceId,
          rootSubjectId
        );

        msg.attachmentLayout = "carousel";

        data.forEach(function(item: GuaribasSubject) {
          var subject = item;
          var card = CardFactory.heroCard(
            subject.title,
            subject.description,
            CardFactory.images([
              UrlJoin("/kb", min.instance.kb, "subjects", "subject.png")
            ]),
            CardFactory.actions([
              {
                type: "postBack",
                title: Messages[locale].menu_select,
                value: JSON.stringify({
                  title: subject.title,
                  description: subject.description,
                  subjectId: subject.subjectId,
                  internalId: subject.internalId,
                  to: subject.to
                })
              }
            ])
          );

          attachments.push(card);
        });

        if (attachments.length == 0) {
          const user = await min.userProfile.get(context, {});

          if (user.subjects && user.subjects.length > 0) {
            await step.context.sendActivity(
              Messages[locale].lets_search(
                KBService.getFormattedSubjectItems(user.subjects)
              )
            );
          }

          await step.replaceDialog("/ask", {});
        } else {
          msg.attachments = attachments;
          await step.context.sendActivity(msg);
        }

        const user = await min.userProfile.get(context, {});
        user.isAsking = true;
        return await step.next();
      },
      async step => {
        var text = step.result;
        const locale = step.context.activity.locale;
        if (AzureText.isIntentNo(locale, text)) {
          await step.replaceDialog("/feedback");
        } else {
          await step.replaceDialog("/ask");
        }
        return await step.next();
      }
    ]));
  }
}
