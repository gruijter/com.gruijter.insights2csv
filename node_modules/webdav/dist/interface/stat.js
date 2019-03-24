"use strict";

const joinURL = require("url-join");

var _require = require("../merge.js");

const merge = _require.merge;

var _require2 = require("../response.js");

const handleResponseCode = _require2.handleResponseCode,
      processResponsePayload = _require2.processResponsePayload;

var _require3 = require("./dav.js");

const getSingleValue = _require3.getSingleValue,
      getValueForKey = _require3.getValueForKey,
      parseXML = _require3.parseXML,
      propsToStat = _require3.propsToStat;

const urlTools = require("../url.js");

var _require4 = require("../request.js");

const encodePath = _require4.encodePath,
      prepareRequestOptions = _require4.prepareRequestOptions,
      request = _require4.request;


function getStat(filename, options) {
    const requestOptions = {
        url: joinURL(options.remoteURL, encodePath(filename)),
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
    }).then(parseXML).then(xml => parseStat(xml, filename, options.details)).then(result => processResponsePayload(response, result, options.details));
}

function parseStat(result, filename, isDetailed = false) {
    let responseItem = null,
        multistatus;
    try {
        multistatus = getValueForKey("multistatus", result);
        responseItem = getSingleValue(getValueForKey("response", multistatus));
    } catch (e) {
        /* ignore */
    }
    if (!responseItem) {
        throw new Error("Failed getting item stat: bad response");
    }
    const propStat = getSingleValue(getValueForKey("propstat", responseItem));
    const props = getSingleValue(getValueForKey("prop", propStat));
    const filePath = urlTools.normalisePath(filename);
    return propsToStat(props, filePath, isDetailed);
}

module.exports = {
    getStat
};