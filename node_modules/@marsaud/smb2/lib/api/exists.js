var SMB2Forge = require('../tools/smb2-forge');
var SMB2Request = SMB2Forge.request;

/*
 * exists
 * ======
 *
 * test the existence of a file
 *
 *  - try to open the file
 *
 *  - close the file
 *
 */
module.exports = function exists(path, cb) {
  var connection = this;

  SMB2Request('open', { path: path }, connection, function(err, file) {
    if (err != null) {
      if (
        err.code === 'STATUS_OBJECT_NAME_NOT_FOUND' ||
        err.code === 'STATUS_OBJECT_PATH_NOT_FOUND'
      ) {
        return cb && cb(null, false);
      }
      return cb && cb(err);
    }

    SMB2Request('close', file, connection, function() {
      cb && cb(null, true);
    });
  });
};
