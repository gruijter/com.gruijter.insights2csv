var SMB2Forge = require('../tools/smb2-forge');
var SMB2Request = SMB2Forge.request;

/*
 * mkdir
 * =====
 *
 * create folder:
 *
 *  - create the folder
 *
 *  - close the folder
 *
 */
module.exports = function mkdir(path, mode, cb) {
  if (typeof mode === 'function') {
    cb = mode;
    mode = '0777';
  }

  var connection = this;

  // SMB2 open file
  SMB2Request('create_folder', { path: path }, connection, function(err, file) {
    if (err) cb && cb(err);
    // SMB2 query directory
    else
      SMB2Request('close', file, connection, function() {
        cb && cb(null);
      });
  });
};
