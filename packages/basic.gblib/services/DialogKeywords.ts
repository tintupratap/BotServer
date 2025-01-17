/*****************************************************************************\
|                                               ( )_  _                       |
|    _ _    _ __   _ _    __    ___ ___     _ _ | ,_)(_)  ___   ___     _     |
|   ( '_`\ ( '__)/'_` ) /'_ `\/' _ ` _ `\ /'_` )| |  | |/',__)/' v `\ /'_`\   |
|   | (_) )| |  ( (_| |( (_) || ( ) ( ) |( (_| || |_ | |\__, \| (˅) |( (_) )  |
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

'use strict';

import { GBDialogStep, GBLog, GBMinInstance } from 'botlib';
import { GBConfigService } from '../../core.gbapp/services/GBConfigService';
import { ChartServices } from './ChartServices';
const urlJoin = require('url-join');
import { GBServer } from '../../../src/app';
import { GBDeployer } from '../../core.gbapp/services/GBDeployer';
import { SecService } from '../../security.gbapp/services/SecService';
import { SystemKeywords } from './SystemKeywords';
import { GBMinService } from '../../core.gbapp/services/GBMinService';
import { HubSpotServices } from '../../hubspot.gblib/services/HubSpotServices';
import { WhatsappDirectLine } from '../../whatsapp.gblib/services/WhatsappDirectLine';
import { GBAdminService } from '../../admin.gbapp/services/GBAdminService';
import { createBrowser } from '../../core.gbapp/services/GBSSR';
import * as request from 'request-promise-native';
import { Messages } from '../strings';

import * as fs from 'fs';
import { CollectionUtil } from 'pragmatismo-io-framework';
import { GBConversationalService } from '../../core.gbapp/services/GBConversationalService';


const DateDiff = require('date-diff');
const { Buttons } = require('whatsapp-web.js');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const phone = require('phone');

const Path = require('path');
const sgMail = require('@sendgrid/mail');
var mammoth = require("mammoth");
const qrcode = require('qrcode');

/**
 * Base services of conversation to be called by BASIC which
 * requries step variable to work.
 */
export class DialogKeywords {

  /**
  * Reference to minimal bot instance.
  */
  public min: GBMinInstance;

  /**
   * Reference to the base system keywords functions to be called.
   */
  public internalSys: SystemKeywords;

  /**
   * Current user object to get BASIC properties read.
   */
  public user;

  /**
   * HTML browser for conversation over page interaction.
   */
  browser: any;

  /**
   * The number used in this execution for HEAR calls (useful for SET SCHEDULE).
   */
  hrOn: string;

  step: GBDialogStep;

  debugWeb: boolean;
  lastDebugWeb: Date;

  /**
   * SYSTEM account maxLines, when used with impersonated contexts (eg. running in SET SCHEDULE).
   */
  maxLines: number = 2000;

  public async getDeployer() {
    return this.min.deployService;
  }

  public async getMin() {
    return this.min;
  }

  public async getStep() {
    return this.step;
  }


  /**
   * When creating this keyword facade, a bot instance is
   * specified among the deployer service.
   */
  constructor(min: GBMinInstance, deployer: GBDeployer, step: GBDialogStep, user) {
    this.min = min;
    this.user = user;
    this.internalSys = new SystemKeywords(min, deployer, this);
    this.step = step;

    this.debugWeb = this.min.core.getParam<boolean>(
      this.min.instance,
      'Debug Web Automation',
      false
    );

  }

  /**
   * Base reference of system keyword facade, called directly
   * by the script.
   */
  public sys(): SystemKeywords {
    return this.internalSys;
  }

  /**
   * Returns the page object.
   *
   * @example x = GET PAGE
   */
  public async getPage(step, url, username, password) {
    GBLog.info(`BASIC: Web Automation GET PAGE ${url}.`);
    if (!this.browser) {
      this.browser = await createBrowser(null);
    }
    const page = (await this.browser.pages())[0];
    if (username || password) {
      await page.authenticate({ 'username': username, 'password': password });
    }
    await page.goto(url);
    return page;
  }


