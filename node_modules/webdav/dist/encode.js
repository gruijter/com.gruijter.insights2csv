"use strict";

var _require = require("base-64");

const decode = _require.decode,
      encode = _require.encode;


function fromBase64(str) {
    return decode(str);
}

function toBase64(str) {
    return encode(str);
}

module.exports = {
    fromBase64,
    toBase64
};