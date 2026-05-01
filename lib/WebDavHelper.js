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

class WebDavHelper {
  constructor(app) {
    this.app = app;
    this.client = null;
    this.createClient = null;
  }

  async _loadWebDav() {
    if (!this.createClient) {
      // eslint-disable-next-line node/no-unsupported-features/es-syntax, import/no-unresolved, node/no-missing-import
      const webdav = await import('webdav');
      this.createClient = webdav.createClient;
    }
  }

  async test(webdavSettings) {
    this.app.log('testing WebDAV settings from frontend');
    try {
      await this._loadWebDav();
      const webdavClient = this.createClient(
        webdavSettings.webdavUrl,
        {
          username: webdavSettings.webdavUsername,
          password: webdavSettings.webdavPassword,
        },
      );
      await webdavClient.putFileContents('insights2csv.txt', 'Homey can write to this folder!');
      const quota = await webdavClient.getQuota();
      this.app.log('Connection successfull!');
      return Promise.resolve(quota);
    } catch (error) {
      this.app.error(error);
      return Promise.reject(error);
    }
  }

  async getClient(webdavSettings) {
    try {
      await this._loadWebDav();
      this.client = this.createClient(
        webdavSettings.webdavUrl,
        {
          username: webdavSettings.webdavUsername,
          password: webdavSettings.webdavPassword,
        },
      );
      return Promise.resolve(this.client);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async save(fileName, subfolder, webdavSettings, timestamp) {
    try {
      await this.getClient(webdavSettings);
      const folder = subfolder ? `/${subfolder}` : '';
      let webdavFileName = `${folder}/${fileName}`;

      if (webdavSettings.webdavUseSeperateFolders) {
        await this.client.createDirectory(`${folder}/${timestamp}/`)
          .then(() => {
            this.app.log(`${timestamp} folder created!`);
          })
          .catch(() => null);
        webdavFileName = `${folder}/${timestamp}/${fileName}`;
      }
      const options = { format: 'binary', overwrite: true };
      const webDavWriteStream = this.client.createWriteStream(webdavFileName, options);
      const fileStream = fs.createReadStream(`/userdata/${fileName}`);

      return new Promise((resolve, reject) => {
        let isDone = false;

        webDavWriteStream.on('finish', () => {
          this.app.log(`${fileName} has been saved to webDav`);
          if (!isDone) {
            isDone = true;
            resolve(fileName);
          }
        });

        webDavWriteStream.on('error', (err) => {
          this.app.error('webdavwritestream error: ', err.message || err);
          if (!isDone) {
            isDone = true;
            reject(err);
          }
        });

        fileStream.on('error', (err) => {
          this.app.log('filestream error: ', err);
          if (!isDone) {
            isDone = true;
            reject(err);
          }
        });

        fileStream.pipe(webDavWriteStream);
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async purge(daysOld, allTypes, webdavSettings) {
    try {
      await this.getClient(webdavSettings);
      const directoryItems = await this.client.getDirectoryContents('/');

      const selectList = directoryItems.filter((item) => {
        if (!allTypes && (item.type !== 'file' || !item.filename.toLowerCase().endsWith('.zip'))) return false;

        const itemDate = new Date(item.lastmod).getTime();
        const days = (Date.now() - itemDate) / (1000 * 60 * 60 * 24);
        return days > daysOld;
      });

      for (let idx = 0; idx < selectList.length; idx += 1) {
        const item = selectList[idx];
        this.app.log(`removing WebDAV item ${item.filename}`);
        await this.client.deleteFile(item.filename);
      }
      return Promise.resolve(selectList);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

module.exports = WebDavHelper;