  /**
   * 
   * 
   * Data = [10, 20, 30] 
   * Legends = "Steve;Yui;Carlos"   
   * img = CHART "pie", data, legends 
   * 
   * https://c3js.org/examples.html
   * 
   * @param data 
   * @param legends 
   * @see https://www.npmjs.com/package/plot
   */
  public async chart(step, type, data, legends, transpose) {

    let table = [[]];

    if (legends) {

      const legends_ = legends.split(';');

      // Columns and data are merged like:
      //     columns: [
      //       ['data1', 30, 200, 100, 400, 150, 250],
      //       ['data2', 50, 20, 10, 40, 15, 25]
      //     ]

      for (let i = 0; i < legends_.length; i++) {
        table[i] = [legends_[i]];
        table[i] = table[i].concat(data);
      }
    }
    else {
      table = SystemKeywords.JSONAsGBTable(data, false);
      table.shift();
    }

    if (transpose) {
      const transpose = (array) => {
        return array.reduce((prev, next) => next.map((item, i) =>
          (prev[i] || []).concat(next[i])
        ), []);
      }
      table = transpose(table);
    }


    let definition = {
      size: {
        "height": 420,
        "width": 680
      },
      data: {
        columns: table,
        type: type
      },
      bar: {
        ratio: 0.5
      }
    };

    // TODO: https://c3js.org/samples/timeseries.html

    if (type === 'timeseries') {
      definition['axis'][table[0]] = {
        type: 'timeseries',
        tick: {
          format: '%Y-%m-%d'
        }
      }
    }

    const gbaiName = `${this.min.botId}.gbai`;
    const localName = Path.join('work', gbaiName, 'cache', `img${GBAdminService.getRndReadableIdentifier()}.jpg`);

    await ChartServices.screenshot(definition, localName);

    const url = urlJoin(
      GBServer.globals.publicAddress,
      this.min.botId,
      'cache',
      Path.basename(localName)
    );

    GBLog.info(`BASIC: Visualization: Chart generated at ${url}.`);

    return url;
  }

  /**
   * Find element on page DOM.
   *
   * @example GET page, "elementName"
   */
  public async getBySelector(page, elementName) {
    GBLog.info(`BASIC: Web Automation GET element: ${elementName}.`);
    await page.waitForSelector(elementName)
    let elements = await page.$$(elementName);
    if (elements && elements.length > 1) {
      return elements;
    }
    else {
      const el = elements[0];
      el['originalSelector'] = elementName;
      el['href'] = await page.evaluate(e => e.getAttribute('href'), el);
      el['value'] = await page.evaluate(e => e.getAttribute('value'), el);
      el['name'] = await page.evaluate(e => e.getAttribute('name'), el);
      el['class'] = await page.evaluate(e => e.getAttribute('class'), el);
      return el;
    }
  }

  /**
   * Find element on page DOM.
   *
   * @example GET page, "frameSelector, "elementSelector"
   */
  public async getByFrame(page, frame, selector) {
    GBLog.info(`BASIC: Web Automation GET element by frame: ${selector}.`);
    await page.waitForSelector(frame)
    let frameHandle = await page.$(frame);
    const f = await frameHandle.contentFrame();
    await f.waitForSelector(selector);
    const element = await f.$(selector);
    element['originalSelector'] = selector;
    element['href'] = await f.evaluate(e => e.getAttribute('href'), element);
    element['value'] = await f.evaluate(e => e.getAttribute('value'), element);
    element['name'] = await f.evaluate(e => e.getAttribute('name'), element);
    element['class'] = await f.evaluate(e => e.getAttribute('class'), element);
    element['frame'] = f;
    return element;
  }

  /**
   * Simulates a mouse hover an web page element. 
   */
  public async hover(step, page, idOrName) {
    GBLog.info(`BASIC: Web Automation HOVER element: ${idOrName}.`);
    await this.getBySelector(page, idOrName);
    await page.hover(idOrName);
    await this.debugStepWeb(page);
  }

  /**
   * Clicks on an element in a web page.
   *
   * @example CLICK page, "#idElement"
   */
  public async click(step, page, frameOrSelector, selector) {
    GBLog.info(`BASIC: Web Automation CLICK element: ${frameOrSelector}.`);
    if (selector) {
      await page.waitForSelector(frameOrSelector)
      let frameHandle = await page.$(frameOrSelector);
      const f = await frameHandle.contentFrame();
      await f.waitForSelector(selector);
      await f.click(selector);
    }
    else {
      await page.waitForSelector(frameOrSelector);
      await page.click(frameOrSelector);
    }
    await this.debugStepWeb(page);
  }

  private async debugStepWeb(page) {

    let refresh = true;
    if (this.lastDebugWeb) {
      refresh = (new Date().getTime() - this.lastDebugWeb.getTime()) > 5000;
    }

    if (this.debugWeb && refresh) {
      const adminNumber = this.min.core.getParam(this.min.instance, 'Bot Admin Number', null);
      if (adminNumber) {
        await this.sendFileTo(this.step, adminNumber, page, "General Bots Debugger");
      }
      this.lastDebugWeb = new Date();
    }
  }

