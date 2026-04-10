'use strict';

const fs = require('fs');
// eslint-disable-next-line import/no-unresolved, node/no-missing-require
const { createClient } = require('webdav');

class WebDavHelper {
  constructor(app) {
    this.app = app;
    this.client = null;
  }

  async test(webdavSettings) {
    this.app.log('testing WebDAV settings from frontend');
    try {
      const webdavClient = createClient(
        webdavSettings.webdavUrl,
        {
          username: webdavSettings.webdavUsername,
          password: webdavSettings.webdavPassword,
        }
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
      this.client = createClient(
        webdavSettings.webdavUrl,
        {
          username: webdavSettings.webdavUsername,
          password: webdavSettings.webdavPassword,
        }
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
}

module.exports = WebDavHelper;