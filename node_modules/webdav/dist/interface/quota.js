"use strict";

const joinURL = require("url-join");

var _require = require("../response.js");

const handleResponseCode = _require.handleResponseCode,
      processResponsePayload = _require.processResponsePayload;

var _require2 = require("../request.js");

const encodePath = _require2.encodePath,
      prepareRequestOptions = _require2.prepareRequestOptions,
      request = _require2.request;

var _require3 = require("./dav.js");

const getSingleValue = _require3.getSingleValue,
      getValueForKey = _require3.getValueForKey,
      parseXML = _require3.parseXML,
      translateDiskSpace = _require3.translateDiskSpace;


function getQuota(options) {
    const requestOptions = {
        url: joinURL(options.remoteURL, "/"),
        method: "PROPFIND",
        headers: {
            Accept: "text/plain",
            Depth: 0
        },
        responseType: "text"
    };
    let response = null;
    prepareRequestOptions(requestOptions, options);
    return request(requestOptions).then(handleResponseCode).then(res => {
        response = res;
        return res.data;
    }).then(parseXML).then(parseQuota).then(result => processResponsePayload(response, result, options.details));
}

function parseQuota(result) {
    let responseItem = null,
        multistatus,
        propstat,
        props,
        quotaUsed,
        quotaAvail;
    try {
        multistatus = getValueForKey("multistatus", result);
        responseItem = getSingleValue(getValueForKey("response", multistatus));
    } catch (e) {
        /* ignore */
    }
    if (responseItem) {
        propstat = getSingleValue(getValueForKey("propstat", responseItem));
        props = getSingleValue(getValueForKey("prop", propstat));
        quotaUsed = getSingleValue(getValueForKey("quota-used-bytes", props));
        quotaAvail = getSingleValue(getValueForKey("quota-available-bytes", props));
        return typeof quotaUsed !== "undefined" && typeof quotaAvail !== "undefined" ? {
            used: parseInt(quotaUsed, 10),
            available: translateDiskSpace(quotaAvail)
        } : null;
    }
    return null;
}

module.exports = {
    getQuota
};