  /**
   * Press ENTER in a web page, useful for logins.
   *
   * @example PRESS ENTER ON page
   */
  public async pressKey(step, page, char, frame) {
    GBLog.info(`BASIC: Web Automation PRESS ${char} ON element: ${frame}.`);
    if (char.toLowerCase() === "enter") {
      char = '\n';
    }
    if (frame) {
      await page.waitForSelector(frame)
      let frameHandle = await page.$(frame);
      const f = await frameHandle.contentFrame();
      await f.keyboard.press(char);
    }
    else {
      await page.keyboard.press(char);
    }
  }

  public async linkByText(step, page, text, index) {
    GBLog.info(`BASIC: Web Automation CLICK LINK TEXT: ${text} ${index}.`);
    if (!index) {
      index = 1
    }
    const els = await page.$x(`//a[contains(., '${text}')]`);
    await els[index - 1].click();
    await this.debugStepWeb(page);
  }



  /**
   * Returns the screenshot of page or element
   *
   * @example file = SCREENSHOT page
   */
  public async screenshot(step, page, idOrName) {
    GBLog.info(`BASIC: Web Automation SCREENSHOT ${idOrName}.`);

    const gbaiName = `${this.min.botId}.gbai`;
    const localName = Path.join('work', gbaiName, 'cache', `screen-${GBAdminService.getRndReadableIdentifier()}.jpg`);

    await page.screenshot({ path: localName });

    const url = urlJoin(
      GBServer.globals.publicAddress,
      this.min.botId,
      'cache',
      Path.basename(localName)
    );
    GBLog.info(`BASIC: WebAutomation: Screenshot captured at ${url}.`);

    return url;
  }


  /**
   * Types the text into the text field.
   *
   * @example SET page, "elementName", "text"
   */
  public async setElementText(step, page, idOrName, text) {
    GBLog.info(`BASIC: Web Automation TYPE on ${idOrName}: ${text}.`);
    const e = await this.getBySelector(page, idOrName);
    await e.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await e.type(text, { delay: 200 });
    await this.debugStepWeb(page);
  }

  /**
   * Returns the today data filled in dd/mm/yyyy or mm/dd/yyyy.
   *
   * @example x = TODAY
   */
  public async getOCR(step, localFile) {
    GBLog.info(`BASIC: OCR processing on ${localFile}.`);
    const tesseract = require("node-tesseract-ocr")

    const config = {
      lang: "eng",
      oem: 1,
      psm: 3,
    }

    return await tesseract.recognize(localFile, config);
  }

  /**
   * Returns the today data filled in dd/mm/yyyy or mm/dd/yyyy.
   *
   * @example x = TODAY
   */
  public async getToday(step) {
    let d = new Date(),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear();

    if (month.length < 2) { month = '0' + month; }
    if (day.length < 2) { day = '0' + day; }

    const contentLocale = this.min.core.getParam<string>(
      this.min.instance,
      'Default Content Language',
      GBConfigService.get('DEFAULT_CONTENT_LANGUAGE')
    );

    switch (contentLocale) {
      case 'pt':
        return [day, month, year].join('/');

      case 'en':
        return [month, day, year].join('/');

      default:
        return [year, month, day].join('/');
    }
  }

  /**
   * Quits the dialog, currently required to get out of VM context.
   *
   * @example EXIT
   */
  public async exit(step) {
    await step.endDialog();
  }

  /**
   * Get active tasks.
   *
   * @example list = ACTIVE TASKS
   */
  public async getActiveTasks() {
    let s = new HubSpotServices(null, null, process.env.HUBSPOT_KEY);
    return await s.getActiveTasks();
  }

  /**
   * Creates a new deal.
   *
   * @example CREATE DEAL dealname, contato, empresa, amount
   */
  public async createDeal(dealName, contact, company, amount) {
    let s = new HubSpotServices(null, null, process.env.HUBSPOT_KEY);
    let deal = await s.createDeal(dealName, contact, company, amount);
    return deal;
  }

  /**
   * Finds contacts in XRM.
   *
   * @example list = FIND CONTACT "Sandra"
   */
  public async fndContact(name) {
    let s = new HubSpotServices(null, null, process.env.HUBSPOT_KEY);
    return await s.searchContact(name);
  }


  public getContentLocaleWithCulture(contentLocale) {
    switch (contentLocale) {
      case 'pt':
        return 'pt-BR';

      case 'en':
        return 'en-US';

      default:
        return 'en-us';
    }

  }

  public getCoded(value) {

    // Checks if it is a GB FILE object.

    if (value.data && value.filename) {
      value = value.data;
    }

    return Buffer.from(value).toString("base64");
  }

