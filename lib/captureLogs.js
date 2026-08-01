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

const StdOutFixture = require('fixture-stdout');
const fs = require('fs');

class CaptureLogs {
  // Log object to keep logs in memory and in persistent storage
  // captures and reroutes Homey's this.log (stdout) and this.err (stderr)

  constructor(opts) {
    this.homey = opts.homey;
    this.logName = opts.name || 'log';
    this.logLength = opts.length || 50;
    this.logFile = `/userdata/${this.logName}.json`;
    this.logArray = [];
    this.getLogs();
    this.captureStdOut();
    this.captureStdErr();
  }

  log(msg, ...args) {
    try {
      if (this.homey && this.homey.app) {
        this.homey.log(msg, ...args);
      } else {
        console.log(msg, ...args);
      }
    } catch (e) {
      console.log(msg, ...args);
    }
  }

  error(msg, ...args) {
    try {
      if (this.homey && this.homey.app) {
        this.homey.error(msg, ...args);
      } else {
        console.error(msg, ...args);
      }
    } catch (e) {
      console.error(msg, ...args);
    }
  }

  getLogs() {
    try {
      const log = fs.readFileSync(this.logFile, 'utf8');
      this.logArray = JSON.parse(log);
      this.log('logfile retrieved');
      return this.logArray;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      this.error('error parsing logfile: ', error.message);
      return [];
    }
  }

  saveLogs() {
    try {
      fs.writeFileSync(this.logFile, JSON.stringify(this.logArray));
      this.log('logfile saved');
      return true;
    } catch (error) {
      if (error.code === 'ENOSPC') {
        console.error('No space left on device while writing logfile');
        return false;
      }
      this.error('error writing logfile: ', error.message);
      return false;
    }
  }

  deleteLogs() {
    try {
      fs.unlinkSync(this.logFile);
      this.logArray = [];
      this.log('logfile deleted');
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      this.error('error deleting logfile: ', error.message);
      return false;
    }
  }

  captureStdOut() {
    // Capture all writes to stdout (e.g. this.log)
    this.captureStdout = new StdOutFixture({ stream: process.stdout });
    this.captureStdout.capture((string) => {
      if (this.logArray.length >= this.logLength) {
        this.logArray.shift();
      }
      this.logArray.push(string);
      return true;
    });
    this.log('capturing stdout');
  }

  captureStdErr() {
    // Capture all writes to stderr (e.g. this.error)
    this.captureStderr = new StdOutFixture({ stream: process.stderr });
    this.captureStderr.capture((string) => {
      if (this.logArray.length >= this.logLength) {
        this.logArray.shift();
      }
      this.logArray.push(string);
      return true;
    });
    this.log('capturing stderr');
  }

  releaseStdOut() {
    if (this.captureStdout) {
      try { this.captureStdout.release(); } catch (e) { /* ignore */ }
    }
  }

  releaseStdErr() {
    if (this.captureStderr) {
      try { this.captureStderr.release(); } catch (e) { /* ignore */ }
    }
  }

}

module.exports = CaptureLogs;
