"use strict";

const joinURL = require("url-join");
const responseHandlers = require("../response.js");

var _require = require("../request.js");

const encodePath = _require.encodePath,
      prepareRequestOptions = _require.prepareRequestOptions,
      request = _require.request;


function deleteFile(filename, options) {
    const requestOptions = {
        url: joinURL(options.remoteURL, encodePath(filename)),
        method: "DELETE"
    };
    prepareRequestOptions(requestOptions, options);
    return request(requestOptions).then(responseHandlers.handleResponseCode);
}

module.exports = {
    deleteFile
};