  /**
   * Returns specified date week day in format 'Mon'.
   *
   * @example day = WEEKDAY (date) 
   *
   */
  public getWeekFromDate(date) {

    const contentLocale = this.min.core.getParam<string>(
      this.min.instance,
      'Default Content Language',
      GBConfigService.get('DEFAULT_CONTENT_LANGUAGE')
    );

    let dt = SystemKeywords.getDateFromLocaleString(date, contentLocale);
    GBLog.info(`BASIC WEEKDAY contentLocale: ${this.getContentLocaleWithCulture(contentLocale)}`);
    GBLog.info(`BASIC WEEKDAY date: ${dt}`);
    GBLog.info(dt.toLocaleString(this.getContentLocaleWithCulture(contentLocale), { weekday: 'short' }));

    if (dt) {
      if (!(dt instanceof Date)) {
        dt = new Date(dt);
      }
      let week = dt.toLocaleString(this.getContentLocaleWithCulture(contentLocale), { weekday: 'short' });
      return week.substr(0, 3);
    }
    return 'NULL';
  }

  /**
   * Returns an object ready to get information about difference in several ways
   * like years, months or days.
   *
   * @example days = DATEDIFF date1, date2, mode
   *
   */
  public dateDiff(date1, date2, mode) {
    let dt1 = date1;
    let dt2 = date2;
    if (!(dt1 instanceof Date)) {
      dt1 = new Date(dt1);
    }
    if (!(dt2 instanceof Date)) {
      dt2 = new Date(dt2);
    }
    const diff = new DateDiff(date1, date2);
    switch (mode) {
      case 'year': return diff.years();
      case 'month': return diff.months();
      case 'week': return diff.weeks();
      case 'day': return diff.days();
      case 'hour': return diff.hours();
      case 'minute': return diff.minutes();
    }
  }

  /**
   * Returns specified date week day in format 'Mon'.
   *
   * @example DATEADD date, "minute", 60 
   * 
   * https://stackoverflow.com/a/1214753/18511
   */
  public dateAdd(date, mode, units) {
    let dateCopy = date;
    if (!(dateCopy instanceof Date)) {
      dateCopy = new Date(dateCopy);
    }
    var ret = new Date(dateCopy); //don't change original date
    var checkRollover = function () { if (ret.getDate() != date.getDate()) ret.setDate(0); };
    switch (String(mode).toLowerCase()) {
      case 'year': ret.setFullYear(ret.getFullYear() + units); checkRollover(); break;
      case 'quarter': ret.setMonth(ret.getMonth() + 3 * units); checkRollover(); break;
      case 'month': ret.setMonth(ret.getMonth() + units); checkRollover(); break;
      case 'week': ret.setDate(ret.getDate() + 7 * units); break;
      case 'day': ret.setDate(ret.getDate() + units); break;
      case 'hour': ret.setTime(ret.getTime() + units * 3600000); break;
      case 'minute': ret.setTime(ret.getTime() + units * 60000); break;
      case 'second': ret.setTime(ret.getTime() + units * 1000); break;
      default: ret = undefined; break;
    }
    return ret;
  }



  /**
   * Returns specified list member separated by comma.
   *
   * @example TALK TOLIST (array, member) 
   *
   */
  public getToLst(array, member) {
    if (!array) {
      return "<Empty>"
    }
    if (array[0] && array[0]['gbarray']) {
      array = array.slice(1);
    }
    array = array.filter((v, i, a) => a.findIndex(t => (t[member] === v[member])) === i);
    array = array.filter(function (item, pos) { return item != undefined; });
    array = array.map((item) => { return item[member]; })
    array = array.join(", ");

    return array;
  }

  /**
   * Returns the specified time in format hh:dd.
   *
   * @example hour = HOUR (date)
   *
   */
  public getHourFromDate(date) {
    function addZero(i) {
      if (i < 10) {
        i = "0" + i;
      }
      return i;
    }

    const contentLocale = this.min.core.getParam<string>(
      this.min.instance,
      'Default Content Language',
      GBConfigService.get('DEFAULT_CONTENT_LANGUAGE')
    );

    let dt = SystemKeywords.getDateFromLocaleString(date, contentLocale);

    if (dt) {
      if (!(dt instanceof Date)) {
        dt = new Date(dt);
      }
      return addZero(dt.getHours()) + ':' + addZero(dt.getMinutes());
    }
    return 'NULL';
  }

