/* eslint-disable no-await-in-loop */

/*
Copyright 2017 - 2022 Robin de Gruijter

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
const { HomeyAPIApp } = require('homey-api');
//const { HomeyAPI } = require('homey-api');
const fs = require('fs');
const util = require('util');
const archiver = require('archiver');
const SMB2 = require('@marsaud/smb2');
const { createClient } = require('webdav');
const ftp = require('basic-ftp');
const Logger = require('./captureLogs');

const setTimeoutPromise = util.promisify(setTimeout);

// ============================================================
// Some helper functions here

const JSDateToExcelDate = (inDate) => {
	// convert to yyyy-MM-dd HH:mm:ss
	const dateTime = inDate.toISOString().replace(/T/, ' ').replace(/\..+/, '');
	return dateTime;
};

const log2csv = (logEntries, log) => {
	try {
		const meta = {
			entries: logEntries.values.length,
		};
		Object.keys(logEntries).forEach((key) => {
			if (key === 'values') return;
			meta[key] = logEntries[key];
		});

		const delimiter = ';';
		let id = logEntries.id;
		if(id.indexOf(':')>-1)  { id=id.split(':'); id=id[id.length-1];}
		if(log.ownerUri === 'homey:manager:logic') id = log.title;

		const header = `Zulu dateTime${delimiter}${id}\r\n`;
		let csv = header;
		logEntries.values.forEach((entry) => {
			const time = JSDateToExcelDate(new Date(entry.t));
			const value = JSON.stringify(entry.v).replace('.', ',');
			csv += `${time}${delimiter}${value}\r\n`;
		});
		return { csv, meta };	// csv is string. meta is object.
	} catch (error) {
		return error;
	}
};

class App extends Homey.App {

	async onInit() {
		try {
			if (!this.logger) this.logger = new Logger({ name: 'log', length: 200, homey: this.homey });
			if (process.env.DEBUG === '1' || false) {
				try {
					require('inspector').waitForDebugger();
				}
				catch (error) {
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
			this.resolutionSelection = ['lastHour', 'last6Hours', 'last24Hours', 'last7Days', 'last14Days', 'last31Days',
				'last2Years', 'today', 'thisWeek', 'thisMonth', 'thisYear', 'yesterday', 'lastWeek', 'lastMonth', 'lastYear'];

			// queue properties
			this.abort = false;
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
				.registerRunListener((args) => {
					this.log(`Exporting all insights ${args.resolution}`);
					this.exportAll(args.resolution);
					return Promise.resolve(true);
				});

			const archiveAppAction = this.homey.flow.getActionCard('archive_app');
			archiveAppAction
				.registerRunListener((args) => {
					this.exportApp(args.selectedApp.id, args.resolution);
					return Promise.resolve(true);
				})
				.registerArgumentAutocompleteListener(
					'selectedApp',
					async (query) => {
						const results = this.allNames.filter((result) => {		// filter for query on appId and appName
							const appIdFound = result.id.toLowerCase().indexOf(query.toLowerCase()) > -1;
							const appNameFound = result.name.toLowerCase().indexOf(query.toLowerCase()) > -1;
							return appIdFound || appNameFound;
						});
						return Promise.resolve(results);
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
					return Promise.resolve(true);
				});

			this.deleteAllFiles();
			await this.initExport();

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

	flushQueue() {
		this.queue = [];
		this.head = 0;
		this.tail = 0;
		this.queueRunning = false;
		this.log('Export queue is flushed');
	}

	async runQueue() {
		this.queueRunning = true;
		const item = this.deQueue();
		if (item) {
			await this._exportApp(item.appId, item.resolution)
				.catch(this.error);
			// wait a bit to reduce cpu and mem load?
			global.gc();
			await setTimeoutPromise(10 * 1000, 'waiting is done');
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
		return new Promise((resolve, reject) => {
			try {
				const smb2Client = new SMB2({
					share: smbSettings.smbShare.replace(/\//gi, '\\'),
					domain: smbSettings.smbDomain,
					username: smbSettings.smbUsername,
					password: smbSettings.smbPassword,
					autoCloseTimeout: 5000,
				});
				let path = `${smbSettings.smbPath.replace(/\//gi, '\\')}\\`;
				if (smbSettings.smbPath === '') {
					path = '';
				}
				smb2Client.writeFile(`${path}insights2csv.txt`, 'Homey can write to this folder!', { flag: 'w' }, (error) => {
					if (error) {
						this.log(error.message);
						reject(error);
					} else {
						this.log('Connection successfull!');
						resolve(true);
					}
				});
			} catch (error) {
				this.error(error);
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
			this.error(error);
			return Promise.reject(error);
		}
	}

	async testFTP(FTPSettings) {
		this.log('testing FTP settings from frontend');
		try {
			const client = new ftp.Client();
			client.ftp.verbose = true;
			await client.access({
				host: FTPSettings.FTPHost,
				port: FTPSettings.FTPPort,
				user: FTPSettings.FTPUsername,
				password: FTPSettings.FTPPassword,
				secure: FTPSettings.useSFTP,
				secureOptions: { rejectUnauthorized: false },
			});
			await client.ensureDir(FTPSettings.FTPFolder);
			// console.log(await client.list());
			this.log('Connection successfull!');
			client.close();
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

	stopExport() {
		if (this.queueRunning) this.log('aborting export');
		this.abort = true;
		this.flushQueue();
		return true;
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
		if (this.homeyAPI) return Promise.resolve(this.homeyAPI);
		// Authenticate against the current Homey.
		this.homeyAPI = new HomeyAPIApp({ homey: this.homey, $timeout: 90000 });
		// this.homeyAPI = await HomeyAPI.createAppAPI({
		// 	homey: this.homey, 
		// 	$timeout: 90000
		// });
		return Promise.resolve(this.homeyAPI);
	}

	async getAllLogs() {
		this.logs = await this.homeyAPI.insights.getLogs({ $timeout: 60000 });
		return Promise.resolve(this.logs);
	}

	async getAllDevices() {
		this.devices = await this.homeyAPI.devices.getDevices({ $timeout: 60000 });
		return Promise.resolve(this.devices);
	}

	// Get a list of all app names
	async getAppNameList() {
		try {
			const allApps = await this.homeyAPI.apps.getApps({ $timeout: 60000 });
			const mappedArray = Object.entries(allApps).map((app) => {
				const map =	{
					id: app[1].id,
					name: app[1].name,
					icon: `${app[1].id}${app[1].icon}`,
					type: 'app',
				};
				return map;
			});
			return Promise.all(mappedArray);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// getUriObj(log) {
	// 	if (log.uriObj) return log.uriObj;
	// 	else 
	// 	{
	// 		this.log(log);
	// 		return {id:log.ownerId};
	// 	}
	// }

	// Get a list of all logged manager names
	async getManagerNameList() {
		try {
			const logs = await this.homeyAPI.insights.getLogs({ $timeout: 60000 });
			const list = logs.filter((log) =>  log.uriObj ? log.uriObj.type == 'manager' : log.ownerUri.startsWith('homey:manager:') )
				.map((log) => {
					//let uriObj = this.getUriObj(log);
					let ids = log.ownerUri.split(':');
					let id = ids[ids.length-1];
					//const dev = this.devices[id[id.length-1]];					
					//const app = dev ? null : this.allNames.find(x=>x.id===id);

					const name = log.uriObj ? log.uriObj.name : log.ownerName;//: app ? app.name : null;
					if(!name) return;
					const _app = {
						id: log.uriObj ? log.uriObj.id : (id) , //+ log.ownerId
						name: name,
						icon: '',
						type: log.uriObj ? log.uriObj.type : ids[1] //app ? app.type : null,
					};
					return _app;
				});
			const uniqueList = list.filter((elem, index) => elem && index === list.findIndex((obj) => JSON.stringify(obj) === JSON.stringify(elem)));
			return Promise.all(uniqueList);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	async getAllNames() {
		try {
			const managerNameList = await this.getManagerNameList();
			const appNameList = await this.getAppNameList();
			this.allNames = appNameList.concat(managerNameList);
			return Promise.all(this.allNames);
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
			const appLogs = this.logs.filter((log) => ((log.uri || log.ownerUri) === appUri || ((log.uri || log.ownerUri) === managerUri) && log.ownerName));
			appRelatedLogs = appRelatedLogs.concat(appLogs);
			// find app related devices and add their logs
			Object.keys(this.devices).forEach((key) => {
				if (this.devices[key].driverUri === appUri) {
					const deviceUri = `homey:device:${this.devices[key].id}`;
					const deviceLogs = this.logs.filter((log) => ((log.uri || log.ownerUri) === deviceUri));
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
				uri: (log.uri || log.ownerUri),
				id: log.id,
				$timeout: 90000,
			};
			if (log.type !== 'boolean') {
				opts.resolution = resolution;
			}
			const logEntries = await this.homeyAPI.insights.getLogEntries(opts);
			if (logEntries.values.length > 2925) {
				this.error(`Insights data is corrupt and will be truncated to the first 2925 records for ${(log.uriObj ? log.uriObj.name : log.ownerName)} ${logEntries.id}.`);
				//  ${logEntries.uri}`);
				logEntries.values = logEntries.values.slice(0, 2925);
				global.gc();
				await setTimeoutPromise(10 * 1000, 'waiting is done');
			}
			return Promise.resolve(logEntries);
		} catch (error) {
			global.gc();
			await setTimeoutPromise(10 * 1000, 'waiting is done');
			return Promise.reject(error);
		}
	}

	async initExport() {
		try {
			this.abort = false;
			this.webdavSettings = this.homey.settings.get('webdavSettings');
			this.smbSettings = this.homey.settings.get('smbSettings');
			this.FTPSettings = this.homey.settings.get('FTPSettings');
			this.CPUSettings = this.homey.settings.get('CPUSettings');
			if (this.CPUSettings && this.CPUSettings.lowCPU) this.log('Low CPU load selected for export');
			this.timestamp = new Date().toISOString()
				.replace(/:/g, '')	// delete :
				.replace(/-/g, '')	// delete -
				.replace(/\..+/, 'Z');	// delete the dot and everything after
			await this.loginHomeyApi();
			await this.getAllLogs();
			await this.getAllDevices();
			await this.getAllNames();
			return Promise.resolve(true);
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
	async saveWebDav(fileName) {	// filename is appId
		try {
			await this.getWebdavClient();
			let webdavFileName = `/${fileName}`;
			// save to seperate folder when selected by user
			if (this.webdavSettings.webdavUseSeperateFolders) {
				await this.webdavClient.createDirectory(`/${this.timestamp}/`)
					.then(() => {
						this.log(`${this.timestamp} folder created!`);
					})
					.catch(() => null);
				webdavFileName = `/${this.timestamp}/${fileName}`;
			}
			const options = {
				format: 'binary',
				overwrite: true,
			};
			const webDavWriteStream = this.webdavClient.createWriteStream(webdavFileName, options);
			const fileStream = fs.createReadStream(`./userdata/${fileName}`);
			return new Promise((resolve, reject) => {
				fileStream.on('open', () => {
					// this.log('piping to webdav');
					fileStream.pipe(webDavWriteStream);
				});
				fileStream.on('close', () => {
					// The file has been read completely
					this.log(`${fileName} has been saved to webDav`);
					webDavWriteStream.end();
					resolve(fileName);
				});
				fileStream.on('error', (err) => {
					this.log('filestream error: ', err);
				});
				webDavWriteStream.on('error', (err) => {
					this.error(err.message);
					this.log('webdavwritestream error');
					return reject(err);
				});
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
	async saveSmb(fileName) {
		try {
			await this.getSmb2Client();
			let path = `${this.smbSettings.smbPath.replace(/\//gi, '\\')}\\`;
			if (this.smbSettings.smbPath === '') {
				path = '';
			}
			// save to seperate folder when selected by user
			if (this.smbSettings.smbUseSeperateFolders) {
				path = `${path}${this.timestamp}\\`;
				if (this.smbSettings.smbPath === '') {
					path = `${this.timestamp}\\`;
				}
				const folderExists = await new Promise((resolve, reject) => {
					this.smb2Client.exists(path, async (error, exists) => {
						if (error) reject(error);
						// console.log(exists ? "it's there" : "it's not there!");
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
			});
		} catch (error) {
			// this.error('error:', error);
			// this.smb2Client.close();
			// this.getSmb2Client();
			return Promise.reject(error);
		}
	}

	// purge SMB folder
	async purgeSMB(daysOld, allTypes) {
		try {
			let selectList = [];
			await this.getSmb2Client();
			let path = `${this.smbSettings.smbPath.replace(/\//gi, '\\')}\\`;
			if (this.smbSettings.smbPath === '') {
				path = '';
			}
			return new Promise((resolve, reject) => {
				this.smb2Client.readdir(path, (err, files) => {
					if (err) return reject(err);
					selectList = files;
					// select only zip files
					if (!allTypes) {
						selectList = selectList.filter((item) => {
							const isZip = item.toLowerCase().slice(-4) === '.zip';
							return isZip;
						});
					}
					// select older then daysOld
					selectList = selectList.filter((item) => {
						let dateString = item.match(/_(.*?)_/)[1];
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
		} catch (error) {
			return Promise.reject(error);
		}
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
			await this.FTPClient.access({
				host: this.FTPSettings.FTPHost,
				port: this.FTPSettings.FTPPort,
				user: this.FTPSettings.FTPUsername,
				password: this.FTPSettings.FTPPassword,
				secure: this.FTPSettings.useSFTP,
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
	async saveFTP(fileName) {
		try {
			await this.getFTPClient();
			await this.FTPClient.ensureDir(`//${this.FTPSettings.FTPFolder}`);
			// save to seperate folder when selected by user
			if (this.FTPSettings.FTPUseSeperateFolders) {
				await this.FTPClient.ensureDir(`//${this.FTPSettings.FTPFolder}/${this.timestamp}`);
			}
			const fileStream = fs.createReadStream(`./userdata/${fileName}`);
			await this.FTPClient.upload(fileStream, fileName);
			this.log(`${fileName} has been saved to FTP(S)`);
			return Promise.resolve(fileName);
		} catch (error) {
			this.error('error:', error);
			return Promise.reject(error);
		}
	}

	// purge FTP folder
	async purgeFTP(daysOld, allTypes) {
		try {
			await this.getFTPClient();
			await this.FTPClient.ensureDir(`//${this.FTPSettings.FTPFolder}`);
			let selectList = await this.FTPClient.list();
			// select only zip files
			if (!allTypes) {
				selectList = await selectList.filter((item) => {
					const isFile = item.type === 1;
					// const isFolder = item.type === 2;
					const isZip = item.name.toLowerCase().slice(-4) === '.zip';
					return isZip && isFile;
				});
			}
			// select older then daysOld
			selectList = await selectList.filter((item) => {
				let dateString = item.date;
				if (dateString.length < 18) {
					const year = new Date().getFullYear();
					dateString = `${year} ${dateString}`;
				}
				const days = (Date.now() - new Date(dateString)) / 1000 / 60 / 60 / 24;
				return days > daysOld;
			});
			// delete the file or folder
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
			return Promise.resolve(selectList);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	// ============================================================
	// ZIP handling here
	// zip all log entries from one app as promise; resolves zipfilename
	async zipAppLogs(appId, resolution) {
		// this.log(`Zipping all logs for ${appId}`);
		try {
			// create a file to stream archive data to.
			const timeStamp = new Date().toISOString()
				.replace(/:/g, '')	// delete :
				.replace(/-/g, '')	// delete -
				.replace(/\..+/, '');	// delete the dot and everything after
			const fileName = `${appId}_${timeStamp}Z_${resolution}.zip`;
			const output = fs.createWriteStream(`./userdata/${fileName}`);
			const level = this.CPUSettings && this.CPUSettings.lowCPU ? 3 : 9;
			const archive = archiver('zip', {
				zlib: { level },	// Sets the compression level.
			});
			archive.pipe(output);	// pipe archive data to the file

			const logs = await this.getAppRelatedLogs(appId);
			for (let idx = 0; idx < logs.length; idx += 1) {
				if (!this.abort) {
					const log = logs[idx];
					const entries = await this.getLogEntries(log, resolution);
					const data = await log2csv(entries, log);
					const allMeta = Object.assign(data.meta, log);
					let ids = log.ownerUri.split(':');
					//if(ids.length)
					let id = ids[ids.length-1];
					const dev = this.devices[id];
					const app = dev ? null : this.allNames.find(x=>x.id===id);
					const name = log.uriObj ? log.uriObj.name : dev ? dev.name : app ? app.name : null;
					const fileNameCsv = `${name}/${(log.ownerId || log.id)}.csv`;
					const fileNameMeta = `${name}/${(log.ownerId || log.id)}_meta.json`;
					const fileNameJson = `${name}/${(log.ownerId || log.id)}.json`;
					// console.log(`zipping ${fileNameCsv} now ....`);
					archive.append(data.csv, { name: fileNameCsv });
					archive.append(JSON.stringify(allMeta), { name: fileNameMeta });
					archive.append(JSON.stringify(entries), { name: fileNameJson });
					if (this.CPUSettings && this.CPUSettings.lowCPU) await setTimeoutPromise(2 * 1000, 'waiting is done'); // relax Homey a bit...
					else await setTimeoutPromise(1, 'mini-waiting is done'); // relax Homey a bit...
				}
			}
			// this.log(`${logs.length} files zipped`);
			archive.finalize();

			return new Promise((resolve, reject) => {
				output.on('close', () => {	// when zipping and storing is done...
					this.log(`${logs.length} files zipped, ${archive.pointer()} total bytes`);
					// this.log(`${appId} has been zipped.`);
					return resolve(fileName);
				});
				output.on('error', (err) => {	// when storing gave an error
					this.log('error saving zipfile');
					return reject(err);
				});
				archive.on('error', (err) => {	// when zipping gave an error
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

	async _exportApp(appId, resolution) {
		try {
			const fileName = await this.zipAppLogs(appId, resolution);
			if (this.smbSettings && this.smbSettings.useSmb) {
				await this.saveSmb(fileName);
			}
			if (this.webdavSettings && this.webdavSettings.useWebdav) {
				await this.saveWebDav(fileName);
			}
			if (this.FTPSettings && this.FTPSettings.useFTP) {
				await this.saveFTP(fileName);
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
