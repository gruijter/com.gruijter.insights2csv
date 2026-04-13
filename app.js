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

const SmbHelper = require('./lib/SmbHelper');
const WebDavHelper = require('./lib/WebDavHelper');
const FtpHelper = require('./lib/FtpHelper');
const Logger = require('./lib/captureLogs');

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
        if (this.IncludeLocalDateTime.includeLocalDateTime) entry.tLocal = this.localDateFormatter.format(new Date(entry.t));
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
      this.webdavSettings = {};
      this.smbSettings = {};
      this.FTPSettings = {};
      this.CPUSettings = {};
      this.WaitBetweenEntities = {};
      this.OnlyZipWithLogs = {};
      this.resolutionSelection = ['lastHour', 'last6Hours', 'last24Hours', 'last7Days', 'last14Days', 'last31Days',
        'last2Years', 'today', 'thisWeek', 'thisMonth', 'thisYear', 'yesterday', 'lastWeek', 'lastMonth', 'lastYear'];

      this.smbHelper = new SmbHelper(this);
      this.webdavHelper = new WebDavHelper(this);
      this.ftpHelper = new FtpHelper(this);

      // queue properties
      this.abort = false;
      this.queue = [];
      this.queueRunning = false;

      // register some listeners
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
            this.ftpHelper.purge(args.daysOld, args.types === 'allTypes', this.FTPSettings);
          }
          if (args.storage === 'SMB') {
            this.smbHelper.purge(args.daysOld, args.types === 'allTypes', this.smbSettings);
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

      this.exportFinishedTrigger = this.homey.flow.getTriggerCard('export_finished');

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

      const durationMs = this.exportStartTime ? Date.now() - this.exportStartTime : 0;
      const durationSec = Math.round(durationMs / 1000);
      const status = this.abort ? 'Aborted' : 'Success';
      this.exportFinishedTrigger.trigger({
        duration: durationSec,
        status,
        resolution: this.exportResolution || '',
        identifier: this.exportIdentifier || '',
        timestamp: this.timestamp || '',
      }).catch(this.error);
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

  async testSmb(smbSettings) {
    return this.smbHelper.test(smbSettings);
  }

  async testWebdav(webdavSettings) {
    return this.webdavHelper.test(webdavSettings);
  }

  async testFTP(FTPSettings) {
    return this.ftpHelper.test(FTPSettings);
  }

  getResolutions() {
    return this.resolutionSelection;
  }

  getAppList() {
    return this.allNames;
  }

  async exportAll(resolution, type, subfolder) {
    const date = new Date();
    this.exportResolution = resolution;
    this.exportIdentifier = 'All apps';
    await this.initExport(date);
    this.allNames.forEach((name) => {
      this.exportApp(name.id, resolution, date, false, type, subfolder);
    });
    return true;
  }

  async exportApp(appId, resolution, _date, reload, type, subfolder) {
    // date = date || new Date();
    const date = new Date();
    if (reload !== false) {
      this.exportResolution = resolution;
      this.exportIdentifier = appId;
      await this.initExport(date);
    }
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
        const dateTimezoned = new Date(this.enLocalDateFormatter.format(date));
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
    this.exportStartTime = Date.now();
    this.localDateFormatter = new Intl.DateTimeFormat(this.locale, {
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
    this.enLocalDateFormatter = new Intl.DateTimeFormat('en', {
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
    await Promise.all([
      this.getAllLogs().then(() => this.getAllNames()),
      this.getAllDevices(),
    ]);
    return true;
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
        forceUTC: true, // Force ZIP file timestamps to be UTC.
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
          archive.append(data.csv, { name: fileNameCsv, date });
          archive.append(JSON.stringify(allMeta), { name: fileNameMeta, date });
          archive.append(JSON.stringify(entries), { name: fileNameJson, date });
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
        await this.smbHelper.save(fileName, subfolder, this.smbSettings, this.timestamp);
      }
      if (this.webdavSettings && this.webdavSettings.useWebdav) {
        await this.webdavHelper.save(fileName, subfolder, this.webdavSettings, this.timestamp);
      }
      if (this.FTPSettings && this.FTPSettings.useFTP) {
        await this.ftpHelper.save(fileName, subfolder, this.FTPSettings, this.timestamp);
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
