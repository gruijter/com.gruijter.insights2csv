/* eslint-disable no-await-in-loop */

/*
Copyright 2017 - 2026 Robin de Gruijter

This file is part of com.gruijter.insights2csv.

com.gruijter.insights2csv is free software: you can redistribute it and/or
modify it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.insights2csv is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along
with com.gruijter.insights2csv. If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const fs = require('fs');
const util = require('util');
const archiver = require('archiver');
const SMB2 = require('@tryjsky/v9u-smb2');
// eslint-disable-next-line import/no-unresolved, node/no-missing-require
const { createClient } = require('webdav');
const ftp = require('basic-ftp');
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved, node/no-missing-require
const SftpClient = require('ssh2-sftp-client');

const Logger = require('./captureLogs');

const setTimeoutPromise = util.promisify(setTimeout);

// ============================================================
// Some helper functions here

const JSDateToExcelDate = (inDate) => {
  // convert to yyyy-MM-dd HH:mm:ss
  const dateTime = inDate.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  return dateTime;
};

class App extends Homey.App {

  async log2csv(logEntries, log) {
    try {
      const meta = {
        entries: logEntries.values.length,
      };
      Object.keys(logEntries).forEach((key) => {
        if (key === 'values') return;
        meta[key] = logEntries[key];
      });

      const delimiter = ';';
      const LocalDateTime = this.IncludeLocalDateTime.includeLocalDateTime ? `${delimiter}Local datetime` : '';
      let { id } = logEntries;
      if (id.includes(':')) {
        id = id.split(':').pop();
      }
      if (log.ownerUri === 'homey:manager:logic') id = log.title;

      const header = `Zulu dateTime${delimiter}${id}${LocalDateTime}\r\n`;
      let csv = header;
      for (let i = 0; i < logEntries.values.length; i += 1) {
        if (i > 0 && i % 250 === 0) await new Promise((resolve) => setImmediate(resolve));
        const entry = logEntries.values[i];
        const time = JSDateToExcelDate(new Date(entry.t));
        const value = JSON.stringify(entry.v).replace('.', ',');
        if (this.IncludeLocalDateTime.includeLocalDateTime) entry.tLocal = this.dateFormatter.format(new Date(entry.t));
        csv += `${time}${delimiter}${value}${this.IncludeLocalDateTime.includeLocalDateTime ? delimiter + entry.tLocal : ''}\r\n`;
      }
      return { csv, meta }; // csv is string. meta is object.
    } catch (error) {
      return error;
    }
  }

  async onInit() {
    try {
      if (!this.logger) this.logger = new Logger({ name: 'log', length: 200, homey: this.homey });

      if (process.env.DEBUG === '1' || false) {
        try {
          // eslint-disable-next-line global-require, node/no-unsupported-features/node-builtins
          require('inspector').waitForDebugger();
        } catch (error) {
          // eslint-disable-next-line global-require, node/no-unsupported-features/node-builtins
          require('inspector').open(9325, '0.0.0.0', true);
        }
      }

      // generic properties
      this.homeyAPI = undefined;
      this.devices = {};
      this.logs = [];
      this.allNames = [];
      this.smb2Client = {};
      this.webdavClient = {};
      this.FTPClient = {};
      this.webdavSettings = {};
      this.smbSettings = {};
      this.FTPSettings = {};
      this.CPUSettings = {};
      this.WaitBetweenEntities = {};
      this.OnlyZipWithLogs = {};
      this.resolutionSelection = ['lastHour', 'last6Hours', 'last24Hours', 'last7Days', 'last14Days', 'last31Days',
        'last2Years', 'today', 'thisWeek', 'thisMonth', 'thisYear', 'yesterday', 'lastWeek', 'lastMonth', 'lastYear'];

      // queue properties
      this.abort = false;
      this.queue = [];
      this.queueRunning = false;

      // register some listeners
      process.on('unhandledRejection', (error) => {
        this.error('unhandledRejection! ', error);
      });
      process.on('uncaughtException', (error) => {
        this.error('uncaughtException! ', error);
      });
      this.homey
        .on('unload', () => {
          this.log('app unload called');
          // save logs to persistant storage
          this.logger.saveLogs();
        })
        .on('memwarn', () => {
          this.log('memwarn!');
          // global.gc();
        })
        .on('cpuwarn', () => {
          this.log('cpuwarn!');
        });
      this.homey.settings.on('set', (key) => {
        this.log(`${key} changed from frontend`);
        // this.FTPsettingsHaveChanged = true;
      });

      // ==============FLOW CARD STUFF======================================
      const archiveAllAction = this.homey.flow.getActionCard('archive_all');
      archiveAllAction
        .registerRunListener(async (args) => {
          this.log(`Exporting all insights ${args.resolution}`);
          this.exportAll(args.resolution);
          return true;
        });

      const archiveAppAction = this.homey.flow.getActionCard('archive_app');
      archiveAppAction
        .registerRunListener(async (args) => {
          this.exportApp(args.selectedApp.id, args.resolution);
          return true;
        })
        .registerArgumentAutocompleteListener(
          'selectedApp',
          async (query) => {
            const results = this.allNames.filter((result) => { // filter for query on appId and appName
              const appIdFound = result.id.toLowerCase().indexOf(query.toLowerCase()) > -1;
              const appNameFound = result.name.toLowerCase().indexOf(query.toLowerCase()) > -1;
              return appIdFound || appNameFound;
            });
            return results;
          },
        );

      const purgeAction = this.homey.flow.getActionCard('purge');
      purgeAction
        .registerRunListener((args) => {
          this.log(`Deleting old data on ${args.storage}`);
          if (args.storage === 'FTP') {
            this.purgeFTP(args.daysOld, args.types === 'allTypes');
          }
          if (args.storage === 'SMB') {
            this.purgeSMB(args.daysOld, args.types === 'allTypes');
          }
          return true;
        });

      const archiveAllTypeFolderAction = this.homey.flow.getActionCard('archive_all_type_folder');
      archiveAllTypeFolderAction
        .registerRunListener(async (args) => {
          this.log(`Exporting all insights ${args.resolution} of type ${args.type} into subfolder ${args.subfolder} `);
          this.exportAll(args.resolution, args.type === 'all' ? undefined : args.type, args.subfolder && args.subfolder !== 'undefined' ? args.subfolder : undefined);
          return true;
        });

      const archiveAppTypeFolderAction = this.homey.flow.getActionCard('archive_app_type_folder');
      archiveAppTypeFolderAction
        .registerRunListener(async (args) => {
          this.exportApp(args.selectedApp.id, args.resolution, null, true, args.type === 'all' ? undefined : args.type, args.subfolder && args.subfolder !== 'undefined' ? args.subfolder : undefined);
          return true;
        })
        .registerArgumentAutocompleteListener(
          'selectedApp',
          async (query) => {
            const results = this.allNames.filter((result) => { // filter for query on appId and appName
              const appIdFound = result.id.toLowerCase().indexOf(query.toLowerCase()) > -1;
              const appNameFound = result.name.toLowerCase().indexOf(query.toLowerCase()) > -1;
              return appIdFound || appNameFound;
            });
            return results;
          },
        );

      this.deleteAllFiles();
      // Do not await this, otherwise it blocks app initialization and API requests!
      this.initExport(new Date()).catch((err) => this.error(err));

      // initiate test stuff from here
      this.test();

      this.log('ExportInsights App is running!');
    } catch (error) {
      this.error(error);
    }
  }

  // ============================================================
  // do the stuff from here
  async test() {
    try {
      // await this.exportApp('weather', 'lastHour');
      // await this.exportApp('com.gruijter.enelogic', 'last24Hours');
      // await this.exportAll('last2Years');
      // this.purgeSMB();
    } catch (error) {
      this.error(error);
    }
  }

  // ============================================================
  // stuff for queue handling here
  async enQueue(item) {
    this.queue.push(item);
    if (!this.queueRunning) {
      this.queueRunning = true;
      this.runQueue();
    }
  }

  deQueue() {
    return this.queue.shift();
  }

  flushQueue() {
    this.queue = [];
    this.queueRunning = false;
    this.log('Export queue is flushed');
  }

  async runQueue() {
    this.queueRunning = true;
    const item = this.deQueue();
    if (item) {
      await this._exportApp(item.appId, item.resolution, item.date, item.type, item.subfolder)
        .catch(this.error);
      // wait a bit to reduce cpu and mem load?
      await setTimeoutPromise(this.CPUSettings && this.CPUSettings.lowCPU ? 10 * 1000 : 1, 'waiting is done');
      this.runQueue();
    } else {
      this.queueRunning = false;
      this.log('Finshed all exports');
    }
  }

  // ============================================================
  // stuff for frontend API here
  deleteLogs() {
    return this.logger.deleteLogs();
  }

  getLogs() {
    return this.logger.logArray;
  }

  _handleSmbError(error) {
    let msg = 'Unknown SMB Error';
    if (error && error.header && error.header.status !== undefined) {
      const statusHex = (error.header.status >>> 0).toString(16).toUpperCase();
      msg = `SMB Error 0x${statusHex}`;
      if (statusHex === 'C000006D') msg += ' : STATUS_LOGON_FAILURE (Check Username/Password/Domain)';
      else if (statusHex === 'C0000022') msg += ' : STATUS_ACCESS_DENIED';
      else if (statusHex === 'C00000CC') msg += ' : STATUS_BAD_NETWORK_NAME (Check Share Name)';
    } else if (error instanceof Error) {
      msg = error.message;
    } else {
      msg = String(error);
    }
    this.error(msg);
    throw new Error(msg); // Guarantee pure Error objects to prevent IPCSocket BigInt crashes
  }

  async testSmb(smbSettings) {
    this.log('testing SMB settings from frontend');
    return new Promise((resolve, reject) => {
      try {
        const resolvedDomain = (smbSettings.smbDomain !== undefined && smbSettings.smbDomain.toUpperCase() !== 'DOMAIN') ? smbSettings.smbDomain.trim() : '';
        const resolvedUsername = smbSettings.smbUsername ? smbSettings.smbUsername.trim() : '';

        const smbOptions = {
          share: smbSettings.smbShare.replace(/\//gi, '\\'),
          domain: resolvedDomain,
          username: resolvedUsername,
          password: smbSettings.smbPassword || '',
          port: smbSettings.smbPort || 445,
          autoCloseTimeout: 10000,
        };

        const smb2Client = new SMB2(smbOptions);

        let path = `${smbSettings.smbPath.replace(/\//gi, '\\')}\\`;
        if (smbSettings.smbPath === '') {
          path = '';
        }

        smb2Client.writeFile(`${path}insights2csv.txt`, 'Homey can write to this folder!', { flag: 'w' }, (error) => {
          if (error) {
            try {
              this._handleSmbError(error);
            } catch (e) {
              reject(e);
            }
          } else {
            this.log('Connection successfull!');
            smb2Client.disconnect();
            resolve(true);
          }
        });
      } catch (error) {
        try {
          this._handleSmbError(error);
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  async testWebdav(webdavSettings) {
    this.log('testing WebDAV settings from frontend');
    try {
      const webdavClient = createClient(
        webdavSettings.webdavUrl,
        {
          username: webdavSettings.webdavUsername,
          password: webdavSettings.webdavPassword,
        },
      );
      await webdavClient.putFileContents('insights2csv.txt', 'Homey can write to this folder!');
      const quota = await webdavClient.getQuota();
      this.log('Connection successfull!');
      return Promise.resolve(quota);
    } catch (error) {
      this.error(error);
      return Promise.reject(error);
    }
  }

  async testFTP(FTPSettings) {
    this.log('testing FTP settings from frontend');
    try {
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        await sftp.connect({
          host: FTPSettings.FTPHost,
          port: FTPSettings.FTPPort || 22,
          username: FTPSettings.FTPUsername,
          password: FTPSettings.FTPPassword,
        });
        await sftp.mkdir(`/${FTPSettings.FTPFolder}`, true);
        this.log('Connection successfull!');
        await sftp.end();
      } else {
        const client = new ftp.Client();
        client.ftp.verbose = true;
        await client.access({
          host: FTPSettings.FTPHost,
          port: FTPSettings.FTPPort || 21,
          user: FTPSettings.FTPUsername,
          password: FTPSettings.FTPPassword,
          secure: protocol === 'ftps',
          secureOptions: { rejectUnauthorized: false },
        });
        await client.ensureDir(FTPSettings.FTPFolder);
        // console.log(await client.list());
        this.log('Connection successfull!');
        client.close();
      }
      return Promise.resolve();
    } catch (error) {
      this.error(error);
      return Promise.reject(error);
    }
  }

  getResolutions() {
    return this.resolutionSelection;
  }

  getAppList() {
    return this.allNames;
  }

  async exportAll(resolution, type, subfolder) {
    const date = new Date();
    await this.initExport(date);
    this.allNames.forEach((name) => {
      this.exportApp(name.id, resolution, date, false, type, subfolder);
    });
    return true;
  }

  async exportApp(appId, resolution, _date, reload, type, subfolder) {
    // date = date || new Date();
    const date = new Date();
    if (reload !== false) await this.initExport(date);
    this.enQueue({
      appId, resolution, date, type, subfolder,
    });
    return true;
  }

  stopExport() {
    if (this.queueRunning) this.log('aborting export');
    this.abort = true;
    this.flushQueue();
    return true;
  }

  // ============================================================
  // Local file handling in app userdata folder
  deleteAllFiles() {
    fs.readdir('/userdata/', (err, res) => {
      if (err) {
        return this.log(err);
      }
      res.forEach((elem) => {
        if (elem !== 'log.json') {
          fs.unlink(`/userdata/${elem}`, (error) => {
            if (error) {
              this.log(error);
            } else {
              this.log(`deleted ${elem}`);
            }
          });
        }
      });
      return this.log('all local files deleted');
    });
  }

  deleteFile(filename) {
    fs.unlink(`/userdata/${filename}`, (error) => {
      if (error) {
        this.log(error);
      }
      // else { this.log(`deleted ${filename}`); }
    });
  }

  // ============================================================
  // Homey API stuff here
  async loginHomeyApi() {
    if (this.homeyAPI) return this.homeyAPI;
    // Authenticate against the current Homey.
    this.homeyAPI = await HomeyAPI.createAppAPI({ homey: this.homey });
    return this.homeyAPI;
  }

  async getAllLogs() {
    this.logs = Object.values(await this.homeyAPI.insights.getLogs({ $timeout: 60000 }));
    return this.logs;
  }

  async getAllDevices() {
    this.devices = await this.homeyAPI.devices.getDevices({ $timeout: 60000 });
    return this.devices;
  }

  // Get a list of all app names
  async getAppNameList() {
    const allApps = await this.homeyAPI.apps.getApps({ $timeout: 60000 });
    const mappedArray = Object.entries(allApps).map((app) => {
      const map = {
        id: app[1].id,
        name: app[1].name,
        icon: `${app[1].id}${app[1].icon}`,
        type: 'app',
      };
      return map;
    });
    return mappedArray;
  }

  // Get a list of all logged manager names
  async getManagerNameList() {
    // eslint-disable-next-line prefer-destructuring
    const logs = this.logs; // Object.values(await this.homeyAPI.insights.getLogs({ $timeout: 60000 }));
    const list = logs.filter((log) => {
      const uri = log.uri || log.ownerUri || '';
      return uri.startsWith('homey:manager:');
    })
      .map((log) => {
        const uri = log.uri || log.ownerUri || '';
        const ids = uri.split(':');
        const id = ids.pop();

        const name = id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Unknown';
        if (!name) return null;
        const _app = {
          id,
          name,
          icon: '',
          type: ids[1] || 'manager',
        };
        return _app;
      });
    const uniqueList = list.filter((elem, index) => elem && index === list.findIndex((obj) => JSON.stringify(obj) === JSON.stringify(elem)));
    return uniqueList;
  }

  async getAllNames() {
    const managerNameList = await this.getManagerNameList();
    const appNameList = await this.getAppNameList();
    this.allNames = appNameList.concat(managerNameList);
    return this.allNames;
  }

  async getAppRelatedLogs(appId, type) {
    this.log(`getting logs related to ${appId}`);
    const appUri = `homey:app:${appId}`;
    const managerUri = `homey:manager:${appId}`;

    const relatedDeviceUris = new Set();
    Object.keys(this.devices).forEach((key) => {
      const device = this.devices[key];
      // Use driverId instead of the deprecated driverUri
      if (device.ownerUri === appUri || (device.driverId && device.driverId.startsWith(appUri))) {
        relatedDeviceUris.add(`homey:device:${device.id}`);
      }
    });

    const appRelatedLogs = [];
    for (let i = 0; i < this.logs.length; i += 1) {
      if (i > 0 && i % 1000 === 0) await new Promise((resolve) => setImmediate(resolve));
      const log = this.logs[i];
      if (type && log.type !== type) continue;

      const uri = log.uri || log.ownerUri;
      if (uri === appUri || uri === managerUri || relatedDeviceUris.has(uri)) {
        appRelatedLogs.push(log);
      } else if (log.ownerUri && (log.ownerUri === appUri || log.ownerUri === managerUri || relatedDeviceUris.has(log.ownerUri))) {
        appRelatedLogs.push(log);
      }
    }

    return appRelatedLogs;
  }

  /**
   *
   * @param {*} log
   * @param {*} resolution
   * @param {Date} date
   * @returns
   */
  async getLogEntries(log, resolution, date) {
    try {
      const opts = {
        uri: (log.uri || log.ownerUri),
        id: log.id,
        $timeout: 90000,
      };
      if (log.type !== 'boolean') {
        opts.resolution = resolution;
      }
      const logEntries = await this.homeyAPI.insights.getLogEntries(opts);
      if (log.type === 'boolean') {
        // const date = new Date();
        const dateTimezoned = new Date(this.enDateFormatter.format(date));
        const hourOffset = date.getHours() - dateTimezoned.getHours();

        let _dateFrom = null;
        let _dateTo = new Date(date);
        let exclusiveEnd = false;

        const applyOffset = (dt) => new Date(dt.getTime() + hourOffset * 60 * 60 * 1000);
        const y = dateTimezoned.getFullYear();
        const m = dateTimezoned.getMonth();
        const d = dateTimezoned.getDate();
        const day = dateTimezoned.getDay();

        switch (resolution) {
          case 'lastHour':
            _dateFrom = new Date(date.getTime() - 60 * 60 * 1000);
            break;
          case 'last6Hours':
            _dateFrom = new Date(date.getTime() - 6 * 60 * 60 * 1000);
            break;
          case 'last24Hours':
            _dateFrom = new Date(date.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'last7Days':
            _dateFrom = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'last14Days':
            _dateFrom = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000);
            break;
          case 'last31Days':
            _dateFrom = new Date(date.getTime() - 31 * 24 * 60 * 60 * 1000);
            break;
          case 'today':
            _dateFrom = applyOffset(new Date(y, m, d));
            break;
          case 'yesterday':
            _dateFrom = applyOffset(new Date(y, m, d - 1));
            _dateTo = applyOffset(new Date(y, m, d));
            exclusiveEnd = true;
            break;
          case 'thisWeek':
            _dateFrom = applyOffset(new Date(y, m, d - (day - 1)));
            break;
          case 'lastWeek':
            _dateFrom = applyOffset(new Date(y, m, d - (day - 1) - 7));
            _dateTo = applyOffset(new Date(y, m, d - (day - 1)));
            exclusiveEnd = true;
            break;
          case 'thisMonth':
            _dateFrom = applyOffset(new Date(y, m, 1));
            break;
          case 'lastMonth':
            _dateFrom = applyOffset(new Date(y, m - 1, 1));
            _dateTo = applyOffset(new Date(y, m, 1));
            exclusiveEnd = true;
            break;
          case 'thisYear':
            _dateFrom = applyOffset(new Date(y, 0, 1));
            break;
          case 'lastYear':
            _dateFrom = applyOffset(new Date(y - 1, 0, 1));
            _dateTo = applyOffset(new Date(y, 0, 1));
            exclusiveEnd = true;
            break;
          case 'last2Years':
            _dateFrom = new Date(new Date(date).setFullYear(date.getFullYear() - 2));
            break;
          default:
            throw new Error(`invalid resolution: ${resolution}`);
        }

        logEntries.values = logEntries.values.filter((x) => {
          const t = new Date(x.t).getTime();
          if (_dateFrom && t < _dateFrom.getTime()) return false;
          if (_dateTo) {
            if (exclusiveEnd && t >= _dateTo.getTime()) return false;
            if (!exclusiveEnd && t > _dateTo.getTime()) return false;
          }
          return true;
        });
      }
      if (logEntries.values.length > 2925) {
        this.error(`Insights data is corrupt and will be truncated to the first 2925 records for ${log.uri || log.ownerUri} ${logEntries.id}.`);
        //  ${logEntries.uri}`);
        logEntries.values = logEntries.values.slice(0, 2925);
        await setTimeoutPromise(this.CPUSettings && this.CPUSettings.lowCPU ? 10 * 1000 : 1, 'waiting is done');
      }
      return logEntries;
    } catch (error) {
      await setTimeoutPromise(this.CPUSettings && this.CPUSettings.lowCPU ? 10 * 1000 : 1, 'waiting is done');
      throw error;
    }
  }

  async initExport(date) {
    this.abort = false;
    this.webdavSettings = this.homey.settings.get('webdavSettings');
    this.smbSettings = this.homey.settings.get('smbSettings');
    this.FTPSettings = this.homey.settings.get('FTPSettings');
    this.CPUSettings = this.homey.settings.get('CPUSettings');
    this.timeZone = this.homey.clock.getTimezone();
    this.locale = await this.homey.i18n.getLanguage();
    this.dateFormatter = new Intl.DateTimeFormat(this.locale, {
      timeZone: this.timeZone,
      // dateStyle: 'medium',
      // timeStyle: 'medium',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    this.enDateFormatter = new Intl.DateTimeFormat('en', {
      timeZone: this.timeZone,
      // dateStyle: 'medium',
      // timeStyle: 'medium',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    // this.WaitBetweenEntities = this.homey.settings.get('WaitBetweenEntities');
    // if (!this.WaitBetweenEntities) {
    // this.WaitBetweenEntities = { waitBetweenEntities: 0 };
    // this.homey.settings.set('WaitBetweenEntities', this.WaitBetweenEntities);
    // }
    // if (typeof (this.WaitBetweenEntities.waitBetweenEntities) == 'string') this.WaitBetweenEntities.waitBetweenEntities = Number.parseInt(this.WaitBetweenEntities.waitBetweenEntities);

    this.OnlyZipWithLogs = this.homey.settings.get('OnlyZipWithLogs');
    if (!this.OnlyZipWithLogs) {
      this.OnlyZipWithLogs = { onlyZipWithLogs: false };
      this.homey.settings.set('OnlyZipWithLogs', this.OnlyZipWithLogs);
    }

    this.IncludeLocalDateTime = this.homey.settings.get('IncludeLocalDateTime');
    if (!this.IncludeLocalDateTime) {
      this.IncludeLocalDateTime = { includeLocalDateTime: false };
      this.homey.settings.set('IncludeLocalDateTime', this.IncludeLocalDateTime);
    }

    if (this.CPUSettings && this.CPUSettings.lowCPU) this.log('Low CPU load selected for export');
    this.timestamp = date.toISOString()
      .replace(/:/g, '') // delete :
      .replace(/-/g, '') // delete -
      .replace(/\..+/, 'Z'); // delete the dot and everything after
    await this.loginHomeyApi();
    await this.getAllLogs();
    await this.getAllDevices();
    await this.getAllNames();
    return true;
  }

  // ============================================================
  // WebDAV file handling here
  getWebdavClient() {
    try {
      this.webdavClient = createClient(
        this.webdavSettings.webdavUrl,
        {
          username: this.webdavSettings.webdavUsername,
          password: this.webdavSettings.webdavPassword,
        },
      );
      return Promise.resolve(this.webdavClient);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // save a file to WebDAV as promise; resolves webdav filename
  async saveWebDav(fileName, subfolder) { // filename is appId
    try {
      await this.getWebdavClient();
      const folder = subfolder ? `/${subfolder}` : '';
      let webdavFileName = `${folder}/${fileName}`;
      // save to seperate folder when selected by user
      if (this.webdavSettings.webdavUseSeperateFolders) {
        await this.webdavClient.createDirectory(`${folder}/${this.timestamp}/`)
          .then(() => {
            this.log(`${this.timestamp} folder created!`);
          })
          .catch(() => null);
        webdavFileName = `${folder}/${this.timestamp}/${fileName}`;
      }
      const options = {
        format: 'binary',
        overwrite: true,
      };
      const webDavWriteStream = this.webdavClient.createWriteStream(webdavFileName, options);
      const fileStream = fs.createReadStream(`/userdata/${fileName}`);
      return new Promise((resolve, reject) => {
        let isDone = false;

        webDavWriteStream.on('finish', () => {
          this.log(`${fileName} has been saved to webDav`);
          if (!isDone) {
            isDone = true;
            resolve(fileName);
          }
        });

        webDavWriteStream.on('error', (err) => {
          this.error('webdavwritestream error: ', err.message || err);
          if (!isDone) {
            isDone = true;
            reject(err);
          }
        });

        fileStream.on('error', (err) => {
          this.log('filestream error: ', err);
          if (!isDone) {
            isDone = true;
            reject(err);
          }
        });

        // pipe handles auto-ending the webDavWriteStream
        fileStream.pipe(webDavWriteStream);
      });

    } catch (error) {
      // this.error('error:', error);
      return Promise.reject(error);
    }
  }

  // ============================================================
  // SMB file handling here

  // create SMB client
  getSmb2Client() {
    try {
      const resolvedDomain = (this.smbSettings.smbDomain !== undefined && this.smbSettings.smbDomain.toUpperCase() !== 'DOMAIN') ? this.smbSettings.smbDomain.trim() : 'WORKGROUP';
      const smbOptions = {
        share: this.smbSettings.smbShare.replace(/\//gi, '\\'),
        domain: resolvedDomain,
        username: this.smbSettings.smbUsername ? this.smbSettings.smbUsername.trim() : '',
        password: this.smbSettings.smbPassword || '',
        port: this.smbSettings.smbPort || 445,
        autoCloseTimeout: 10000,
      };
      this.smb2Client = new SMB2(smbOptions);
      return Promise.resolve(this.smb2Client);
    } catch (error) {
      return this._handleSmbError(error);
    }
  }

  // save a file to a network share via SMB as promise; resolves smb2 filename
  async saveSmb(fileName, subfolder) {
    await this.getSmb2Client();
    const folder = subfolder ? `${subfolder}\\` : '';
    let path = `${this.smbSettings.smbPath.replace(/\//gi, '\\')}\\${folder}`;
    if (this.smbSettings.smbPath === '') {
      path = `${folder}`;
    }

    if (this.smbSettings.smbUseSeperateFolders) {
      path = `${path}${this.timestamp}\\`;
      if (this.smbSettings.smbPath === '') {
        path = `${this.timestamp}\\`;
      }
      const folderExists = await new Promise((resolve, reject) => {
        this.smb2Client.exists(path, (error, exists) => {
          if (error) reject(error);
          resolve(exists);
        });
      });
      if (!folderExists) {
        await new Promise((res, rej) => {
          this.smb2Client.mkdir(path, (err) => {
            if (err) rej(err);
            this.log(`${path} folder created!`);
            res(true);
          });
        });
      }
    }

    return new Promise((resolve, reject) => {
      this.smb2Client.createWriteStream(`${path}${fileName}`, { flag: 'w' }, (error, smbWriteStream) => {
        if (error) {
          this.error(error);
          reject(error);
          return;
        }
        const fileStream = fs.createReadStream(`/userdata/${fileName}`);
        let isDone = false;

        smbWriteStream.on('finish', () => {
          this.log(`${fileName} has been saved to SMB2`);
          if (!isDone) {
            isDone = true;
            resolve(fileName);
          }
        });

        smbWriteStream.on('error', (err) => {
          if (err.code === 'STATUS_FILE_CLOSED') {
            // Ignore v9u-smb2 bug trying to double-close the file during auto-destroy
            return;
          }
          this.error('smbWriteStream error: ', err);
          if (!isDone) {
            isDone = true;
            reject(err);
          }
        });

        fileStream.on('error', (err) => {
          this.log('filestream error: ', err);
          if (!isDone) {
            isDone = true;
            reject(err);
          }
        });

        // pipe handles auto-ending the smbWriteStream
        fileStream.pipe(smbWriteStream);
      });
    });
  }

  // purge SMB folder
  async purgeSMB(daysOld, allTypes) {
    let selectList = [];
    await this.getSmb2Client();
    let path = `${this.smbSettings.smbPath.replace(/\//gi, '\\')}\\`;
    if (this.smbSettings.smbPath === '') {
      path = '';
    }

    return new Promise((resolve, reject) => {
      this.smb2Client.readdir(path, (err, files) => {
        if (err) {
          this.log('[DEBUG-SMB] readDirectory error. Skipping purge.', err.message);
          return resolve([]);
        }
        selectList = files || [];

        // select only zip files
        if (!allTypes) {
          selectList = selectList.filter((item) => {
            return item.toLowerCase().endsWith('.zip');
          });
        }
        // select older then daysOld
        selectList = selectList.filter((item) => {
          const match = item.match(/_(.*?)_/);
          if (!match) return false;
          let dateString = match[1];
          if (dateString.length !== 16) return false;
          const YYYY = dateString.substring(0, 4);
          const MM = dateString.substring(4, 6);
          const DD = dateString.substring(6, 8);
          const hh = dateString.substring(9, 11);
          const mm = dateString.substring(11, 13);
          const ss = dateString.substring(13, 15);
          dateString = `${YYYY}-${MM}-${DD}T${hh}:${mm}:${ss}Z`;
          const days = (Date.now() - new Date(dateString)) / 1000 / 60 / 60 / 24;
          return days > daysOld;
        });
        // delete the file or folder
        for (let idx = 0; idx < selectList.length; idx += 1) {
          const item = selectList[idx];
          this.log(`removing SMB file ${item}`);
          this.smb2Client.unlink(`${path}${item}`, (error) => {
            if (error) this.error(error);
          });
        }
        return resolve(selectList);
      });
    });
  }

  // ============================================================
  // FTP file handling here

  // create FTP client
  async getFTPClient() {
    try {
      if ((this.FTPClient.closed === false) && !this.FTPsettingsHaveChanged) {
        return Promise.resolve(this.FTPClient);
      }
      if (this.FTPClient instanceof ftp.Client) {
        this.log('closing FTP client');
        this.FTPClient.close();
      }
      this.FTPClient = new ftp.Client();
      // client.ftp.verbose = true;
      this.FTPsettingsHaveChanged = false;
      const protocol = this.FTPSettings.FTPProtocol || (this.FTPSettings.useSFTP ? 'ftps' : 'ftp');
      await this.FTPClient.access({
        host: this.FTPSettings.FTPHost,
        port: this.FTPSettings.FTPPort,
        user: this.FTPSettings.FTPUsername,
        password: this.FTPSettings.FTPPassword,
        secure: protocol === 'ftps',
        secureOptions: {
          host: this.FTPSettings.FTPHost,
          rejectUnauthorized: false,
        },
      });
      return Promise.resolve(this.FTPClient);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // save a file to a network share via FTP as promise; resolves FTP filename
  async saveFTP(fileName, subfolder) {
    try {
      const sub = subfolder ? `/${subfolder}` : '';
      const folder = `//${this.FTPSettings.FTPFolder}${sub}`;
      const fileStream = fs.createReadStream(`/userdata/${fileName}`);
      const protocol = this.FTPSettings.FTPProtocol || (this.FTPSettings.useSFTP ? 'ftps' : 'ftp');

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        await sftp.connect({
          host: this.FTPSettings.FTPHost,
          port: this.FTPSettings.FTPPort || 22,
          username: this.FTPSettings.FTPUsername,
          password: this.FTPSettings.FTPPassword,
        });
        const remoteDir = `/${this.FTPSettings.FTPFolder}${sub}${this.FTPSettings.FTPUseSeperateFolders ? `/${this.timestamp}` : ''}`;
        await sftp.mkdir(remoteDir, true);
        await sftp.put(fileStream, `${remoteDir}/${fileName}`);
        this.log(`${fileName} has been saved to SFTP`);
        await sftp.end();
      } else {
        await this.getFTPClient();
        await this.FTPClient.ensureDir(`//${folder}`);
        if (this.FTPSettings.FTPUseSeperateFolders) {
          await this.FTPClient.ensureDir(`//${folder}/${this.timestamp}`);
        }
        await this.FTPClient.upload(fileStream, fileName);
        this.log(`${fileName} has been saved to FTP(S)`);
      }
      return Promise.resolve(fileName);
    } catch (error) {
      this.error('error:', error);
      return Promise.reject(error);
    }
  }

  // purge FTP folder
  async purgeFTP(daysOld, allTypes) {
    try {
      const protocol = this.FTPSettings.FTPProtocol || (this.FTPSettings.useSFTP ? 'ftps' : 'ftp');
      let selectList = [];

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        await sftp.connect({
          host: this.FTPSettings.FTPHost,
          port: this.FTPSettings.FTPPort || 22,
          username: this.FTPSettings.FTPUsername,
          password: this.FTPSettings.FTPPassword,
        });
        const remoteDir = `/${this.FTPSettings.FTPFolder}`;
        await sftp.mkdir(remoteDir, true);
        selectList = await sftp.list(remoteDir);

        if (!allTypes) {
          selectList = selectList.filter((item) => item.type === '-' && item.name.toLowerCase().endsWith('.zip'));
        }
        selectList = selectList.filter((item) => {
          // ssh2-sftp-client provides modifying time directly in milliseconds
          const days = (Date.now() - item.modifyTime) / 1000 / 60 / 60 / 24;
          return days > daysOld;
        });
        for (let idx = 0; idx < selectList.length; idx += 1) {
          const item = selectList[idx];
          if (item.type === '-') {
            this.log(`removing SFTP file ${item.name}`);
            await sftp.delete(`${remoteDir}/${item.name}`);
          } else if (item.type === 'd') {
            this.log(`removing SFTP folder ${item.name}`);
            await sftp.rmdir(`${remoteDir}/${item.name}`, true);
          }
        }
        await sftp.end();
      } else {
        await this.getFTPClient();
        await this.FTPClient.ensureDir(`//${this.FTPSettings.FTPFolder}`);
        selectList = await this.FTPClient.list();

        if (!allTypes) {
          selectList = selectList.filter((item) => item.type === 1 && item.name.toLowerCase().endsWith('.zip'));
        }
        selectList = selectList.filter((item) => {
          let dateString = item.date;
          if (dateString.length < 18) {
            const year = new Date().getFullYear();
            dateString = `${year} ${dateString}`;
          }
          const days = (Date.now() - new Date(dateString)) / 1000 / 60 / 60 / 24;
          return days > daysOld;
        });
        for (let idx = 0; idx < selectList.length; idx += 1) {
          const item = selectList[idx];
          if (item.type === 1) {
            this.log(`removing FTP file ${item.name}`);
            await this.FTPClient.remove(item.name);
          }
          if (item.type === 2) {
            this.log(`removing FTP folder ${item.name}`);
            await this.FTPClient.removeDir(item.name);
          }
        }
      }
      return Promise.resolve(selectList);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // ============================================================
  // ZIP handling here
  // zip all log entries from one app as promise; resolves zipfilename
  async zipAppLogs(appId, resolution, date, type) {
    // this.log(`Zipping all logs for ${appId}`);
    try {
      const logs = await this.getAppRelatedLogs(appId, type);
      if (this.OnlyZipWithLogs.onlyZipWithLogs && !logs.length) return null;

      // create a file to stream archive data to.
      const timeStamp = date.toISOString()
        .replace(/:/g, '') // delete :
        .replace(/-/g, '') // delete -
        .replace(/\..+/, ''); // delete the dot and everything after
      const fileName = `${appId}_${timeStamp}Z_${resolution}.zip`;
      const output = fs.createWriteStream(`/userdata/${fileName}`);
      const level = this.CPUSettings && this.CPUSettings.lowCPU ? 1 : 6;
      const archive = archiver('zip', {
        zlib: { level }, // Sets the compression level.
      });
      archive.pipe(output); // pipe archive data to the file
      // let written = false;
      for (let idx = 0; idx < logs.length; idx += 1) {
        if (!this.abort) {
          const log = logs[idx];
          const entries = await this.getLogEntries(log, resolution, date);
          // eslint-disable-next-line no-continue
          if (this.OnlyZipWithLogs.onlyZipWithLogs && !entries.values.length) continue;
          // written = true;
          const data = await this.log2csv(entries, log);
          const allMeta = Object.assign(data.meta, log);
          const ids = (log.ownerUri || log.uri).split(':');
          const id = ids.pop();
          const dev = this.devices[id];
          const app = dev ? null : this.allNames.find((x) => x.id === id);
          const name = (dev && dev.name) || (app && app.name) || id || 'Unknown';
          const fileNameCsv = `${name}/${(log.ownerId || log.id)}.csv`;
          const fileNameMeta = `${name}/${(log.ownerId || log.id)}_meta.json`;
          const fileNameJson = `${name}/${(log.ownerId || log.id)}.json`;
          // console.log(`zipping ${fileNameCsv} now ....`);
          archive.append(data.csv, { name: fileNameCsv });
          archive.append(JSON.stringify(allMeta), { name: fileNameMeta });
          archive.append(JSON.stringify(entries), { name: fileNameJson });
          if (this.CPUSettings && this.CPUSettings.lowCPU) await setTimeoutPromise(2 * 1000, 'waiting is done'); // relax Homey a bit...
          else await setTimeoutPromise(20, 'mini-waiting is done'); // relax Homey a bit...
        }
      }
      // this.log(`${logs.length} files zipped`);
      if (this.OnlyZipWithLogs.onlyZipWithLogs && !archive.pointer()) {
        archive.abort();
        output.close();
        fs.unlink(`/userdata/${fileName}`, (error) => {
          if (error) {
            this.log(error);
          } else {
            this.log(`deleted /userdata/${fileName}`);
          }
        });
        return null;
      }
      await archive.finalize();

      return new Promise((resolve, reject) => {
        output.on('close', () => { // when zipping and storing is done...
          this.log(`${logs.length} files zipped, ${archive.pointer()} total bytes`);
          // this.log(`${appId} has been zipped.`);
          return resolve(fileName);
        });
        output.on('error', (err) => { // when storing gave an error
          this.log('error saving zipfile');
          return reject(err);
        });
        archive.on('error', (err) => { // when zipping gave an error
          this.error(err);
        });
        archive.on('warning', (warning) => {
          this.log(warning);
        });
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async _exportApp(appId, resolution, _date, type, subfolder) {
    try {
      const date = new Date();
      const fileName = await this.zipAppLogs(appId, resolution, date, type);
      if (!fileName) return false;
      if (this.smbSettings && this.smbSettings.useSmb) {
        await this.saveSmb(fileName, subfolder);
      }
      if (this.webdavSettings && this.webdavSettings.useWebdav) {
        await this.saveWebDav(fileName, subfolder);
      }
      if (this.FTPSettings && this.FTPSettings.useFTP) {
        await this.saveFTP(fileName, subfolder);
      }
      this.deleteFile(fileName);
      // this.log(`Export of ${appId} finished`);
      return Promise.resolve(true);
    } catch (error) {
      return Promise.reject(error);
    }
  }

}

module.exports = App;
