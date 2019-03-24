var SMB2Forge = require('../tools/smb2-forge');
var SMB2Request = SMB2Forge.request;

/*
 * readdir
 * =======
 *
 * list the file / directory from the path provided:
 *
 *  - open the directory
 *
 *  - query directory content
 *
 *  - close the directory
 *
 */
module.exports = function readdir(path, cb) {
  var connection = this;

  // SMB2 open directory
  SMB2Request('open', { path: path }, connection, function(err, file) {
    if (err) cb && cb(err);
    // SMB2 query directory
    else
      SMB2Request('query_directory', file, connection, function(err, files) {
        SMB2Request('close', file, connection, function() {
          if (err) cb && cb(err);
          // SMB2 close directory
          else
            cb &&
              cb(
                null,
                files
                  .map(function(v) {
                    return v.Filename;
                  }) // get the filename only
                  .filter(function(v) {
                    return v !== '.' && v !== '..';
                  }) // remove '.' and '..' values
              );
        });
      });
  });
};
