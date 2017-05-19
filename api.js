module.exports = [
	{
		description: 'Make a full backup',
		method: 'GET',
		path: '/archiveAll/',
		requires_authorizaton: false,
		fn: function( callback, args) {
			callback(null, Homey.app.api.archiveAll());
		},
	},
];
