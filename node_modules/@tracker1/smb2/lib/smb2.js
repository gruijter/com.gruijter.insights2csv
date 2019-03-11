var parseShareUrl = require('./tools/parse-share-url');

/*
 * CONSTANTS
 */
var shareRegExp = /\\\\([^\\]*)\\([^\\]*)\\?/,
  port = 445,
  packetConcurrency = 20,
  autoCloseTimeout = 10000;

/*
 * DEPENDENCIES
 */
var SMB2Connection = require('./tools/smb2-connection');

/*
 * CONSTRUCTOR
 */
var SMB = (module.exports = function(opt) {
  if (typeof opt === 'string') opt = { share: opt };
  opt = Object.assign({}, opt);

  // Parse share-string
  const share = parseShareUrl(opt.share);

  // resolve IP from NetBios
  // this.ip = netBios.resolve(matches[0]);
  this.ip = share.host;

  // set default port
  this.port = opt.port || share.port || port;

  // set message id
  this.messageId = 0;

  // extract share
  this.share = share.shareName;

  // save the full path
  this.fullPath = share.fullPath;

  // packet concurrency default 20
  this.packetConcurrency = opt.packetConcurrency || packetConcurrency;

  // close timeout default 10s
  if (opt.autoCloseTimeout !== undefined) {
    this.autoCloseTimeout = opt.autoCloseTimeout;
  } else {
    this.autoCloseTimeout = autoCloseTimeout;
  }

  // store authentification
  this.domain = opt.domain || share.domain || 'WORKSTATION';
  this.username = opt.username || share.username;
  this.password = opt.password || share.password;

  // set session id
  this.SessionId = Math.floor(Math.random() * 256) & 0xff;

  // set the process id
  // https://msdn.microsoft.com/en-us/library/ff470100.aspx
  this.ProcessId = new Buffer([
    Math.floor(Math.random() * 256) & 0xff,
    Math.floor(Math.random() * 256) & 0xff,
    Math.floor(Math.random() * 256) & 0xff,
    Math.floor(Math.random() * 256) & 0xfe,
  ]);

  // activate debug mode
  this.debug = opt.debug;

  // init connection (socket)
  SMB2Connection.init(this);
});

/*
 * PROTOTYPE
 */
var proto = (SMB.prototype = {});

proto.close = require('./api/close');

proto.exists = SMB2Connection.requireConnect(require('./api/exists'));

proto.rename = SMB2Connection.requireConnect(require('./api/rename'));

proto.readFile = SMB2Connection.requireConnect(require('./api/readfile'));
proto.createReadStream = SMB2Connection.requireConnect(require('./api/createReadStream'));
proto.createWriteStream = SMB2Connection.requireConnect(require('./api/createWriteStream'));
proto.writeFile = SMB2Connection.requireConnect(require('./api/writefile'));
proto.unlink = SMB2Connection.requireConnect(require('./api/unlink'));

proto.readdir = SMB2Connection.requireConnect(require('./api/readdir'));
proto.rmdir = SMB2Connection.requireConnect(require('./api/rmdir'));
proto.mkdir = SMB2Connection.requireConnect(require('./api/mkdir'));

proto.ensureDir = SMB2Connection.requireConnect(require('./api/ensureDir'));
proto.getSize = SMB2Connection.requireConnect(require('./api/getSize'));
proto.connect = SMB2Connection.requireConnect(function(cb) {
  cb();
});
