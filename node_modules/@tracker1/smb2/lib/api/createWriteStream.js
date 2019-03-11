const Bigint = require('../tools/bigint');
const util = require('util');
const { request } = require('../tools/smb2-forge');
const { Writable } = require('stream');
const {
  FILE_OPEN,
  FILE_OPEN_IF,
  FILE_OVERWRITE_IF,
  FILE_CREATE,
} = require('../structures/constants');

const requestAsync = util.promisify(request);

const delay = ms => new Promise(r => setTimeout(r, ms));

const maxPacketSize = new Bigint(8, 0x00010000 - 0x71);

function* fibonacci() {
  let a = 1;
  let b = 2;

  for (;;) {
    const c = a;
    a = b;
    b = c + a;
    yield c;
  }
}

class SmbWritableStream extends Writable {
  constructor(connection, file, options = {}) {
    super(options);

    const { encoding = 'utf8' } = options;

    this.connection = connection;
    this.encoding = encoding;
    this.file = file;
    this.offset = new Bigint(8, 0);
    this.dataInFlight = 0;
    this.chunkPromises = [];

    this.once('finish', this.close);
  }

  _write(chunk, encoding, next) {
    var self = this;
    encoding = self.encoding || encoding;
    chunk = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, encoding);

    var chunkLength = chunk.length;
    self.dataInFlight += chunkLength;

    var fileLength = new Bigint(self.offset);
    fileLength = fileLength.add(chunkLength);

    // console.log('Write SMB chunk', self.offset.toNumber(), chunk.length);

    var promises = [];

    while (chunk.length > 0) {
      const packetSize = Math.min(maxPacketSize.toNumber(), chunk.length);
      const packet = chunk.slice(0, packetSize);
      chunk = chunk.slice(packetSize);
      const offset = new Bigint(self.offset);
      self.offset = self.offset.add(packetSize);

      const retryInterval = fibonacci();

      function uploadChunk() {
        // console.log('Write SMB packet', offset.toNumber(), packet.length);

        return requestAsync(
          'write',
          {
            FileId: self.file.FileId,
            Offset: offset.toBuffer(),
            Buffer: packet,
          },
          self.connection,
        ).catch(function(err) {
          if (error.code === 'STATUS_PENDING') {
            // console.log('SMB request pending, retrying later');

            return delay(retryInterval.next().value).then(function() {
              return uploadChunk();
            });
          } else {
            throw error;
          }
        });
      }

      promises.push(uploadChunk());
    }

    var nextCalled = false;

    var chunkPromise = Promise.all(promises)
      .finally(function() {
        self.dataInFlight -= chunkLength;
      })
      .then(
        function() {
          // console.log('Write SMB chunk', self.offset.toNumber(), 'done');

          if (!nextCalled) {
            next(null);
            nextCalled = true;
          }
        },
        function(err) {
          if (!nextCalled) {
            next(err);
            nextCalled = true;
          }
        },
      );

    if (self.dataInFlight < 10 * 1000 * 1000) {
      // Allow 10 Mb in flight
      if (!nextCalled) {
        next(null);
        nextCalled = true;
      }
    }

    self.chunkPromises.push(chunkPromise);
  }

  close() {
    var self = this;
    // console.log('Closing SMB file');

    Promise.all(self.chunkPromises)
      .then(function() {
        // console.log('All chunks complete');

        request('close', self.file, self.connection, function(err) {
          if (err) {
            console.error('Failed to close file');
            self.emit('error', err);
          } else {
            self.emit('close');
          }
        });
      })
      .catch(function(err) {
        console.error('Failed to write all chunks');
        self.emit('error', err);
      });
  }
}

module.exports = function(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  let createDisposition;
  const flags = options && options.flags;

  if (flags === 'r') {
    createDisposition = FILE_OPEN;
  } else if (flags === 'r+') {
    createDisposition = FILE_OPEN_IF;
  } else if (flags === 'w' || flags === 'w+') {
    createDisposition = FILE_OVERWRITE_IF;
  } else if (flags === 'wx' || flags === 'w+x') {
    createDisposition = FILE_CREATE;
  }

  request('create', { path, createDisposition }, this, (err, file) => {
    if (err) {
      cb(err);
    } else {
      cb(null, new SmbWritableStream(this, file, options));
    }
  });
};
