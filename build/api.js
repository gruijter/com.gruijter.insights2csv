const Homey = require('homey');

module.exports = [
	{
		description: 'Test the SMB settings',
		method: 'POST',
		path: '/testSmb/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			Homey.app.testSmb(args.body)
				.then((result) => callback(null, result))
				.catch((error) => callback(error));
		},
	},
	{
		description: 'Test the FTP settings',
		method: 'POST',
		path: '/testFTP/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			Homey.app.testFTP(args.body)
				.then((result) => callback(null, result))
				.catch((error) => callback(error));
		},
	},
	{
		description: 'Test the WebDAV settings',
		method: 'POST',
		path: '/testWebdav/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			Homey.app.testWebdav(args.body)
				.then((result) => callback(null, result))
				.catch((error) => callback(error));
		},
	},
	{
		description: 'get resolution selections',
		method: 'GET',
		path: '/getResolutions/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.getResolutions();
			callback(null, result);
		},
	},
	{
		description: 'get app list',
		method: 'GET',
		path: '/getAppList/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.getAppList();
			callback(null, result);
		},
	},
	{
		description: 'Make a full backup',
		method: 'POST',
		path: '/archiveAll/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.exportAll(args.body.resolution);
			callback(null, result);
		},
	},
	{
		description: 'Make app backup',
		method: 'POST',
		path: '/archiveApp/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.exportApp(args.body.appId, args.body.resolution);
			callback(null, result);
		},
	},
	{
		description: 'Stop Export',
		method: 'GET',
		path: '/stopExport/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.stopExport();
			callback(null, result);
		},
	},
	{
		description: 'Show loglines',
		method: 'GET',
		path: '/getlogs/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.getLogs();
			callback(null, result);
		},
	},
	{
		description: 'Delete logs',
		method: 'GET',
		path: '/deletelogs/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.deleteLogs();
			callback(null, result);
		},
	},
];