  /**
   * Returns current time in format hh:dd.
   *
   * @example SAVE "file.xlsx", name, email, NOW
   *
   */
  public async getNow() {
    const contentLocale = this.min.core.getParam<string>(
      this.min.instance,
      'Default Content Language',
      GBConfigService.get('DEFAULT_CONTENT_LANGUAGE')
    );

    const nowUTC = new Date();
    const now = typeof nowUTC === 'string' ?
      new Date(nowUTC) :
      nowUTC;

    const nowText = now.toLocaleString(this.getContentLocaleWithCulture(contentLocale),
      { timeZone: process.env.DEFAULT_TIMEZONE });

    return /\b([0-9]|0[0-9]|1?[0-9]|2[0-3]):[0-5]?[0-9]/.exec(nowText)[0];
  }


  /**
   * Sends an e-mail.
   * 
   * @example 
   * 
   * SEND MAIL "email@domain.com", "Subject",  "Message text."
   * 
   */
  public async sendEmail(to, subject, body) {

    // tslint:disable-next-line:no-console

    GBLog.info(`[E-mail]: to:${to}, subject: ${subject}, body: ${body}.`);
    const emailToken = process.env.EMAIL_API_KEY;

    // Inline word document used as e-mail body.

    if (typeof (body) === "object") {
      const result = await mammoth.convertToHtml({ buffer: body });
      body = result.value;
    }

    return new Promise<any>((resolve, reject) => {
      sgMail.setApiKey(emailToken);
      const msg = {
        to: to,
        from: process.env.EMAIL_FROM,
        subject: subject,
        text: body,
        html: body
      };
      sgMail.send(msg, false, (err, res) => {
        if (err) {
          reject(err)
        }
        else {
          resolve(res);
        }
      });
    });
  }

  /**
   * Sends a file to a given mobile.
   *
   * @example SEND FILE TO "+199988887777", "image.jpg", caption
   *
   */
  public async sendFileTo(step, mobile, filename, caption) {
    GBLog.info(`BASIC: SEND FILE TO '${mobile}', filename '${filename}'.`);
    return await this.internalSendFile(null, mobile, filename, caption);
  }

  /**
   * Sends a file to the current user.
   *
   * @example SEND FILE "image.jpg"
   *
   */
  public async sendFile(step, filename, caption) {
    const mobile = await this.userMobile(step);
    GBLog.info(`BASIC: SEND FILE (current: ${mobile}, filename '${filename}'.`);
    return await this.internalSendFile(step, mobile, filename, caption);
  }

  /**
   * Defines the current language of the bot conversation.
   *
   * @example SET LANGUAGE "pt"
   *
   */
  public async setLanguage(step, language) {
    const user = await this.min.userProfile.get(step.context, {});

    const sec = new SecService();
    user.systemUser = await sec.updateUserLocale(user.systemUser.userId, language);

    await this.min.userProfile.set(step.context, user);
    this.user = user;
  }

  /**
   * Defines the id generation policy.
   *
   * @example SET ID NUMBER 
   *
   */
  public async setIdGeneration(mode) {
    this['idGeneration'] = mode;
    this['id'] = await this.sys().getRandomId();
  }

  /**
   * Defines the maximum lines to scan in spreedsheets.
   *
   * @example SET MAX LINES 5000
   *
   */
  public async setMaxLines(step, count) {
    if (step) {
      const user = await this.min.userProfile.get(step.context, {});
      user.basicOptions.maxLines = count;
      await this.min.userProfile.set(step.context, user);
      this.user = user;
    }
    else {
      this.maxLines = count;
    }
  }


  /**
  * Defines the maximum lines to scan in spreedsheets.
  *
  * @example SET MAX COLUMNS 5000
  *
  */
  public async setMaxColumns(step, count) {
    const user = await this.min.userProfile.get(step.context, {});
    user.basicOptions.maxColumns = count;
    await this.min.userProfile.set(step.context, user);
    this.user = user;
  }


  /**
   * Defines the FIND behaviour to consider whole words while searching.
   *
   * @example SET WHOLE WORD ON
   *
   */
  public async setWholeWord(step, on) {
    const user = await this.min.userProfile.get(step.context, {});
    user.basicOptions.wholeWord = (on.trim() === "on");
    await this.min.userProfile.set(step.context, user);
    this.user = user;
  }

  /**
 * Defines the theme for assets generation.
 *
 * @example SET THEME "themename"
 *
 */
  public async setTheme(step, theme) {
    const user = await this.min.userProfile.get(step.context, {});
    user.basicOptions.theme = theme.trim();
    await this.min.userProfile.set(step.context, user);
    this.user = user;
  }

  /**
   * Defines translator behaviour.
   *
   * @example SET TRANSLATOR ON | OFF
   *
   */
  public async setTranslatorOn(step, on) {
    const user = await this.min.userProfile.get(step.context, {});
    user.basicOptions.translatorOn = (on.trim() === "on");
    await this.min.userProfile.set(step.context, user);
    this.user = user;
  }


