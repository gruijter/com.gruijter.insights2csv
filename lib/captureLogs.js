/* eslint-disable import/no-extraneous-dependencies */
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

class CaptureLogs {
  // Log object to keep logs in memory and in persistent storage

  constructor(opts) {
    this.homey = opts.homey;
    this.logName = opts.name || 'log';
    this.logLength = opts.length || 200;
    this.logFile = `/userdata/${this.logName}.json`;
    this.logArray = [];
    this.getLogs();
  }

  addLog(type, msg) {
    const timestamp = new Date().toISOString();
    const formattedMsg = typeof msg === 'string' ? msg : JSON.stringify(msg);
    const entry = `${timestamp} [${type}] ${formattedMsg}`;
    if (this.logArray.length >= this.logLength) {
      this.logArray.shift();
    }
    this.logArray.push(entry);
  }

  trim(maxLen = 50) {
    if (this.logArray.length > maxLen) {
      this.logArray = this.logArray.slice(-maxLen);
    }
  }

  getLogs() {
    try {
      const log = fs.readFileSync(this.logFile, 'utf8');
      this.logArray = JSON.parse(log);
      return this.logArray;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      // eslint-disable-next-line no-console
      console.error('error parsing logfile:', error.message);
      return [];
    }
  }

  saveLogs() {
    try {
      fs.writeFileSync(this.logFile, JSON.stringify(this.logArray));
      return true;
    } catch (error) {
      if (error.code === 'ENOSPC') {
        // eslint-disable-next-line no-console
        console.error('No space left on device while writing logfile');
        return false;
      }
      // eslint-disable-next-line no-console
      console.error('error writing logfile:', error.message);
      return false;
    }
  }

  deleteLogs() {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.unlinkSync(this.logFile);
      }
      this.logArray = [];
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('error deleting logfile:', error.message);
      return false;
    }
  }

  releaseStdOut() {
    // No-op for backwards compatibility
  }

  releaseStdErr() {
    // No-op for backwards compatibility
  }

}

module.exports = CaptureLogs;
