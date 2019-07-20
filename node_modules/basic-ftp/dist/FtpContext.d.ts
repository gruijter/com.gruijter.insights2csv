/// <reference types="node" />
import { Socket } from "net";
import { ConnectionOptions, TLSSocket } from "tls";
interface Task {
    /** Handles a response for a task. */
    readonly responseHandler: ResponseHandler;
    /** Resolves or rejects a task. */
    readonly resolver: TaskResolver;
    /** Call stack when task was run. */
    readonly stack: string;
}
export interface TaskResolver {
    resolve(...args: any[]): void;
    reject(err: Error): void;
}
export interface FTPResponse {
    /** FTP response code */
    readonly code: number;
    /** Whole response including response code */
    readonly message: string;
}
export declare type ResponseHandler = (response: Error | FTPResponse, task: TaskResolver) => void;
/**
 * Describes an FTP server error response including the FTP response code.
 */
export declare class FTPError extends Error {
    /** FTP response code */
    readonly code: number;
    constructor(res: FTPResponse);
}
/**
 * FTPContext holds the control and data sockets of an FTP connection and provides a
 * simplified way to interact with an FTP server, handle responses, errors and timeouts.
 *
 * It doesn't implement or use any FTP commands. It's only a foundation to make writing an FTP
 * client as easy as possible. You won't usually instantiate this, but use `Client`.
 */
export declare class FTPContext {
    readonly timeout: number;
    /** Debug-level logging of all socket communication. */
    verbose: boolean;
    /** IP version to prefer (4: IPv4, 6: IPv6, undefined: automatic). */
    ipFamily: number | undefined;
    /** Options for TLS connections. */
    tlsOptions: ConnectionOptions;
    /** Current task to be resolved or rejected. */
    protected task: Task | undefined;
    /** A multiline response might be received as multiple chunks. */
    protected partialResponse: string;
    /** Closing the context is always described an error. */
    protected closingError: NodeJS.ErrnoException | undefined;
    /** Encoding applied to commands, responses and directory listing data. */
    protected _encoding: string;
    /** Control connection */
    protected _socket: Socket | TLSSocket;
    /** Data connection */
    protected _dataSocket: Socket | TLSSocket | undefined;
    /**
     * Instantiate an FTP context.
     *
     * @param timeout - Timeout in milliseconds to apply to control and data connections. Use 0 for no timeout.
     * @param encoding - Encoding to use for control connection. UTF-8 by default. Use "latin1" for older servers.
     */
    constructor(timeout?: number, encoding?: string);
    /**
     * Close the context.
     *
     * The context can’t be used anymore after calling this method.
     */
    close(): void;
    /**
     * Send an error to the current handler and close all connections.
     */
    closeWithError(err: Error): void;
    readonly closed: boolean;
    /**
    * Set the socket for the control connection. This will only close the current control socket
    * if the new one is not an upgrade to the current one.
    */
    socket: Socket | TLSSocket;
    /**
    * Set the socket for the data connection. This will automatically close the former data socket.
    */
    dataSocket: Socket | TLSSocket | undefined;
    /**
    * Set the encoding used for the control socket.
    */
    encoding: string;
    /**
     * Send an FTP command without waiting for or handling the result.
     */
    send(command: string): void;
    /**
     * Log message if set to be verbose.
     */
    log(message: string): void;
    /**
     * Return true if the control socket is using TLS. This does not mean that a session
     * has already been negotiated.
     */
    readonly hasTLS: boolean;
    /**
     * Send an FTP command and handle any response until the new task is resolved. This returns a Promise that
     * will hold whatever the handler passed on when resolving/rejecting its task.
     */
    handle(command: string | undefined, responseHandler: ResponseHandler): Promise<any>;
    /**
     * Removes reference to current task and handler. This won't resolve or reject the task.
     */
    protected stopTrackingTask(): void;
    /**
     * Handle incoming data on the control socket. The chunk is going to be of type `string`
     * because we let `socket` handle encoding with `setEncoding`.
     */
    protected onControlSocketData(chunk: string): void;
    /**
     * Send the current handler a response. This is usually a control socket response
     * or a socket event, like an error or timeout.
     */
    protected passToHandler(response: Error | FTPResponse): void;
    /**
     * Setup all error handlers for a socket.
     */
    protected setupErrorHandlers(socket: Socket, identifier: string): void;
    /**
     * Close a socket.
     */
    protected closeSocket(socket: Socket | undefined): void;
    /**
     * Remove all default listeners for socket.
     */
    protected removeSocketListeners(socket: Socket): void;
    /**
     * Provide a new socket instance.
     *
     * Internal use only, replaced for unit tests.
     */
    _newSocket(): Socket;
}
export {};
