import { FileInfo } from "./FileInfo";
/**
 * Returns true if a given line might be part of an MLSD listing.
 *
 * - Example 1: `size=15227;type=dir;perm=el;modify=20190419065730; test one`
 * - Example 2: ` file name` (leading space)
 *
 * Keep `=` out of the fact name: if both sides of the first `=` could contain it, a long line of `=`
 * without `;` would be retried at every split point, costing O(n²) and blocking the event loop.
 */
export declare function testLine(line: string): boolean;
/**
 * Parse single line as MLSD listing, see specification at https://tools.ietf.org/html/rfc3659#section-7.
 */
export declare function parseLine(line: string): FileInfo | undefined;
export declare function transformList(files: FileInfo[]): FileInfo[];
/**
 * Parse date as specified in https://tools.ietf.org/html/rfc3659#section-2.3.
 *
 * Message contains response code and modified time in the format: YYYYMMDDHHMMSS[.sss]
 * For example `19991005213102` or `19980615100045.014`.
 */
export declare function parseMLSxDate(fact: string): Date;