  /**
   * Returns the name of the user acquired by WhatsApp API.
   */
  public async userName(step) {
    return step ? WhatsappDirectLine.usernames[await this.userMobile(step)] : 'N/A';
  }

  /**
   * OBSOLETE. 
   */
  public async getFrom(step) {
    return step ? await this.userMobile(step) : 'N/A';
  }


  /**
   * Returns current mobile number from user in conversation.
   *
   * @example SAVE "file.xlsx", name, email, MOBILE
   *
   */
  public async userMobile(step) {
    return GBMinService.userMobile(step);
  }

  /**
   * Shows the subject menu to the user
   *
   * @example MENU
   *
   */
  public async showMenu(step) {
    return await step.beginDialog('/menu');
  }
  private static async downloadAttachmentAndWrite(attachment) {


    const url = attachment.contentUrl;
    const localFolder = Path.join('work'); // TODO: , '${botId}', 'uploads');
    const localFileName = Path.join(localFolder, attachment.name);

    try {

      let response;
      if (url.startsWith('data:')) {
        var regex = /^data:.+\/(.+);base64,(.*)$/;
        var matches = url.match(regex);
        var ext = matches[1];
        var data = matches[2];
        response = Buffer.from(data, 'base64');
      }
      else {
        // arraybuffer is necessary for images
        const options = {
          url: url,
          method: 'GET',
          encoding: 'binary',
        };
        response = await request.get(options);
      }

      fs.writeFile(localFileName, response, (fsError) => {
        if (fsError) {
          throw fsError;
        }
      });
    } catch (error) {
      console.error(error);
      return undefined;
    }
    // If no error was thrown while writing to disk, return the attachment's name
    // and localFilePath for the response back to the user.
    return {
      fileName: attachment.name,
      localPath: localFileName
    };
  }

  /**
   * Performs the transfer of the conversation to a human agent.
   *
   * @example TRANSFER
   *
   */
  public async transferTo(step, to: string = null) {
    return await step.beginDialog('/t', { to: to });
  }

