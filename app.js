/*
Copyright 2017, 2018 Robin de Gruijter

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

const archiver = require('archiver');
const webdav = require('webdav');
// const SMB2 = require('@marsaud/smb2');
const SMB2 = require('@tracker1/smb2');
const Logger = require('./captureLogs.js');
const fs = require('fs');
// const util = require('util');

const Homey = require('homey');
const { HomeyAPI } = require('athom-api');	// npm install athom-api@beta --save

class Insights2csvApp extends Homey.App {

	async onInit() {
		this.log('Insights2csv App is running!');
		this.api = await HomeyAPI.forCurrentHomey();
		this.logger = new Logger('log', 200);

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
				this.deleteAllFiles();
			})
			.on('memwarn', () => {
				this.log('memwarn!');
			})
			// Fired when an app setting has changed
			.ManagerSettings.on('set', (key) => {
				this.log('settings were changed!');
				// this.log(Homey.ManagerSettings.get(key));
				this.getWebDavClient();
				this.getSmb2Client();
			});

		// ==============FLOW CARD STUFF======================================
		const archiveAllAction = new Homey.FlowCardAction('archive_all');
		archiveAllAction
			.register()
			.registerRunListener((args, state) => {
				this.archiveAll();
				return Promise.resolve(true);
			});

		const archiveAppAction = new Homey.FlowCardAction('archive_app');
		archiveAppAction
			.register()
			.registerRunListener((args, state) => {
				this.archiveApp(args.selectedApp.name);
				return Promise.resolve(true);
			})
			.getArgument('selectedApp')
			.registerAutocompleteListener(async (query, args) => {
				let results = await this.getLogListArray();
				results = results.filter((result) => {		// filter for query on appId and appName
					const appIdFound = result.name.toLowerCase().indexOf(query.toLowerCase()) > -1;
					const appNameFound = result.description.toLowerCase().indexOf(query.toLowerCase()) > -1;
					return appIdFound || appNameFound;
				});
				return Promise.resolve(results);
			});

		// init some stuff
		this.deleteAllFiles();
		this.getWebDavClient();
		this.getSmb2Client();

		// // do testing here
		// setTimeout(async () => {
		// 	this.archiveApp('nl.philips.hue');
		// 	// this.archiveAll();
		// }, 3000); // wait a few seconds :)

	}

	// logfile stuff for frontend API
	deleteLogs() {
		return this.logger.deleteLogs();
	}
	getLogs() {
		return this.logger.logArray;
	}

	// for autocomlete actionlist
	getLogListArray() {
		return new Promise(async (resolve, reject) => {
			try {
				const logList = await this.getLogList();
				const logListArray = [];
				Object.keys(logList).forEach((key) => {
					const item = logList[key];
					const logProperties = {
						name: item.appId,
						description: item.name,
						icon: item.icon,
					};
					logListArray.push(logProperties);
				});
				return resolve(logListArray);
			} catch (error) {
				this.error('error:', error);
				return reject(error);
			}
		});
	}

	// Local file handling in app userdata folder
	deleteAllFiles() {
		fs.readdir('./userdata/', (err, res) => {
			// this.log(res);
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
			return this.log('all files deleted');
		});
	}
	deleteFile(filename) {	// filename is appId
		fs.unlink(`./userdata/${filename}.zip`, (error) => {
			if (error) { this.log(error); } else {
				// this.log(`deleted ${filename}.zip`);
			}
		});
	}

	// SMB file handling
	getSmb2Client() {
		const settings = Homey.ManagerSettings.get('smbSettings');
		if (!settings) {
			return false;
		}
		this.smb2Client = new SMB2({
			share: settings.smbShare,
			domain: settings.smbDomain,
			username: settings.smbUsername,
			password: settings.smbPassword,
			autoCloseTimeout: 0,
		});
		return this.smb2Client;
	}
	// save a file to a network share via SMB as promise; resolves smb2 filename
	saveSmb(appId) {	// filename is appId
		return new Promise((resolve, reject) => {
			try {
				this.smb2Client.close();
				this.getSmb2Client();
				const filename = `${appId}.zip`;
				this.smb2Client.createWriteStream(filename, (error, smbWriteStream) => {
					if (error) {
						this.log(error);
						return reject(error);
					}
					const fileStream = fs.createReadStream(`./userdata/${appId}.zip`);
					fileStream.on('open', () => {
						this.log('piping to SMB2');
						fileStream.pipe(smbWriteStream);
					});
					fileStream.on('close', () => {
						// The file has been read completely
						this.log(`${appId}.zip has been saved to SMB2`);
						fileStream.unpipe();
						return resolve(filename);
					});
					fileStream.on('error', (err) => {
						this.log('filestream error: ', err);
						// fileStream.unpipe();
						// smbWriteStream.end();
						return reject(err);
					});
				});
			} catch (error) {
				this.error('error:', error);
				// this.smb2Client.close();
				// this.getSmb2Client();
				return reject(error);
			}
		});
	}

	// WebDav file handling
	getWebDavClient() {
		const settings = Homey.ManagerSettings.get('settings');
		if (!settings) {
			return false;
		}
		this.webDavClient = webdav(
			settings.webdav_url,
			settings.username,
			settings.password,
		);
		return this.webDavClient;
	}
	// save a file to WebDAV as promise; resolves webdav filename
	saveWebDav(appId) {	// filename is appId
		return new Promise((resolve, reject) => {
			try {
				this.getWebDavClient();
				const options = {
					format: 'binary',
					overwrite: true,
				};
				const filename = `/${appId}.zip`;
				const webDavWriteStream = this.webDavClient.createWriteStream(filename, options);
				const fileStream = fs.createReadStream(`./userdata/${appId}.zip`);
				fileStream.on('open', () => {
					// this.log('piping to webdav');
					fileStream.pipe(webDavWriteStream);
				});
				fileStream.on('close', () => {
					// The file has been read completely
					this.log(`${appId}.zip has been saved to webDav`);
					webDavWriteStream.end();
					return resolve(filename);
				});
				fileStream.on('error', (err) => {
					this.log('filestream error: ', err);
				});
				webDavWriteStream.on('error', (err) => {
					this.log('webdavwritestream error: ', err);
				});
			} catch (error) {
				this.error('error:', error);
				return reject(error);
			}
		});
	}

	// zip all log entries from one app as promise; resolves zipfilename
	async zipAppLogs(appId) {
		// this.log(`Zipping all logs for ${appId}`);
		return new Promise(async (resolve, reject) => {
			try {
				// create a file to stream archive data to.
				const output = fs.createWriteStream(`./userdata/${appId}.zip`);
				const archive = archiver('zip', {
					zlib: { level: 9 },	// Sets the compression level.
				});
				archive.pipe(output);	// pipe archive data to the file
				const logs = await this.getAppLogs(appId);
				for (let idx = 0; idx < logs.length; idx += 1) {
					const log = logs[idx];
					const entries = await this.getEntries(log);
					const fileName = `${appId}/${log.uriObj.name}/${log.name}.csv`;
					this.log('zipping now ....');
					await archive.append(entries, { name: fileName });
				}
				this.log(`${logs.length} files zipped`);
				archive.finalize();
				output.on('close', () => {	// when zipping and storing is done...
					this.log(`${archive.pointer()} total bytes`);
					this.log(`${appId} has been zipped.`);
					const filename = `./userdata/${appId}.zip`;
					return resolve(filename);
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
				this.error('error:', error);
				return reject(error);
			}
		});
	}

	// **************** api calls to retrieve logs *************
	// Get a list of all app names
	async getAppNameList() {
		const allApps = await this.api.apps.getApps();
		const appNameList = {};
		Object.keys(allApps).forEach((key) => {
			appNameList[key] = {
				id: allApps[key].id,
				name: allApps[key].name.en,
			};
		});
		return appNameList;
	}
	// Get a list of all logs
	getLogList() {
		return new Promise(async (resolve, reject) => {
			try {
				const logs = await this.api.insights.getLogs();
				const appNameList = await this.getAppNameList();
				const logList = {};
				logs.forEach(async (log) => {
					if (Object.prototype.hasOwnProperty.call(log.uriObj, 'icon')) {
						const appId = log.uriObj.icon.split('/')[2];
						if (logList[appId] === undefined) {
							const app = {
								appId,
								name: undefined,
								icon: `/app/${appId}/assets/icon.svg`,
							};
							if (appNameList[appId] !== undefined) {
								app.name = appNameList[appId].name;
							}
							if (log.uriObj.type !== 'device') {
								app.name = log.uriObj.name;
								app.icon = log.uriObj.icon;
							}
							logList[appId] = app;
						}
					}
				});
				return resolve(logList);
			} catch (error) {
				this.error('error:', error);
				return reject(error);
			}
		});
	}
	// get all logs from one app
	async getAppLogs(appId) {
		const logs = await this.api.insights.getLogs();
		const list = logs.filter((log) => {
			if (Object.prototype.hasOwnProperty.call(log.uriObj, 'icon')) {
				return (log.uriObj.icon.includes(appId));
			}
			return false;
		});
		return list;
	}
	// get all the entries from one log (device or app)
	async getEntries(log) {
		// this.log(`retrieving log entries for ${log.uriObj.name} ${log.name}`);
		const options = {
			uri: log.uri, // e.g. 'homey:device:43801912-11d6-44c6-acd7-012c3d67113b',
			name: log.name, // e.g. 'onoff',
			$timeout:	120000,	// ultralong timeout :)
			// start: '2017-12-24T23:59:59.000Z',
			// end: '2017-12-25T23:59:59.000Z', // now.toISOString(),
		};
		const entries = await this.api.insights.getEntries(options)
			.catch((error) => {
				this.log(error);
				return '';
			});
		return entries.replace(/,/g, ';');
	}

	// Archiving commands
	async archiveAll() {
		this.log('now archiving all logs');
		const logListArray = await this.getLogListArray();
		for (let idx = 0; idx < logListArray.length; idx += 1) {
			const log = logListArray[idx];
			await this.archiveApp(log.name)
				.catch((error) => {
					// do nothing, just skip this app
				});
		}
		this.log('Finished archiving all logs');
	}
	archiveApp(appId) {
		this.log(`now archiving ${appId}`);
		return new Promise(async (resolve, reject) => {
			try {
				await this.zipAppLogs(appId);
				const settingsWebdav = Homey.ManagerSettings.get('settings');
				if (settingsWebdav.useWebdav) {
					await this.saveWebDav(appId);
				}
				const settingsSmb = Homey.ManagerSettings.get('smbSettings');
				if (settingsSmb.useSmb) {
					await this.saveSmb(appId);
				}
				this.deleteFile(appId);
				return resolve(true);
			} catch (error) {
				this.error('error:', error);
				return reject(error);
			}
		});
	}


}

module.exports = Insights2csvApp;
