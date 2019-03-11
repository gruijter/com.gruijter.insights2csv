/**
 * This will convert between Win32 FILETIME structure and JavaScript Date object.
 * Written by danielgindi@gmail.com
 */

var Long = require('long');

var FileTime = {

    /**
     * Convert a Win32 FILETIME structure to a `Date` object
     * @param {int} low
     * @param {int} high
     * @returns {Number} A unix time. Can be converted to Date lie "new Date(time)"
     */
    toUnix: function (low, high) {
        
        if (typeof low === 'object' && high === undefined) {
            high = arguments[0].high;
            low = arguments[0].low;
        }
        
        var ulong = new Long(low, high, true).div(10000);
        var epochBase = ulong.sub(11644473600000);
        
        if (epochBase.greaterThan(ulong)) {
            epochBase = epochBase.toSigned();
        }

        return epochBase.toNumber();
    },

    /**
     * Convert a `Date` object to a Win32 FILETIME structure
     * @param {Date|Number} date object or unix time
     * @returns {{low: int, high: int}}
     */
    fromUnix: function (date) {

        var timestamp = +date;
        var long = Long
            .fromNumber(timestamp, timestamp >= 0)
            .add(11644473600000)
            .mul(10000);
        
        return { low: long.getLowBitsUnsigned(), high: long.getHighBitsUnsigned() };
    }

};

FileTime.fromDate = FileTime.fromUnix;

/**
 * Convert a Win32 FILETIME structure to a `Date` object
 * @param {int} low
 * @param {int} high
 * @returns {Date} A javascript Date object.
 */
FileTime.toDate = function (low, high) {
    return new Date(this.toUnix.apply(this, arguments));
};

// The first names that I chose. I don't like those.
FileTime.fromFileTime = FileTime.toUnix;
FileTime.toFileTime = FileTime.fromUnix;

module.exports = FileTime;
