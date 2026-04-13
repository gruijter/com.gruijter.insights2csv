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
const SMB2 = require('@tryjsky/v9u-smb2');

class SmbHelper {
  constructor(app) {
    this.app = app;
    this.client = null;
  }

  _handleError(error) {
    let msg = 'Unknown SMB Error';
    if (error && error.header && error.header.status !== undefined) {
      const statusHex = (error.header.status >>> 0).toString(16).toUpperCase();
      msg = `SMB Error 0x${statusHex}`;
      if (statusHex === 'C000006D') msg += ' : STATUS_LOGON_FAILURE (Check Username/Password/Domain)';
      else if (statusHex === 'C0000022') msg += ' : STATUS_ACCESS_DENIED';
      else if (statusHex === 'C00000CC') msg += ' : STATUS_BAD_NETWORK_NAME (Check Share Name)';
      else if (statusHex === 'C00000BB') msg += ' : STATUS_NOT_SUPPORTED (NAS might only support SMB1/NTLMv1)';
    } else if (error instanceof Error) {
      msg = error.message;
      if (msg.includes('ECONNRESET')) msg += ' (Connection reset - NAS might only support SMB1/NTLMv1)';
    } else {
      msg = String(error);
    }
    this.app.error(msg);
    throw new Error(msg);
  }

  async test(smbSettings) {
    this.app.log('testing SMB settings from frontend');
    return new Promise((resolve, reject) => {
      try {
        const resolvedDomain = (smbSettings.smbDomain !== undefined && smbSettings.smbDomain.toUpperCase() !== 'DOMAIN') ? smbSettings.smbDomain.trim() : '';
        const resolvedUsername = smbSettings.smbUsername ? smbSettings.smbUsername.trim() : '';

        const smbOptions = {
          share: smbSettings.smbShare.replace(/\//gi, '\\'),
          domain: resolvedDomain,
          username: resolvedUsername,
          password: smbSettings.smbPassword || '',
          port: smbSettings.smbPort || 445,
          autoCloseTimeout: 10000,
        };

        const smb2Client = new SMB2(smbOptions);

        let path = `${smbSettings.smbPath.replace(/\//gi, '\\')}\\`;
        if (smbSettings.smbPath === '') {
          path = '';
        }

        smb2Client.writeFile(`${path}insights2csv.txt`, 'Homey can write to this folder!', { flag: 'w' }, (error) => {
          if (error) {
            smb2Client.disconnect();
            try {
              this._handleError(error);
            } catch (e) {
              reject(e);
            }
          } else {
            this.app.log('Connection successfull!');
            smb2Client.disconnect();
            resolve(true);
          }
        });
      } catch (error) {
        try {
          this._handleError(error);
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  async getClient(smbSettings) {
    try {
      const resolvedDomain = (smbSettings.smbDomain !== undefined && smbSettings.smbDomain.toUpperCase() !== 'DOMAIN') ? smbSettings.smbDomain.trim() : 'WORKGROUP';
      const smbOptions = {
        share: smbSettings.smbShare.replace(/\//gi, '\\'),
        domain: resolvedDomain,
        username: smbSettings.smbUsername ? smbSettings.smbUsername.trim() : '',
        password: smbSettings.smbPassword || '',
        port: smbSettings.smbPort || 445,
        autoCloseTimeout: 10000,
      };
      this.client = new SMB2(smbOptions);
      return Promise.resolve(this.client);
    } catch (error) {
      return this._handleError(error);
    }
  }

  async save(fileName, subfolder, smbSettings, timestamp) {
    await this.getClient(smbSettings);

    const cleanedSubfolder = subfolder ? subfolder.replace(/\//gi, '\\') : '';
    const folder = cleanedSubfolder ? `${cleanedSubfolder}\\` : '';
    let path = smbSettings.smbPath ? `${smbSettings.smbPath.replace(/\//gi, '\\')}\\${folder}` : folder;

    if (smbSettings.smbUseSeperateFolders) {
      path = `${path}${timestamp}\\`;
    }

    const checkAndCreate = async (pathToCheck) => {
      const folderExists = await new Promise((resolve, reject) => {
        this.client.exists(pathToCheck, (error, exists) => {
          if (error) return reject(error);
          return resolve(exists);
        });
      });
      if (!folderExists) {
        await new Promise((res, rej) => {
          this.client.mkdir(pathToCheck, (err) => {
            if (err && err.code !== 'STATUS_OBJECT_NAME_COLLISION') return rej(err);
            this.app.log(`${pathToCheck} folder created!`);
            return res(true);
          });
        });
      }
    };

    if (path !== '') {
      const parts = path.split('\\').filter((p) => p.length > 0);
      let currentPath = '';
      for (const part of parts) {
        currentPath += `${part}\\`;
        await checkAndCreate(currentPath);
      }
    }

    return new Promise((resolve, reject) => {
      this.client.createWriteStream(`${path}${fileName}`, { flag: 'w' }, (error, smbWriteStream) => {
        if (error) {
          this.app.error(error);
          reject(error);
          return;
        }
        const fileStream = fs.createReadStream(`/userdata/${fileName}`);
        let isDone = false;

        smbWriteStream.on('finish', () => {
          this.app.log(`${fileName} has been saved to SMB2`);
          if (!isDone) {
            isDone = true;
            resolve(fileName);
          }
        });

        smbWriteStream.on('error', (err) => {
          if (err.code === 'STATUS_FILE_CLOSED') {
            return;
          }
          this.app.error('smbWriteStream error: ', err);
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

        fileStream.pipe(smbWriteStream);
      });
    });
  }

  async purge(daysOld, allTypes, smbSettings) {
    let selectList = [];
    await this.getClient(smbSettings);
    let path = `${smbSettings.smbPath.replace(/\//gi, '\\')}\\`;
    if (smbSettings.smbPath === '') {
      path = '';
    }

    return new Promise((resolve, reject) => {
      this.client.readdir(path, (err, files) => {
        if (err) {
          this.app.log('[DEBUG-SMB] readDirectory error. Skipping purge.', err.message);
          return resolve([]);
        }
        selectList = files || [];

        if (!allTypes) {
          selectList = selectList.filter((item) => item.toLowerCase().endsWith('.zip'));
        }

        selectList = selectList.filter((item) => {
          const match = item.match(/_(.*?)_/);
          if (!match) return false;
          let dateString = match[1];
          if (dateString.length !== 16) return false;
          const YYYY = dateString.substring(0, 4);
          const MM = dateString.substring(4, 6);
          const DD = dateString.substring(6, 8);
          const hh = dateString.substring(9, 11);
          const mm = dateString.substring(11, 13);
          const ss = dateString.substring(13, 15);
          dateString = `${YYYY}-${MM}-${DD}T${hh}:${mm}:${ss}Z`;
          const days = (Date.now() - new Date(dateString)) / 1000 / 60 / 60 / 24;
          return days > daysOld;
        });

        for (let idx = 0; idx < selectList.length; idx += 1) {
          const item = selectList[idx];
          this.app.log(`removing SMB file ${item}`);
          this.client.unlink(`${path}${item}`, (error) => {
            if (error) this.app.error(error);
          });
        }
        return resolve(selectList);
      });
    });
  }
}

module.exports = SmbHelper;
