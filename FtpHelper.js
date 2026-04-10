'use strict';

const fs = require('fs');
const ftp = require('basic-ftp');
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved, node/no-missing-require
const SftpClient = require('ssh2-sftp-client');

class FtpHelper {
  constructor(app) {
    this.app = app;
    this.client = null;
  }

  async test(FTPSettings) {
    this.app.log('testing FTP settings from frontend');
    try {
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        await sftp.connect({
          host: FTPSettings.FTPHost,
          port: FTPSettings.FTPPort || 22,
          username: FTPSettings.FTPUsername,
          password: FTPSettings.FTPPassword,
        });
        await sftp.mkdir(`/${FTPSettings.FTPFolder}`, true);
        this.app.log('Connection successfull!');
        await sftp.end();
      } else {
        const client = new ftp.Client();
        client.ftp.verbose = true;
        await client.access({
          host: FTPSettings.FTPHost,
          port: FTPSettings.FTPPort || 21,
          user: FTPSettings.FTPUsername,
          password: FTPSettings.FTPPassword,
          secure: protocol === 'ftps',
          secureOptions: { rejectUnauthorized: false },
        });
        await client.ensureDir(FTPSettings.FTPFolder);
        this.app.log('Connection successfull!');
        client.close();
      }
      return Promise.resolve();
    } catch (error) {
      this.app.error(error);
      return Promise.reject(error);
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
      return Promise.resolve(this.client);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async save(fileName, subfolder, FTPSettings, timestamp) {
    try {
      const sub = subfolder ? `/${subfolder}` : '';
      const folder = `//${FTPSettings.FTPFolder}${sub}`;
      const fileStream = fs.createReadStream(`/userdata/${fileName}`);
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        await sftp.connect({
          host: FTPSettings.FTPHost,
          port: FTPSettings.FTPPort || 22,
          username: FTPSettings.FTPUsername,
          password: FTPSettings.FTPPassword,
        });
        const remoteDir = `/${FTPSettings.FTPFolder}${sub}${FTPSettings.FTPUseSeperateFolders ? `/${timestamp}` : ''}`;
        await sftp.mkdir(remoteDir, true);
        await sftp.put(fileStream, `${remoteDir}/${fileName}`);
        this.app.log(`${fileName} has been saved to SFTP`);
        await sftp.end();
      } else {
        await this.getClient(FTPSettings);
        await this.client.ensureDir(`//${folder}`);
        if (FTPSettings.FTPUseSeperateFolders) {
          await this.client.ensureDir(`//${folder}/${timestamp}`);
        }
        await this.client.upload(fileStream, fileName);
        this.app.log(`${fileName} has been saved to FTP(S)`);
      }
      return Promise.resolve(fileName);
    } catch (error) {
      this.app.error('error:', error);
      return Promise.reject(error);
    }
  }

  async purge(daysOld, allTypes, FTPSettings) {
    try {
      const protocol = FTPSettings.FTPProtocol || (FTPSettings.useSFTP ? 'ftps' : 'ftp');
      let selectList = [];

      if (protocol === 'sftp') {
        const sftp = new SftpClient();
        await sftp.connect({
          host: FTPSettings.FTPHost,
          port: FTPSettings.FTPPort || 22,
          username: FTPSettings.FTPUsername,
          password: FTPSettings.FTPPassword,
        });
        const remoteDir = `/${FTPSettings.FTPFolder}`;
        await sftp.mkdir(remoteDir, true);
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
          if (item.type === '-') {
            this.app.log(`removing SFTP file ${item.name}`);
            await sftp.delete(`${remoteDir}/${item.name}`);
          } else if (item.type === 'd') {
            this.app.log(`removing SFTP folder ${item.name}`);
            await sftp.rmdir(`${remoteDir}/${item.name}`, true);
          }
        }
        await sftp.end();
      } else {
        await this.getClient(FTPSettings);
        await this.client.ensureDir(`//${FTPSettings.FTPFolder}`);
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
            await this.client.removeDir(item.name);
          }
        }
      }
      return Promise.resolve(selectList);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

module.exports = FtpHelper;