'use strict';

const request = require('request');
const replaceStream = require('replacestream');
const archiver = require('archiver');
const webdav = require('webdav');
const fs = require('fs');
// const util = require('util');
let settings;

Homey.log('app.js started');
// debug show what files are in userdata
// fs.readdir('/userdata', (err, res) => { Homey.log(err); Homey.log(res); });
deleteAllFiles();

module.exports.init = init;

function init() {
	Homey.log('app.js init started');
	settings = Homey.manager('settings').get('settings');
}

Homey.manager('flow').on('action.archive_all', (callback, args) => {
	archiveAll();
	callback(null, true); // we've fired successfully
});

// Fired when a setting has been changed
Homey.manager('settings').on('set', (changedKey) => {
	settings = Homey.manager('settings').get('settings');
	Homey.log(settings);
	// Homey.log(changedKey);
	if (changedKey === 'settings') {				// save button is pressed
		Homey.log('save event received in app.js');
		testBearer((error) => {
			// Homey.log('bearer token test completed', error);
			if (!error) {	// bearer is correct
				Homey.manager('api').realtime('testing_ready', { error: null, result: 'settings are saved' });
			} else {	// bearer setting incorrect
				// send result back to settings html
				Homey.manager('api').realtime('testing_ready', { error, result: ' ,bearer token incorrect' });
			}
		});
	} else if (changedKey === 'backup') {				// backup button is pressed
		Homey.log('backup event received in app.js');
		deleteAllFiles();
		archiveAll();
	} else { Homey.log('unknow settings have changed'); }
});


function testBearer(callback) {
	const url = 'http://localhost/api/manager/insights/log';
	const options = {	auth: { bearer: settings.bearer_token }	};
	request.get(url, options, (error, response, body) => {
		// Homey.log(error);
		// Homey.log(response);
		// Homey.log(body);
		if (error) {
			callback(error);
			return;
		}
		const res = JSON.parse(body);
		if (res.status !== 200) {
			Homey.log('error');
			Homey.log(res.status);
			callback(`${res.status} ${res.result}`);
			return;
		}
		callback(null);
	});
}

// collect all apps and start archiving their logs
function archiveAll() {
	collectApps(apps => {
		// Homey.log(apps);
		const client = webdav(
			settings.webdav_url,
			settings.username,
			settings.password
		);
		for (const appId in apps) {
			if (apps.hasOwnProperty(appId)) {

				// create a file to stream archive data to.
				const output = fs.createWriteStream(`./userdata/${appId}.zip`);
				const archive = archiver('zip', {
					zlib: { level: 9 }, // Sets the compression level.
				});
				// pipe archive data to the file
				archive.pipe(output);
				// collect all logs and store as files
				saveLogfiles(apps[appId], archive);
				// listen if zip-file is ready
				output.on('close', () => {
					Homey.log(`${archive.pointer()} total bytes`);
					Homey.log(`${appId} has been zipped.`);
					// write file to webdav
					const file = fs.readFileSync(`./userdata/${appId}.zip`);
					const options = {
						format: 'binary',
						// headers: {
						// 	'Content-Type': 'application/octet-stream',
						// },
						overwrite: true,
					};
					// store zip-file to webdav folder
					client
						.putFileContents(`/${appId}.zip`, file, options)
						.catch(err => {
							Homey.log(err);
						});
				});
				// good practice to catch this error explicitly
				archive.on('error', err => {
					Homey.log(err);
				});

			}
		}
	});
}

function collectLogs(callback) {
	const url = 'http://localhost/api/manager/insights/log';
	const options = {	auth: { bearer: settings.bearer_token }	};
	request.get(url, options, (error, response, body) => {
			// Homey.log(error);
			// Homey.log(response);
			// Homey.log(body);
		if (!error) {
			const res = JSON.parse(body);
			const logs = res.result;
			if (res.status !== 200) {
				Homey.log('error');
				Homey.log(res.status);
				return;
			}
				// Homey.log(util.inspect(logs, false, 10, true));
			callback(logs);
		}
	});
}

// fill the list of apps
function collectApps(callback) {
	collectLogs(logs => {
		const apps = {};
		// Homey.log(logs);
		logs.forEach(log => {
			// Homey.log(util.inspect(log, false, 10, true));
			if (log.uriObj.icon !== undefined) {
				const appId = log.uriObj.icon.split('/')[2];
				if (apps[appId] === undefined) {
					const app = {
						appId,
						type: log.uriObj.type,
					};
					if (log.uriObj.type !== 'device') {
						app.name = log.uriObj.name;
					}
					apps[appId] = app;
				}
			}
		});
		callback(apps);
	});
}

// // transform stream FOR FUTURE USE
// const Transform = require('stream').Transform;
//
// const parser = new Transform();
// parser._transform = function (data, encoding, done) {
// 	this.push(data);
// 	done();
// };

function saveLogfiles(app, archive) {
	// Homey.log(app);
	collectLogs(logs => {
		// Homey.log(logs);
		logs.forEach(log => {
			// Homey.log(util.inspect(log, false, 10, true));
			let appId = undefined;
			if (log.uriObj.icon !== undefined) { appId = log.uriObj.icon.split('/')[2]; }
			if (app.appId !== appId) { return; }
			const url = `http://localhost/api/manager/insights/log/${log.uri}/${log.name}/entry`;
			// Homey.log(url);
			const options = { auth: { bearer: settings.bearer_token } };
			const logStream = request.get(url, options, (error, response, body) => {
				// Homey.log(`${appId}/${log.name}`);
				Homey.log(url);
				if (error) {
					Homey.log(error);
				}
			}).pipe(replaceStream(',', ';'));
			let fileName = `${appId}/${log.name}.csv`;
			if (log.uriObj.type === 'device') {
				fileName = `${appId}/${log.uriObj.name}/${log.name}.csv`;
			}
			archive.append(logStream, { name: fileName });
		});
		archive.finalize();
	});
}

function deleteAllFiles() {
	fs.readdir('./userdata/', (err, res) => {
		// Homey.log(res);
		if (err) {
			Homey.log(err);
		}
		res.forEach(elem => {
			fs.unlink(`./userdata/${elem}`, err => {
				if (err) { Homey.log(err); } else { Homey.log(`deleted ${elem}`); }
			});
		});
	});
}
