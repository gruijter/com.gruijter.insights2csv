var SMB2Forge = require('../tools/smb2-forge');
var SMB2Request = SMB2Forge.request;
var BigInt = require('../tools/bigint');

/*
 * unlink
 * ======
 *
 * remove file:
 *
 *  - open the file
 *
 *  - remove the file
 *
 *  - close the file
 *
 */
module.exports = function unlink(path, cb) {
  var connection = this;

  // SMB2 open file
  SMB2Request('create', { path: path }, connection, function(err, file) {
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
            if (err) cb && cb(err);
            else cb && cb(null, files);
          });
        }
      );
  });
};
