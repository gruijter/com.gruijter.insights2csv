module.exports = {
	// retrieve logs
	async getLogs({ homey }) {
		const result = await homey.app.getLogs();
		return result;
	},
	// delete logs
	async deleteLogs({ homey }) {
		const result = await homey.app.deleteLogs();
		return result;
	},
	// get resolution list
	async getResolutions({ homey }) {
		const result = await homey.app.getResolutions();
		return result;
	},
	// get app list
	async getAppList({ homey }) {
		const result = await homey.app.getAppList();
		return result;
	},
	// stop export
	async stopExport({ homey }) {
		const result = await homey.app.stopExport();
		return result;
	},
	// make full backup from frontend
	async exportAll({ homey, body }) {
		// access the post body and perform some action on it.
		return homey.app.exportAll(body.resolution);
	},
	// make app backup from frontend
	async exportApp({ homey, body }) {
		// access the post body and perform some action on it.
		return homey.app.exportApp(body.appId, body.resolution);
	},
	// test SMB settings from frontend
	async testSmb({ homey, body }) {
		// access the post body and perform some action on it.
		return homey.app.testSmb(body);
	},
	// test FTP settings from frontend
	async testFTP({ homey, body }) {
		// access the post body and perform some action on it.
		return homey.app.testFTP(body);
	},
	// test WebDAV settings from frontend
	async testWebdav({ homey, body }) {
		// access the post body and perform some action on it.
		return homey.app.testWebdav(body);
	},
};
