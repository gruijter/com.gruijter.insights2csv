/* Documentation https://msdn.microsoft.com/en-us/library/cc246497.aspx */

module.exports = {
  /* 2.2.13 SMB2 CREATE Request:
     https://msdn.microsoft.com/en-us/library/cc246502.aspx */
  FILE_SUPERSEDE: 0x00000000,
  FILE_OPEN: 0x00000001,
  FILE_CREATE: 0x00000002,
  FILE_OPEN_IF: 0x00000003,
  FILE_OVERWRITE: 0x00000004,
  FILE_OVERWRITE_IF: 0x00000005,
  FILE_SHARE_NONE: 0x00000000,
  FILE_SHARE_READ: 0x00000001,
  FILE_SHARE_WRITE: 0x00000002,
  FILE_SHARE_DELETE: 0x00000004,

  DirectoryAccess: {
    FILE_LIST_DIRECTORY: 0x00000001, // This value indicates the right to enumerate the contents of the directory.
    FILE_ADD_FILE: 0x00000002, // This value indicates the right to create a file under the directory.
    FILE_ADD_SUBDIRECTORY: 0x00000004, // This value indicates the right to add a sub-directory under the directory.
    FILE_READ_EA: 0x00000008, // This value indicates the right to read the extended attributes of the directory.
    FILE_WRITE_EA: 0x00000010, // This value indicates the right to write or change the extended attributes of the directory.
    FILE_TRAVERSE: 0x00000020, // This value indicates the right to traverse this directory if the server enforces traversal checking.
    FILE_DELETE_CHILD: 0x00000040, // This value indicates the right to delete the files and directories within this directory.
    FILE_READ_ATTRIBUTES: 0x00000080, // This value indicates the right to read the attributes of the directory.
    FILE_WRITE_ATTRIBUTES: 0x00000100, // This value indicates the right to change the attributes of the directory.
    DELETE: 0x00010000, // This value indicates the right to delete the directory.
    READ_CONTROL: 0x00020000, // This value indicates the right to read the security descriptor for the directory.
    WRITE_DAC: 0x00040000, // This value indicates the right to change the DACL in the security descriptor for the directory. For the DACL data structure, see ACL in [MS-DTYP].
    WRITE_OWNER: 0x00080000, // This value indicates the right to change the owner in the security descriptor for the directory.
    SYNCHRONIZE: 0x00100000, // SMB2 clients set this flag to any value.<43> SMB2 servers SHOULD<44> ignore this flag.
    ACCESS_SYSTEM_SECURITY: 0x01000000, // This value indicates the right to read or change the SACL in the security descriptor for the directory. For the SACL data structure, see ACL in [MS-DTYP].<45>
    MAXIMUM_ALLOWED: 0x02000000, // This value indicates that the client is requesting an open to the directory with the highest level of access the client has on this directory. If no access is granted for the client on this directory, the server MUST fail the open with STATUS_ACCESS_DENIED.
    GENERIC_ALL: 0x10000000, // This value indicates a request for all the access flags that are listed above except MAXIMUM_ALLOWED and ACCESS_SYSTEM_SECURITY.
    GENERIC_EXECUTE: 0x20000000, // This value indicates a request for the following access flags listed above: FILE_READ_ATTRIBUTES| FILE_TRAVERSE| SYNCHRONIZE| READ_CONTROL.
    GENERIC_WRITE: 0x40000000, // This value indicates a request for the following access flags listed above: FILE_ADD_FILE| FILE_ADD_SUBDIRECTORY| FILE_WRITE_ATTRIBUTES| FILE_WRITE_EA| SYNCHRONIZE| READ_CONTROL.
    GENERIC_READ: 0x80000000, // This value indicates a request for the following access flags listed above: FILE_LIST_DIRECTORY| FILE_READ_ATTRIBUTES| FILE_READ_EA| SYNCHRONIZE| READ_CONTROL.
  },
};
