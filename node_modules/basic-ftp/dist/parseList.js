"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dosParser = __importStar(require("./parseListDOS"));
const unixParser = __importStar(require("./parseListUnix"));
const availableParsers = [
    dosParser,
    unixParser
];
/**
 * Parse raw directory listing.
 */
function parseList(rawList) {
    const lines = rawList.split(/\r?\n/) // Split by newline
        .map(line => (/^(\d\d\d)-/.test(line)) ? line.substr(3) : line) // Strip possible multiline prefix
        .filter(line => line.trim() !== ""); // Remove blank lines
    if (lines.length === 0) {
        return [];
    }
    // Pick the last line of the list as a test candidate to find a compatible parser.
    const test = lines[lines.length - 1];
    const parser = firstCompatibleParser(test, availableParsers);
    if (!parser) {
        throw new Error("This library only supports Unix- or DOS-style directory listing. Your FTP server seems to be using another format. You can see the transmitted listing when setting `client.ftp.verbose = true`. You can then provide a custom parser to `client.parseList`, see the documentation for details.");
    }
    return lines.map(parser.parseLine)
        .filter((info) => info !== undefined);
}
exports.parseList = parseList;
/**
 * Returns the first parser that doesn't return undefined for the given line.
 */
function firstCompatibleParser(line, parsers) {
    return parsers.find(parser => parser.testLine(line) === true);
}