  /**
   * Hears something from user and put it in a variable
   *
   * @example HEAR name
   *
   */
  public async hear(step, kind, ...args) {

    try {

      let user;
      const isIntentYes = (locale, utterance) => {
        return utterance.toLowerCase().match(Messages[locale].affirmative_sentences);
      }

      if (this.hrOn) {
        const sec = new SecService();
        user = await sec.getUserFromAgentSystemId(this.hrOn)
      }
      else {
        user = this.user.systemUser;
      }
      const userId = user.userId;
      let result;

      const locale = user.locale ? user.locale : 'en-US';
      // TODO: https://github.com/GeneralBots/BotServer/issues/266

      if (args && args.length > 1) {

        let choices = [];
        let i = 0;
        args.forEach(arg => {
          i++;
          choices.push({ body: arg, id: `button${i}` });
        });

        const button = new Buttons(Messages[locale].choices, choices, ' ', ' ');

        await this.talk(button);
        GBLog.info(`BASIC: HEAR with ${args.toString()} (Asking for input).`);
      }
      else {

        GBLog.info('BASIC: HEAR (Asking for input).');
      }
      
      // Wait for the user to answer.

      let sleep = ms => {
        return new Promise(resolve => {
          setTimeout(resolve, ms);
        });
      };
      this.min.cbMap[userId] = {}
      this.min.cbMap[userId]['promise'] = '!GBHEAR';

      while (this.min.cbMap[userId].promise === '!GBHEAR') {
        await sleep(500);
      }

      const text = this.min.cbMap[userId].promise;

      if (kind === "file") {
        await step.prompt('attachmentPrompt', {});

        // Prepare Promises to download each attachment and then execute each Promise.
        const promises = step.context.activity.attachments.map(
          DialogKeywords.downloadAttachmentAndWrite);
        const successfulSaves = await Promise.all(promises);

        async function replyForReceivedAttachments(localAttachmentData) {
          if (localAttachmentData) {
            // Because the TurnContext was bound to this function, the bot can call
            // `TurnContext.sendActivity` via `this.sendActivity`;
            await this.sendActivity(`Upload OK.`);
          } else {
            await this.sendActivity('Error uploading file. Please, start again.');
          }
        }

        // Prepare Promises to reply to the user with information about saved attachments.
        // The current TurnContext is bound so `replyForReceivedAttachments` can also send replies.
        const replyPromises = successfulSaves.map(replyForReceivedAttachments.bind(step.context));
        await Promise.all(replyPromises);

        result = {
          data: fs.readFileSync(successfulSaves[0]['localPath']),
          filename: successfulSaves[0]['fileName']
        };

      }
      else if (kind === "boolean") {
        if (isIntentYes('pt-BR', text)) {
          result = true;
        }
        else {
          result = false;
        }
      }
      else if (kind === "email") {

        const extractEntity = (text) => {
          return text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
        }

        const value = extractEntity(text);

        if (value === null) {
          await this.talk("Por favor, digite um e-mail válido.");
          return await this.hear(step, kind, args);
        }

        result = value;

      }
      else if (kind === "name") {
        const extractEntity = text => {
          return text.match(/[_a-zA-Z][_a-zA-Z0-9]{0,16}/gi);
        };

        const value = extractEntity(text);

        if (value === null || value.length != 1) {
          await this.talk("Por favor, digite um nome válido.");
          return await this.hear(step, kind, args);
        }

        result = value;

      }
      else if (kind === "integer") {
        const extractEntity = text => {
          return text.match(/\d+/gi);
        };

        const value = extractEntity(text);

        if (value === null || value.length != 1) {
          await this.talk("Por favor, digite um número válido.");
          return await this.hear(step, kind, args);
        }

        result = value;
      }
      else if (kind === "date") {
        const extractEntity = text => {
          return text.match(/(^(((0[1-9]|1[0-9]|2[0-8])[\/](0[1-9]|1[012]))|((29|30|31)[\/](0[13578]|1[02]))|((29|30)[\/](0[4,6,9]|11)))[\/](19|[2-9][0-9])\d\d$)|(^29[\/]02[\/](19|[2-9][0-9])(00|04|08|12|16|20|24|28|32|36|40|44|48|52|56|60|64|68|72|76|80|84|88|92|96)$)/gi);
        };

        const value = extractEntity(text);

        if (value === null || value.length != 1) {
          await this.talk("Por favor, digite uma data no formato 12/12/2020.");
          return await this.hear(step, kind, args);
        }

        result = value;
      }
      else if (kind === "hour") {

        const extractEntity = text => {
          return text.match(/^([0-1]?[0-9]|2[0-4]):([0-5][0-9])(:[0-5][0-9])?$/gi);
        };

        const value = extractEntity(text);

        if (value === null || value.length != 1) {
          await this.talk("Por favor, digite um horário no formato hh:ss.");
          return await this.hear(step, kind, args);
        }

        result = value;
      }
      else if (kind === "money") {
        const extractEntity = text => {

          if (step.context.locale === 'en') { // TODO: Change to user.
            return text.match(/(?:\d{1,3},)*\d{1,3}(?:\.\d+)?/gi);
          }
          else {
            return text.match(/(?:\d{1,3}.)*\d{1,3}(?:\,\d+)?/gi);
          }
        };

        const value = extractEntity(text);

        if (value === null || value.length != 1) {
          await this.talk("Por favor, digite um valor monetário.");
          return await this.hear(step, kind, args);
        }

        result = value;
      }
      else if (kind === "mobile") {
        const locale = step.context.activity.locale;
        let phoneNumber;
        try {
          phoneNumber = phone(text, 'BRA')[0]; // TODO: Use accordingly to the person.
          phoneNumber = phoneUtil.parse(phoneNumber);
        } catch (error) {
          await this.talk(Messages[locale].validation_enter_valid_mobile);

          return await this.hear(step, kind, args);
        }
        if (!phoneUtil.isPossibleNumber(phoneNumber)) {
          await this.talk("Por favor, digite um número de telefone válido.");
          return await this.hear(step, kind, args);
        }

        result = phoneNumber;

      }
      else if (kind === "zipcode") {
        const extractEntity = text => {

          text = text.replace(/\-/gi, '');

          if (step.context.locale === 'en') { // TODO: Change to user.
            return text.match(/\d{8}/gi);
          }
          else {
            return text.match(/(?:\d{1,3}.)*\d{1,3}(?:\,\d+)?/gi);

          }
        };

        const value = extractEntity(text);

        if (value === null || value.length != 1) {
          await this.talk("Por favor, digite um valor monetário.");
          return await this.hear(step, kind, args);
        }

        result = value[0];

      }
      else if (kind === "menu") {

        const list = args;
        result = null;
        await CollectionUtil.asyncForEach(list, async item => {
          if (GBConversationalService.kmpSearch(text, item) != -1) {
            result = item;
          }
        });

        if (result === null) {
          await this.talk(`Escolha por favor um dos itens sugeridos.`);
          return await this.hear(step, kind, args);
        }
      }
      else if (kind === "language") {

        result = null;

        const list = [
          { name: 'english', code: 'en' },
          { name: 'inglês', code: 'en' },
          { name: 'portuguese', code: 'pt' },
          { name: 'português', code: 'pt' },
          { name: 'français', code: 'fr' },
          { name: 'francês', code: 'fr' },
          { name: 'french', code: 'fr' },
          { name: 'spanish', code: 'es' },
          { name: 'espanõl', code: 'es' },
          { name: 'espanhol', code: 'es' },
          { name: 'german', code: 'de' },
          { name: 'deutsch', code: 'de' },
          { name: 'alemão', code: 'de' }
        ];

        const text = step.context.activity['originalText'];

        await CollectionUtil.asyncForEach(list, async item => {
          if (GBConversationalService.kmpSearch(text.toLowerCase(), item.name.toLowerCase()) != -1 ||
            GBConversationalService.kmpSearch(text.toLowerCase(), item.code.toLowerCase()) != -1) {
            result = item.code;
          }
        });

        if (result === null) {
          await this.min.conversationalService.sendText(this.min, step, `Escolha por favor um dos idiomas sugeridos.`);
          return await this.hear(step, kind, args);
        }
      }
      return result;
    } catch (error) {
      GBLog.error(`BASIC RUNTIME ERR HEAR ${error.message ? error.message : error}\n Stack:${error.stack}`);
    }
  }

