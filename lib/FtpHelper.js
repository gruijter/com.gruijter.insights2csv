/*
Copyright 2017 - 2026 Robin de Gruijter

This file is part of com.gruijter.insights2csv.

com.gruijter.insights2csv is free software: you can redistribute it and/or
modify it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.insights2csv is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License along
with com.gruijter.insights2csv. If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const fs = require('fs');
const ftp = require('basic-ftp');
const { Readable } = require('stream');
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved, node/no-missing-require
const SftpClient = require('ssh2-sftp-client');

class FtpHelper {
  constructor(app) {
    this.app = app;
    this.client = null;
    this._mutex = Promise.resolve();
  }

  async _lock() {
    let release;
    const nextMutex = new Promise((resolve) => { release = resolve; });
    const currentMutex = this._mutex;
    this._mutex = currentMutex.then(() => nextMutex);
    await currentMutex;
    return release;
  }

  async test(FTPSettings) {
    this.app.log('testing FTP settings from frontend');
    try {
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        try {
          await sftp.connect({
            host: FTPSettings.FTPHost,
            port: FTPSettings.FTPPort || 22,
            username: FTPSettings.FTPUsername,
            password: FTPSettings.FTPPassword,
          });
          const testDir = FTPSettings.FTPFolder ? FTPSettings.FTPFolder.replace(/\/+/g, '/') : '.';
          if (testDir !== '.' && testDir !== '/') {
            try {
              const dirExists = await sftp.exists(testDir);
              if (!dirExists) {
                await sftp.mkdir(testDir, true);
              }
            } catch (err) {
              throw new Error(`Could not create folder: ${err.message}`);
            }
          }
          const targetPath = testDir === '.' ? 'insights2csv.txt' : `${testDir}/insights2csv.txt`.replace(/\/+/g, '/');
          try {
            await sftp.put(Buffer.from('Homey can write to this folder!'), targetPath);
          } catch (err) {
            throw new Error(`Write permission denied. Cannot upload to folder: ${err.message}`);
          }
          try {
            await sftp.delete(targetPath);
          } catch (err) { }

          this.app.log('Connection successfull!');
        } finally {
          await sftp.end().catch(() => { });
        }
      } else {
        const client = new ftp.Client();
        try {
          client.ftp.verbose = true;
          await client.access({
            host: FTPSettings.FTPHost,
            port: FTPSettings.FTPPort || 21,
            user: FTPSettings.FTPUsername,
            password: FTPSettings.FTPPassword,
            secure: protocol === 'ftps',
            secureOptions: { rejectUnauthorized: false },
          });
          const testDir = FTPSettings.FTPFolder ? FTPSettings.FTPFolder.replace(/\/+/g, '/') : '.';
          if (testDir !== '.' && testDir !== '/') {
            try {
              await client.ensureDir(testDir);
            } catch (err) {
              throw new Error(`Could not create folder: ${err.message}`);
            }
          }

          const stream = Readable.from(['Homey can write to this folder!']);
          try {
            if (typeof client.uploadFrom === 'function') {
              await client.uploadFrom(stream, 'insights2csv.txt');
            } else {
              await client.upload(stream, 'insights2csv.txt');
            }
          } catch (err) {
            throw new Error(`Write permission denied. Cannot upload to folder: ${err.message}`);
          }
          try {
            await client.remove('insights2csv.txt');
          } catch (err) { }

          this.app.log('Connection successfull!');
        } finally {
          if (!client.closed) client.close();
        }
      }
      return Promise.resolve();
    } catch (error) {
      const msg = error.message || String(error);
      this.app.error(`FTP Test Error: ${msg}`);
      return Promise.reject(new Error(msg));
    }
  }

  async getClient(FTPSettings) {
    try {
      if (this.client && !this.client.closed) {
        return Promise.resolve(this.client);
      }
      if (this.client instanceof ftp.Client) {
        this.app.log('closing FTP client');
        this.client.close();
      }
      this.client = new ftp.Client();
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');
      await this.client.access({
        host: FTPSettings.FTPHost,
        port: FTPSettings.FTPPort,
        user: FTPSettings.FTPUsername,
        password: FTPSettings.FTPPassword,
        secure: protocol === 'ftps',
        secureOptions: {
          host: FTPSettings.FTPHost,
          rejectUnauthorized: false,
        },
      });
      this.initialCwd = await this.client.pwd();
      return Promise.resolve(this.client);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async save(fileName, subfolder, FTPSettings, timestamp) {
    const release = await this._lock();
    try {
      const fileStream = fs.createReadStream(`/userdata/${fileName}`);
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');

      const pathParts = [];
      if (FTPSettings.FTPFolder) pathParts.push(FTPSettings.FTPFolder);
      if (subfolder) pathParts.push(subfolder);
      if (FTPSettings.FTPUseSeperateFolders) pathParts.push(timestamp);
      const remoteDir = pathParts.length > 0 ? pathParts.join('/').replace(/\/+/g, '/') : '.';

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        try {
          await sftp.connect({
            host: FTPSettings.FTPHost,
            port: FTPSettings.FTPPort || 22,
            username: FTPSettings.FTPUsername,
            password: FTPSettings.FTPPassword,
          });

          if (remoteDir !== '.' && remoteDir !== '/') {
            const dirExists = await sftp.exists(remoteDir);
            if (!dirExists) {
              await sftp.mkdir(remoteDir, true);
            }
          }
          const targetPath = remoteDir === '.' ? fileName : `${remoteDir}/${fileName}`.replace(/\/+/g, '/');
          await sftp.put(fileStream, targetPath);
          this.app.log(`${fileName} has been saved to SFTP`);
        } finally {
          await sftp.end().catch(() => { });
        }
      } else {
        await this.getClient(FTPSettings);
        if (this.initialCwd) {
          await this.client.cd(this.initialCwd);
        }
        if (remoteDir !== '.' && remoteDir !== '/') {
          await this.client.ensureDir(remoteDir);
        }
        if (typeof this.client.uploadFrom === 'function') {
          await this.client.uploadFrom(fileStream, fileName);
        } else {
          await this.client.upload(fileStream, fileName);
        }
        this.app.log(`${fileName} has been saved to FTP(S)`);
      }
      return Promise.resolve(fileName);
    } catch (error) {
      this.app.error('error:', error);
      return Promise.reject(error);
    } finally {
      release();
    }
  }

  async purge(daysOld, allTypes, FTPSettings) {
    const release = await this._lock();
    try {
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');
      let selectList = [];

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        try {
          await sftp.connect({
            host: FTPSettings.FTPHost,
            port: FTPSettings.FTPPort || 22,
            username: FTPSettings.FTPUsername,
            password: FTPSettings.FTPPassword,
          });
          const remoteDir = FTPSettings.FTPFolder ? FTPSettings.FTPFolder.replace(/\/+/g, '/') : '.';
          if (remoteDir !== '.' && remoteDir !== '/') {
            const dirExists = await sftp.exists(remoteDir);
            if (!dirExists) {
              await sftp.mkdir(remoteDir, true);
            }
          }
          selectList = await sftp.list(remoteDir);

          if (!allTypes) {
            selectList = selectList.filter((item) => item.type === '-' && item.name.toLowerCase().endsWith('.zip'));
          }
          selectList = selectList.filter((item) => {
            const days = (Date.now() - item.modifyTime) / 1000 / 60 / 60 / 24;
            return days > daysOld;
          });
          for (let idx = 0; idx < selectList.length; idx += 1) {
            const item = selectList[idx];
            const targetPath = remoteDir === '.' ? item.name : `${remoteDir}/${item.name}`.replace(/\/+/g, '/');
            if (item.type === '-') {
              this.app.log(`removing SFTP file ${item.name}`);
              await sftp.delete(targetPath);
            } else if (item.type === 'd') {
              this.app.log(`removing SFTP folder ${item.name}`);
              await sftp.rmdir(targetPath, true);
            }
          }
        } finally {
          await sftp.end().catch(() => { });
        }
      } else {
        await this.getClient(FTPSettings);
        if (this.initialCwd) {
          await this.client.cd(this.initialCwd);
        }
        const remoteDir = FTPSettings.FTPFolder ? FTPSettings.FTPFolder.replace(/\/+/g, '/') : '.';
        if (remoteDir !== '.' && remoteDir !== '/') {
          await this.client.ensureDir(remoteDir);
        }

        selectList = await this.client.list();

        if (!allTypes) {
          selectList = selectList.filter((item) => item.type === 1 && item.name.toLowerCase().endsWith('.zip'));
        }
        selectList = selectList.filter((item) => {
          let dateString = item.date;
          if (dateString.length < 18) {
            const year = new Date().getFullYear();
            dateString = `${year} ${dateString}`;
          }
          const days = (Date.now() - new Date(dateString)) / 1000 / 60 / 60 / 24;
          return days > daysOld;
        });
        for (let idx = 0; idx < selectList.length; idx += 1) {
          const item = selectList[idx];
          if (item.type === 1) {
            this.app.log(`removing FTP file ${item.name}`);
            await this.client.remove(item.name);
          }
          if (item.type === 2) {
            this.app.log(`removing FTP folder ${item.name}`);
            try {
              // Basic-ftp cannot delete non-empty folders, so clear it first
              await this.client.cd(item.name);
              await this.client.clearWorkingDir();
              await this.client.cd('..');
              await this.client.removeDir(item.name);
            } catch (e) {
              this.app.error(`Failed to remove FTP folder: ${e.message}`);
            }
          }
        }
      }
      return Promise.resolve(selectList);
    } catch (error) {
      return Promise.reject(error);
    } finally {
      release();
    }
  }
}

module.exports = FtpHelper;
