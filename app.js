/* eslint-disable no-await-in-loop */
/*
Copyright 2017 - 2019 Robin de Gruijter

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
const { HomeyAPI } = require('athom-api');
const fs = require('fs');
const util = require('util');
const archiver = require('archiver');
const SMB2 = require('@marsaud/smb2');
const { createClient } = require('webdav');
const Logger = require('./captureLogs.js');

const setTimeoutPromise = util.promisify(setTimeout);


// ============================================================
// Some helper functions here

const JSDateToExcelDate = (inDate) => {
	// convert to yyyy-MM-dd HH:mm:ss
	const returnDateTime = inDate.toISOString().replace(/T/, ' ').replace(/\..+/, '');
	return returnDateTime;
};

const log2csv = async (logEntries) => {
	try {
		const meta = JSON.parse(JSON.stringify(logEntries));
		delete meta.values;
		const entries = logEntries.values.map((entry) => {
			const newEntry = {
				t: JSDateToExcelDate(new Date(entry.t)),
				v: JSON.stringify(entry.v).replace('.', ','),
			};
			return newEntry;
		});
		const delimiter = ';';
		const header = `Zulu dateTime${delimiter}${logEntries.id}\r\n`;
		const csv = entries.reduce((txt, entry) => `${txt}${entry.t}${delimiter}${entry.v}\r\n`, header);
		return Promise.resolve({ csv, meta });	// csv is string. meta is object.
	} catch (error) {
		return Promise.reject(error);
	}
};


class App extends Homey.App {

	async onInit() {
		try {
			this.log('ExportInsights App is running!');
			this.logger = new Logger('log', 200);	// [logName] [, logLength]

			// generic properties
			this.homeyAPI = {};
			this.devices = {};
			this.logs = [];
			this.allNames = [];
			this.smb2Client = {};
			this.webdavClient = {};
			this.webdavSettings = {};
			this.smbSettings = {};

			// queue properties
			this.queue = [];
			this.head = 0;
			this.tail = 0;
			this.queueRunning = false;

			// register some listeners
			process.on('unhandledRejection', (error) => {
				this.error('unhandledRejection! ', error);
			});
			process.on('uncaughtException', (error) => {
				this.error('uncaughtException! ', error);
			});
			Homey
				.on('unload', () => {
					this.log('app unload called');
					// save logs to persistant storage
					this.logger.saveLogs();
				})
				.on('memwarn', () => {
					this.log('memwarn!');
				});

			// ==============FLOW CARD STUFF======================================
			const archiveAllAction = new Homey.FlowCardAction('archive_all');
			archiveAllAction
				.register()
				.registerRunListener((args) => {
					this.log(`Exporting all insights ${args.resolution}`);
					this.exportAll(args.resolution);
					return Promise.resolve(true);
				});

			const archiveAppAction = new Homey.FlowCardAction('archive_app');
			archiveAppAction
				.register()
				.registerRunListener((args) => {
					this.exportApp(args.selectedApp.id, args.resolution);
					return Promise.resolve(true);
				})
				.getArgument('selectedApp')
				.registerAutocompleteListener(async (query) => {
					const results = this.allNames.filter((result) => {		// filter for query on appId and appName
						const appIdFound = result.id.toLowerCase().indexOf(query.toLowerCase()) > -1;
						const appNameFound = result.name.toLowerCase().indexOf(query.toLowerCase()) > -1;
						return appIdFound || appNameFound;
					});
					return Promise.resolve(results);
				});

			// // do garbage collection every 10 minutes
			// this.intervalIdGc = setInterval(() => {
			// 	global.gc();
			// }, 1000 * 60 * 10);

			this.deleteAllFiles();
			await this.initExport();

			// initiate test stuff from here
			this.test();

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
		} catch (error) {
			this.error(error);
		}
	}

	// ============================================================
	// stuff for queue handling here
	async enQueue(item) {
		this.queue[this.tail] = item;
		this.tail += 1;
		if (!this.queueRunning) {
			this.queueRunning = true;
			await this.initExport();
			this.runQueue();
		}
	}

	deQueue() {
		const size = this.tail - this.head;
		if (size <= 0) return undefined;
		const item = this.queue[this.head];
		delete this.queue[this.head];
		this.head += 1;
		// Reset the counter
		if (this.head === this.tail) {
			this.head = 0;
			this.tail = 0;
		}
		return item;
	}

	async runQueue() {
		this.queueRunning = true;
		const item = this.deQueue();
		if (item) {
			await this._exportApp(item.appId, item.resolution)
				.catch(this.error);
			// wait a bit to reduce cpu and mem load?
			await setTimeoutPromise(10 * 1000, 'waiting is done');
			global.gc();
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

	testSmb(smbSettings) {
		this.log('testing SMB settings from frontend');
		return new Promise(async (resolve, reject) => {
			try {
				const smb2Client = new SMB2({
					share: smbSettings.smbShare.replace(/\//gi, '\\'),
					domain: smbSettings.smbDomain,
					username: smbSettings.smbUsername,
					password: smbSettings.smbPassword,
					autoCloseTimeout: 5000,
				});
				smb2Client.writeFile('insights2csv.txt', 'Homey can write to this folder!', { flag: 'w' }, (error) => {
					if (error) {
						this.log(error.message);
						reject(error);
					} else {
						this.log('Connection successfull!');
						resolve(true);
					}
				});
			} catch (error) {
				this.log(error);
				reject(error);
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
			this.log(error);
			return Promise.reject(error);
		}
	}

	// ============================================================
	// Local file handling in app userdata folder
	deleteAllFiles() {
		fs.readdir('./userdata/', (err, res) => {
			if (err) {
				return this.log(err);
			}
			res.forEach((elem) => {
				if (elem !== 'log.json') {
					fs.unlink(`./userdata/${elem}`, (error) => {
						if (error) { this.log(error); } else { this.log(`deleted ${elem}`); }
					});
				}
			});
			return this.log('all local files deleted');
		});
	}

	deleteFile(filename) {
		fs.unlink(`./userdata/${filename}`, (error) => {
			if (error) { this.log(error); }
			// else { this.log(`deleted ${filename}`); }
		});
	}


	// ============================================================
	// Homey API stuff here
	async loginHomeyApi() {
		// Authenticate against the current Homey.
		this.homeyAPI = await HomeyAPI.forCurrentHomey();
		return Promise.resolve(this.homeyAPI);
	}

	async getAllLogs() {
		this.logs = await this.homeyAPI.insights.getLogs();
		return Promise.resolve(this.logs);
	}

	async getAllDevices() {
		this.devices = await this.homeyAPI.devices.getDevices();
		return Promise.resolve(this.devices);
	}

	// Get a list of all app names
	async getAppNameList() {
		try {
			const allApps = await this.homeyAPI.apps.getApps();
			const mappedArray = Object.entries(allApps).map((app) => {
				const map =	{
					id: app[1].id,
					name: app[1].name,
					icon: `${app[1].id}${app[1].icon}`,
					type: 'app',
				};
				return map;
			});
			return Promise.resolve(mappedArray);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// Get a list of all logged manager names
	async getManagerNameList() {
		try {
			const logs = await this.homeyAPI.insights.getLogs();
			const list = logs.filter(log => log.uriObj.type === 'manager')
				.map((log) => {
					const app = {
						id: log.uriObj.id,
						name: log.uriObj.name,
						icon: '',
						type: log.uriObj.type,
					};
					return app;
				});
			const uniqueList = list.filter((elem, index) => index === list.findIndex(obj => JSON.stringify(obj) === JSON.stringify(elem)));
			return Promise.resolve(uniqueList);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getAllNames() {
		try {
			const managerNameList = await this.getManagerNameList();
			const appNameList = await this.getAppNameList();
			this.allNames = appNameList.concat(managerNameList);
			return Promise.resolve(this.allNames);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getAppRelatedLogs(appId) {
		try {
			this.log(`getting logs related to ${appId}`);
			let appRelatedLogs = [];
			const appUri = `homey:app:${appId}`;
			const managerUri = `homey:manager:${appId}`;
			// look for app logs
			const appLogs = this.logs.filter(log => (log.uri === appUri || log.uri === managerUri));
			appRelatedLogs = appRelatedLogs.concat(appLogs);
			// find app related devices and add their logs
			Object.keys(this.devices).forEach((key) => {
				if (this.devices[key].driverUri === appUri) {
					const deviceUri = `homey:device:${this.devices[key].id}`;
					const deviceLogs = this.logs.filter(log => (log.uri === deviceUri));
					appRelatedLogs = appRelatedLogs.concat(deviceLogs);
				}
			});
			return Promise.resolve(appRelatedLogs);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getLogEntries(log, resolution) {
		try {
			const opts = {
				uri: log.uri,
				id: log.id,
			};
			if (log.type !== 'boolean') {
				opts.resolution = resolution;
			}
			const logEntries = await this.homeyAPI.insights.getLogEntries(opts);
			return Promise.resolve(logEntries);
		} catch (error) {
			return Promise.reject(error);
		}
	}


	async initExport() {
		try {
			this.webdavSettings = Homey.ManagerSettings.get('webdavSettings');
			this.smbSettings = Homey.ManagerSettings.get('smbSettings');
			await this.loginHomeyApi();
			await this.getAllLogs();
			await this.getAllDevices();
			await this.getAllNames();
			return true;
		} catch (error) {
			return Promise.reject(error);
		}
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
	saveWebDav(filename) {	// filename is appId
		return new Promise((resolve, reject) => {
			try {
				this.getWebdavClient();
				const options = {
					format: 'binary',
					overwrite: true,
				};
				const fileName = `/${filename}`;
				const webDavWriteStream = this.webdavClient.createWriteStream(fileName, options);
				const fileStream = fs.createReadStream(`./userdata/${fileName}`);
				fileStream.on('open', () => {
					// this.log('piping to webdav');
					fileStream.pipe(webDavWriteStream);
				});
				fileStream.on('close', () => {
					// The file has been read completely
					this.log(`${fileName}.zip has been saved to webDav`);
					webDavWriteStream.end();
					resolve(fileName);
				});
				fileStream.on('error', (err) => {
					this.log('filestream error: ', err);
				});
				webDavWriteStream.on('error', (err) => {
					this.log('webdavwritestream error: ', err);
				});
			} catch (error) {
				this.error('error:', error);
				reject(error);
			}
		});
	}

	// ============================================================
	// SMB file handling here

	// create SMB client
	getSmb2Client() {
		try {
			this.smb2Client = new SMB2({
				share: this.smbSettings.smbShare.replace(/\//gi, '\\'),
				domain: this.smbSettings.smbDomain,
				username: this.smbSettings.smbUsername,
				password: this.smbSettings.smbPassword,
				autoCloseTimeout: 0,
			});
			return Promise.resolve(this.smb2Client);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// save a file to a network share via SMB as promise; resolves smb2 filename
	saveSmb(fileName) {
		return new Promise(async (resolve, reject) => {
			try {
				await this.getSmb2Client();
				this.smb2Client.createWriteStream(fileName, { flag: 'w' }, (error, smbWriteStream) => {
					if (error) {
						this.log(error);
						reject(error);
						return;
					}
					const fileStream = fs.createReadStream(`./userdata/${fileName}`);
					fileStream.on('open', () => {
						// this.log('piping to SMB2');
						fileStream.pipe(smbWriteStream);
					});
					fileStream.on('close', () => {
						// The file has been read completely
						this.log(`${fileName} has been saved to SMB2`);
						fileStream.unpipe();
						resolve(fileName);
					});
					fileStream.on('error', (err) => {
						this.log('filestream error: ', err);
						// fileStream.unpipe();
						// smbWriteStream.end();
						reject(err);
					});
				});
			} catch (error) {
				this.error('error:', error);
				// this.smb2Client.close();
				// this.getSmb2Client();
				reject(error);
			}
		});
	}

	// ============================================================
	// ZIP handling here
	// zip all log entries from one app as promise; resolves zipfilename
	async zipAppLogs(appId, resolution) {
		// this.log(`Zipping all logs for ${appId}`);
		return new Promise(async (resolve, reject) => {
			try {
				// create a file to stream archive data to.
				const timeStamp = new Date().toISOString()
					.replace(/:/g, '')	// delete :
					.replace(/-/g, '')	// delete -
					.replace(/\..+/, '');	// delete the dot and everything after
				const fileName = `${appId}_${timeStamp}Z_${resolution}.zip`;
				const output = fs.createWriteStream(`./userdata/${fileName}`);
				const archive = archiver('zip', {
					zlib: { level: 9 },	// Sets the compression level.
				});
				archive.pipe(output);	// pipe archive data to the file

				const logs = await this.getAppRelatedLogs(appId);
				for (let idx = 0; idx < logs.length; idx += 1) {
					const log = logs[idx];
					const entries = await this.getLogEntries(log, resolution);
					const data = await log2csv(entries);
					const allMeta = Object.assign(data.meta, log);
					const fileNameCsv = `${log.uriObj.name}/${log.id}.csv`;
					const fileNameMeta = `${log.uriObj.name}/${log.id}_meta.json`;
					const fileNameJson = `${log.uriObj.name}/${log.id}.json`;
					// this.log('zipping now ....');
					await archive.append(data.csv, { name: fileNameCsv });
					await archive.append(JSON.stringify(allMeta), { name: fileNameMeta });
					await archive.append(JSON.stringify(entries), { name: fileNameJson });
				}
				// this.log(`${logs.length} files zipped`);
				archive.finalize();
				output.on('close', () => {	// when zipping and storing is done...
					this.log(`${logs.length} files zipped, ${archive.pointer()} total bytes`);
					// this.log(`${appId} has been zipped.`);
					return resolve(fileName);
				});
				output.on('error', (err) => {	// when storing gave an error
					this.log(err);
				});
				archive.on('error', (err) => {	// when zipping gave an error
					this.log(err);
				});
				archive.on('warning', (warning) => {
					this.log(warning);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	exportAll(resolution) {
		this.allNames.forEach((name) => {
			this.exportApp(name.id, resolution);
		});
		return true;
	}

	exportApp(appId, resolution) {
		this.enQueue({ appId, resolution });
		return true;
	}

	async _exportApp(appId, resolution) {
		try {
			const fileName = await this.zipAppLogs(appId, resolution);
			if (this.smbSettings && this.smbSettings.useSmb) {
				await this.saveSmb(fileName);
			}
			if (this.webdavSettings && this.webdavSettings.useWebdav) {
				await this.saveWebDav(fileName);
			}
			this.deleteFile(fileName);
			// this.log(`Export of ${appId} finished`);
			return true;
		} catch (error) {
			return Promise.reject(error);
		}
	}

}

module.exports = App;


/*
_downloadEntries = log => {
    const {
      entries,
    } = this.state;

    const delimiter = '\t';
    const { title: resolutionTitle } = this._getResolution();

    const filename = `${log.uriObj.name} — ${log.title} (${resolutionTitle}).csv`;
    const csv = entries[log.key].map(entry => {
      const date = moment(entry.date).format('YYYY-MM-DD HH:mm:ss');

      return `${date}${delimiter}${entry.value}`;
    });

    // add header
    csv.unshift(`Date${delimiter}Value`);

    fileDownload(csv.join('\n'), filename);
	}

const resolutionSelection = ['lastHour', 'last6Hours', 'last24Hours', 'last7Days', 'last14Days', 'last31Days',
	'last2Years', 'today', 'thisWeek', 'thisMonth', 'thisYear', 'yesterday', 'lastWeek', 'lastMonth', 'lastYear'];

const testLog = {
	__athom_api_type: 'HomeyAPI.ManagerInsights.Log',
	uri: 'homey:device:1861bcce-a761-4c48-a145-bc807f58551b',
	uriObj:
		{
			type: 'device',
			id: '1861bcce-a761-4c48-a145-bc807f58551b',
			name: 'LS120P1_10.0.0.48',
			color: '#a3df20',
			meta: [Object],
			iconObj: [Object],
		},
	id: 'measure_power',
	title: 'Power',
	type: 'number',
	units: 'W',
	decimals: 2,
	lastValue: 190,
};

const testLog2 = {
	__athom_api_type: 'HomeyAPI.ManagerInsights.Log',
	uri: 'homey:device:1861bcce-a761-4c48-a145-bc807f58551b',
	uriObj: {
		type: 'device',
		id: '1861bcce-a761-4c48-a145-bc807f58551b',
		name: 'LS120P1_10.0.0.48',
		color: '#a3df20',
		meta: { zoneName: 'Thuis' },
		iconObj: {
			id: '4fa6d70ad49d38533f21701f1b993427',
			url: '/icon/4fa6d70ad49d38533f21701f1b993427/icon.svg',
		},
	},
	id: 'meter_offPeak',
	title: 'Off-peak',
	type: 'boolean',
	units: null,
	decimals: null,
	lastValue: true,
};

  */
