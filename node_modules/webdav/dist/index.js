"use strict";

var _require = require("./request.js");

const axios = _require.axios;

var _require2 = require("./factory.js");

const createClient = _require2.createClient;

var _require3 = require("./patcher.js");

const getPatcher = _require3.getPatcher;

/**
 * @module WebDAV
 */

module.exports = {
  /**
   * Axios request library
   * @type {Function}
   * @memberof module:WebDAV
   */
  axios,
  createClient,
  getPatcher
};