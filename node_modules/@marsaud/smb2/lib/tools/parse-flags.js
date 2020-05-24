var c = require('../structures/constants');

module.exports = function parseFlags(flags) {
  var chars = { __proto__: null };
  for (var i = 0, n = flags.length; i < n; ++i) {
    chars[flags[i]] = true;
  }

  if ('r' in chars) {
    return c.FILE_OPEN;
  }
  if ('x' in chars) {
    return c.FILE_CREATE;
  }
  if ('a' in chars) {
    return c.FILE_OPEN_IF;
  }
  if ('w' in chars) {
    return c.FILE_OVERWRITE_IF;
  }
  throw new Error('invalid flags');
};
