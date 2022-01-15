var parseFlags = require('../tools/parse-flags');
var request = require('../tools/smb2-forge').request;

module.exports = function open(path, flags, cb) {
  if (typeof flags === 'function') {
    cb = flags;
    flags = undefined;
  }

  request(
    'create',
    { createDisposition: parseFlags(flags || 'r'), path: path },
    this,
    cb
  );
};
