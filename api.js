'use strict';

module.exports = {
  // retrieve logs
  async getLogs({ homey }) {
    return homey.app.getLogs();
  },
  // delete logs
  async deleteLogs({ homey }) {
    return homey.app.deleteLogs();
  },
  // get resolution list
  async getResolutions({ homey }) {
    return homey.app.getResolutions();
  },
  // get app list
  async getAppList({ homey }) {
    return homey.app.getAppList();
  },
  // stop export
  async stopExport({ homey }) {
    return homey.app.stopExport();
  },
  // make full backup from frontend
  async exportAll({ homey, body }) {
    return homey.app.exportAll(body.resolution);
  },
  // make app backup from frontend
  async exportApp({ homey, body }) {
    return homey.app.exportApp(body.appId, body.resolution);
  },
  // test SMB settings from frontend
  async testSmb({ homey, body }) {
    return homey.app.testSmb(body);
  },
  // test FTP settings from frontend
  async testFTP({ homey, body }) {
    return homey.app.testFTP(body);
  },
  // test WebDAV settings from frontend
  async testWebdav({ homey, body }) {
    return homey.app.testWebdav(body);
  },
};
