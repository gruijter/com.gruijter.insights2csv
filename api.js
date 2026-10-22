'use strict';

module.exports = {
  async getLogs({ homey }) {
    return homey.app.getLogs();
  },
  async deleteLogs({ homey }) {
    return homey.app.deleteLogs();
  },
  async getResolutions({ homey }) {
    return homey.app.getResolutions();
  },
  async getAppList({ homey }) {
    return homey.app.getAppList();
  },
  async stopExport({ homey }) {
    return homey.app.stopExport();
  },
  async exportAll({ homey, body }) {
    return homey.app.exportAll(body.resolution);
  },
  async exportApp({ homey, body }) {
    return homey.app.exportApp(body.appId, body.resolution);
  },
  async testSmb({ homey, body }) {
    return homey.app.testSmb(body);
  },
  async testFTP({ homey, body }) {
    return homey.app.testFTP(body);
  },
  async testWebdav({ homey, body }) {
    return homey.app.testWebdav(body);
  },
};
