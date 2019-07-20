"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Get an object that will let you call any method by any name. These methods won't
 * do anything and will always return `undefined`.
 */
exports.createNullObject = () => new Proxy({}, {
    get() {
        return noop;
    }
});
function noop() { }
