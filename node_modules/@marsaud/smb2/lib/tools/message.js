var MsErref = require('./ms_erref');
var bigint = require('./bigint');

var defaults = {
  successCode: 'STATUS_SUCCESS',

  parse: function(connection, cb, error) {
    var self = this;

    return function(response) {
      var h = response.getHeaders();
      var err = MsErref.getStatus(bigint.fromBuffer(h.Status).toNumber());
      if (err.code === self.successCode) {
        self.onSuccess && self.onSuccess(connection, response);
        cb && cb(null, self.parseResponse && self.parseResponse(response));
      } else {
        error.message = MsErref.getErrorMessage(err);
        error.code = err.code;
        cb && cb(error);
      }
    };
  },

  parseResponse: function(response) {
    return response.getResponse();
  },
};

module.exports = function(obj) {
  for (var key in defaults) {
    obj[key] = obj[key] || defaults[key];
  }

  return obj;
};
