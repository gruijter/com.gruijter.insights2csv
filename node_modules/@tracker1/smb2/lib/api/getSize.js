const { request } = require('../tools/smb2-forge');

module.exports = (path, cb) => {
  path = path.replace(/[\\\/]+/g, '\\').replace(/^\\/, '');
  request('open', { path }, this, (err, file) => {
    if (err) {
      if (err.code === 'STATUS_OBJECT_NAME_NOT_FOUND') {
        err.code = 'ENOENT';
      }
      cb(err);
    } else {
      let fileLength = 0;
      for (let i = 0; i < file.EndofFile.length; i++) {
        fileLength += file.EndofFile[i] * Math.pow(2, i * 8);
      }
      cb(null, fileLength);
    }
  });
};
