/// <reference types="node" />
import { Writable } from "stream";
export declare class StringWriter extends Writable {
    protected buf: Buffer;
    constructor();
    getText(encoding: string): string;
}
