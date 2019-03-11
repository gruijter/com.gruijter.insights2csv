const SMB2Message = require('../tools/smb2-message');
const message = require('../tools/message');
const { DirectoryAccess, ...constants } = require('../structures/constants');

module.exports = message({
  generate: function(connection, params) {
    var buffer = new Buffer(params.path, 'ucs2');

    return new SMB2Message({
      headers: {
        Command: 'CREATE',
        SessionId: connection.SessionId,
        TreeId: connection.TreeId,
        ProcessId: connection.ProcessId,
      },
      request: {
        Buffer: buffer,
        NameOffset: 0x0078,
        CreateContextsOffset: 0x007a + buffer.length,
        /*
        ShareAccess: constants.FILE_SHARE_NONE,
        DesiredAccess: DirectoryAccess.FILE_LIST_DIRECTORY | DirectoryAccess.FILE_ADD_FILE | DirectoryAccess.FILE_ADD_SUBDIRECTORY,
        */
      },
    });
  },
});
