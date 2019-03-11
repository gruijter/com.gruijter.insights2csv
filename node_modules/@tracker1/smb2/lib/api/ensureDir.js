const { request } = require('../tools/smb2-forge');
const util = require('util');

const requestAsync = util.promisify(request);

const ensureOneDir = async (path, connection) => {
  try {
    // console.log('ensureOneDir', path, connection);
    const fileOrDir = await requestAsync('open', { path }, connection);
    if (fileOrDir.FileAttributes.readIntBE(0, 1) === 0x00000010) {
      // See http://download.microsoft.com/DOWNLOAD/9/5/E/95EF66AF-9026-4BB0-A41D-A4F81802D92C/[MS-FSCC].pdf Section 2.6
      await requestAsync('close', fileOrDir, connection);
    } else {
      throw new Error(`${path} exists but is not a directory`);
    }
  } catch (err) {
    if (err.code === 'STATUS_OBJECT_NAME_NOT_FOUND') {
      try {
        await requestAsync('create_folder', { path }, connection);
      } catch (err) {
        if (err.code !== 'STATUS_OBJECT_NAME_COLLISION') {
          throw err;
        }
      }
    } else {
      throw err;
    }
  }
};

const ensureDir = async (path, connection) => {
  const structure = path.split(/[\\\/]/g).filter(p => p);
  const base = [];
  while (structure.length) {
    base.push(structure.shift());
    const basePath = base.join('\\');
    if (!basePath.length) {
      continue;
    }
    await ensureOneDir(basePath, connection);
  }
};

module.exports = function(path, cb) {
  ensureDir(path, this).then(() => cb(), cb);
};
