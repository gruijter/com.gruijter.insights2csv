var SMB2Forge = require('../tools/smb2-forge'),
  SMB2Request = SMB2Forge.request;
const FILE_ATTRIBUTE_DIRECTORY = 16; // https://msdn.microsoft.com/fr-fr/library/windows/desktop/gg258117(v=vs.85).aspx
var FileTime = require('win32filetime');
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
module.exports = function(path, options, cb) {
  path = path.replace(/[\\\/]+/g, '\\').replace(/^\\/, '');
  var connection = this;

  if (typeof options == 'function') {
    cb = options;
    options = {};
  }

  // SMB2 open directory
  SMB2Request('open', { path: path }, connection, function(err, file) {
    if (err) cb && cb(err);
    else
      // SMB2 query directory
      SMB2Request('query_directory', file, connection, function(err, files) {
        if (err && err.code != 'STATUS_NO_MORE_FILES') cb && cb(err);
        else goonQueryDir(file, connection, files, options, cb);
        //if(err) cb && cb(err);
        // SMB2 close directory
        //else SMB2Request('close', file, connection, function(err){
        //  cb && cb(
        //    null
        //  , files
        //      .map(function(v){ return v.Filename }) // get the filename only
        //      .filter(function(v){ return v!='.' && v!='..' }) // remove '.' and '..' values
        //  );
        //});
      });
  });
};

function goonQueryDir(file, connection, files, options, cb) {
  var newParams = file;
  newParams.FileIndex = files.length - 1;
  SMB2Request('query_directory_goon', file, connection, function(err, newFiles) {
    var currentFiles = newFiles ? files.concat(newFiles) : files;
    if (err) {
      if (err.code != 'STATUS_NO_MORE_FILES') {
        cb && cb(err);
      } else {
        // SMB2 close directory
        SMB2Request('close', file, connection, function(err) {
          cb &&
            cb(
              err,
              // remove '.' and '..' values.
              currentFiles
                .filter(function(v) {
                  let reg = true;
                  if (options.regex) {
                    reg = options.regex.test(v.Filename);
                  }
                  return v.Filename != '.' && v.Filename != '..' && reg;
                })
                .map(function(v) {
                  buffer = v.CreationTime;
                  var low = buffer.readUInt32LE(0);
                  var high = buffer.readUInt32LE(4);
                  v.CreationTime = FileTime.toDate({
                    low: low,
                    high: high,
                  }).toISOString();

                  buffer = v.LastAccessTime;
                  var low = buffer.readUInt32LE(0);
                  var high = buffer.readUInt32LE(4);
                  v.LastAccessTime = FileTime.toDate({
                    low: low,
                    high: high,
                  }).toISOString();

                  buffer = v.LastWriteTime;
                  var low = buffer.readUInt32LE(0);
                  var high = buffer.readUInt32LE(4);
                  v.LastWriteTime = FileTime.toDate({
                    low: low,
                    high: high,
                  }).toISOString();

                  buffer = v.ChangeTime;
                  var low = buffer.readUInt32LE(0);
                  var high = buffer.readUInt32LE(4);
                  v.ChangeTime = FileTime.toDate({
                    low: low,
                    high: high,
                  }).toISOString();

                  var isDirectory = v.FileAttributes & FILE_ATTRIBUTE_DIRECTORY ? true : false;

                  return {
                    fileChangeTime: v.ChangeTime,
                    fileLastAccessTime: v.LastAccessTime,
                    fileLastWriteTime: v.LastWriteTime,
                    fileCreationTime: v.CreationTime,
                    fileAttributes: v.FileAttributes,
                    isDirectory: isDirectory,
                    filename: v.Filename,
                  };
                }),
            );
        });
      }
    } else {
      goonQueryDir(file, connection, currentFiles, options, cb);
    }
  });
}
