"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
class StringWriter extends stream_1.Writable {
    constructor() {
        super();
        this.buf = Buffer.alloc(0);
        this._write = (chunk, _, done) => {
            if (chunk) {
                if (chunk instanceof Buffer) {
                    this.buf = Buffer.concat([this.buf, chunk]);
                }
                else {
                    done(new Error("StringWriter expects chunks of type 'Buffer'."));
                    return;
                }
            }
            done();
        };
    }
    getText(encoding) {
        return this.buf.toString(encoding);
    }
}
exports.StringWriter = StringWriter;
