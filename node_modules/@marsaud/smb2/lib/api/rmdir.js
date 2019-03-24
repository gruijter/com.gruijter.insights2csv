var SMB2Forge = require('../tools/smb2-forge');
var SMB2Request = SMB2Forge.request;
var BigInt = require('../tools/bigint');

/*
 * rmdir
 * =====
 *
 * remove directory:
 *
 *  - open the folder
 *
 *  - remove the folder
 *
 *  - close the folder
 *
 */
module.exports = function rmdir(path, cb) {
  var connection = this;

  // SMB2 open file
  SMB2Request('open_folder', { path: path }, connection, function(err, file) {
    if (err) cb && cb(err);
    // SMB2 query directory
    else
      SMB2Request(
        'set_info',
        {
          FileId: file.FileId,
          FileInfoClass: 'FileDispositionInformation',
          Buffer: new BigInt(1, 1).toBuffer(),
        },
        connection,
        function(err, files) {
          SMB2Request('close', file, connection, function() {
            if (err) {
              return cb(err);
            }
            cb(null, files);
          });
        }
      );
  });
};
