var SMB2Message = require('../tools/smb2-message');
var message = require('../tools/message');
var constants = require('../structures/constants');

module.exports = message({
  generate: function(connection, params) {
    var buffer = new Buffer(params.path, 'ucs2');
    var shareAccess = params.shareAccess;
    var createDisposition = params.createDisposition;

    /* See: https://msdn.microsoft.com/en-us/library/cc246502.aspx
       7 possible values for ShareAccess. */
    if (!(shareAccess >= 0 && shareAccess <= 7)) {
      shareAccess = constants.FILE_SHARE_NONE;
    }

    /* See: https://msdn.microsoft.com/en-us/library/cc246502.aspx
       6 values for CreateDisposition. */
    if (!(createDisposition >= 0 && createDisposition <= 5)) {
      createDisposition = constants.FILE_OVERWRITE_IF;
    }

    return new SMB2Message({
      headers: {
        Command: 'CREATE',
        SessionId: connection.SessionId,
        TreeId: connection.TreeId,
        ProcessId: connection.ProcessId,
      },
      request: {
        Buffer: buffer,
        DesiredAccess: 0x001701df,
        FileAttributes: 0x00000080,
        ShareAccess: shareAccess,
        CreateDisposition: createDisposition,
        CreateOptions: 0x00000044,
        NameOffset: 0x0078,
        CreateContextsOffset: 0x007a + buffer.length,
      },
    });
  },
});
