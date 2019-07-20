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
				.then(result => callback(null, result))
				.catch(error => callback(error));
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
				.then(result => callback(null, result))
				.catch(error => callback(error));
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
				.then(result => callback(null, result))
				.catch(error => callback(error));
		},
	},
	{
		description: 'Make a full backup',
		method: 'GET',
		path: '/archiveAll/',
		requires_authorization: true,
		role: 'owner',
		fn: function fn(args, callback) {
			const result = Homey.app.archiveAll();
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
