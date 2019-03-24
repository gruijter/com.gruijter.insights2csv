"use strict";

const joinURL = require("url-join");

var _require = require("../response.js");

const handleResponseCode = _require.handleResponseCode,
      processResponsePayload = _require.processResponsePayload;

var _require2 = require("../request.js");

const encodePath = _require2.encodePath,
      prepareRequestOptions = _require2.prepareRequestOptions,
      request = _require2.request;

var _require3 = require("../encode.js");

const fromBase64 = _require3.fromBase64;


function getFileContentsBuffer(filePath, options) {
    const requestOptions = {
        url: joinURL(options.remoteURL, encodePath(filePath)),
        method: "GET",
        responseType: "arraybuffer"
    };
    prepareRequestOptions(requestOptions, options);
    return request(requestOptions).then(handleResponseCode).then(res => processResponsePayload(res, res.data, options.details));
}

function getFileContentsString(filePath, options) {
    const requestOptions = {
        url: joinURL(options.remoteURL, encodePath(filePath)),
        method: "GET",
        responseType: "text"
    };
    prepareRequestOptions(requestOptions, options);
    return request(requestOptions).then(handleResponseCode).then(res => processResponsePayload(res, res.data, options.details));
}

function getFileLink(filePath, options) {
    let url = joinURL(options.remoteURL, encodePath(filePath));
    const protocol = /^https:/i.test(url) ? "https" : "http";
    if (options.headers && options.headers.Authorization) {
        if (/^Basic /i.test(options.headers.Authorization) === false) {
            throw new Error("Failed retrieving download link: Invalid authorisation method");
        }
        const authPart = options.headers.Authorization.replace(/^Basic /i, "").trim();
        const authContents = fromBase64(authPart);
        url = url.replace(/^https?:\/\//, `${protocol}://${authContents}@`);
    }
    return url;
}

module.exports = {
    getFileContentsBuffer,
    getFileContentsString,
    getFileLink
};