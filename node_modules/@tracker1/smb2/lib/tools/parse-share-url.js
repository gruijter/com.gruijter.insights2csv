var URL = require('url');

module.exports = share => {
  if (!share) {
    throw new Error('The share is not specified');
  }
  share = share.replace(/\\/g, '/');

  const ret = {
    fullPath: null,
    host: null,
    port: null,
    shareName: null,
    domain: null,
    username: null,
    password: null,
  };

  let smbUrl = URL.parse(share);
  if (!smbUrl.protocol) smbUrl = URL.parse(`smb:${share}`);
  if (smbUrl.protocol !== 'smb:' && smbUrl.protocol !== 'cifs:') {
    throw new Error('Invalid share protocol');
  }

  if (!smbUrl.hostname) {
    throw new Error('Invalid share, use "\\hostshare" or "smb://host/share"');
  }

  const shareName = smbUrl.pathname
    .split('/')
    .filter(p => p)
    .join('/');
  if (/\//.test(shareName)) {
    throw new Error('Invalid share, deep paths are not allowed');
  }

  ret.shareName = shareName;
  ret.port = smbUrl.port;
  ret.host = smbUrl.hostname;
  ret.fullPath = `\\\\${smbUrl.hostname}\\${shareName}`;

  if (smbUrl.auth) {
    const auth = smbUrl.href
      .match(/\/\/([^@]+)@/)[1]
      .split(/\:/)
      .map(v => decodeURIComponent(v));
    if (auth.length) {
      const du = auth.shift().split(/[\\\/]/);
      ret.username = du.pop(); // last part
      ret.domain = du.shift() || null; // first part or undefined
    }
    if (auth.length) {
      ret.password = auth.shift();
    }
  }

  return ret;
};