  /**
   * Prepares the next dialog to be shown to the specified user.
   */
  public async gotoDialog(step, fromOrDialogName: string, dialogName: string) {
    if (dialogName) {
      if (dialogName.charAt(0) === '/') {
        await step.beginDialog(fromOrDialogName);
      } else {
        let sec = new SecService();
        let user = await sec.getUserFromSystemId(fromOrDialogName);
        if (!user) {
          user = await sec.ensureUser(this.min.instance.instanceId, fromOrDialogName,
            fromOrDialogName, null, 'whatsapp', 'from', null);
        }
        await sec.updateUserHearOnDialog(user.userId, dialogName);
      }
    }
    else {
      await step.beginDialog(fromOrDialogName);
    }
  }


  /**
   * Talks to the user by using the specified text.
   */
  public async talk(text: string) {
    GBLog.info(`BASIC: TALK '${text}'.`);
    const translate = this.user ? this.user.basicOptions.translatorOn : false;
    // TODO: Translate.


    await this.min.conversationalService['sendOnConversation'](this.min,
      this.user.systemUser, text);
  }

  private static getChannel(step): string {
    if (!step) return 'whatsapp';
    if (!isNaN(step.context.activity['mobile'])) {
      return 'webchat';
    } else {
      if (step.context.activity.from && !isNaN(step.context.activity.from.id)) {
        return 'w}, 0);hatsapp';
      }
      return 'webchat';
    }
  }


  /**
   * Processes the sending of the file.
   */
  private async internalSendFile(step, mobile, filename, caption) {

    // Handles SEND FILE TO mobile, element in Web Automation.

    const element = filename._page ? filename._page : (filename.screenshot ? filename : null);

    if (element) {
      const gbaiName = `${this.min.botId}.gbai`;
      const localName = Path.join('work', gbaiName, 'cache', `img${GBAdminService.getRndReadableIdentifier()}.jpg`);
      await element.screenshot({ path: localName, fullPage: true });

      const url = urlJoin(
        GBServer.globals.publicAddress,
        this.min.botId,
        'cache',
        Path.basename(localName)
      );

      GBLog.info(`BASIC: WebAutomation: Sending the file ${url} to mobile ${mobile}.`);
      await this.min.conversationalService.sendFile(this.min, step, mobile, url, caption);
    }

    // Handles Markdown.

    else if (filename.indexOf('.md') > -1) {
      GBLog.info(`BASIC: Sending the contents of ${filename} markdown to mobile ${mobile}.`);
      const md = await this.min.kbService.getAnswerTextByMediaName(this.min.instance.instanceId, filename);
      if (!md) {
        GBLog.info(`BASIC: Markdown file ${filename} not found on database for ${this.min.instance.botId}.`);
      }

      await this.min.conversationalService['playMarkdown'](this.min, md,
        DialogKeywords.getChannel(step), step, mobile);

    } else {
      GBLog.info(`BASIC: Sending the file ${filename} to mobile ${mobile}.`);
      let url;
      if (!filename.startsWith("https://")) {
        url = urlJoin(
          GBServer.globals.publicAddress,
          'kb',
          `${this.min.botId}.gbai`,
          `${this.min.botId}.gbkb`,
          'assets',
          filename
        );
      }
      else {
        url = filename;
      }

      await this.min.conversationalService.sendFile(this.min, step, mobile, url, caption);
    }
  }

  public async getQRCode(text) {
    const img = await qrcode.toDataURL(text);
    const data = img.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(data, "base64");
    return buf;
  }
}