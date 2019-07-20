"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const net_1 = require("net");
const parseControlResponse_1 = require("./parseControlResponse");
/**
 * Describes an FTP server error response including the FTP response code.
 */
class FTPError extends Error {
    constructor(res) {
        super(res.message);
        this.name = this.constructor.name;
        this.code = res.code;
    }
}
exports.FTPError = FTPError;
/**
 * FTPContext holds the control and data sockets of an FTP connection and provides a
 * simplified way to interact with an FTP server, handle responses, errors and timeouts.
 *
 * It doesn't implement or use any FTP commands. It's only a foundation to make writing an FTP
 * client as easy as possible. You won't usually instantiate this, but use `Client`.
 */
class FTPContext {
    /**
     * Instantiate an FTP context.
     *
     * @param timeout - Timeout in milliseconds to apply to control and data connections. Use 0 for no timeout.
     * @param encoding - Encoding to use for control connection. UTF-8 by default. Use "latin1" for older servers.
     */
    constructor(timeout = 0, encoding = "utf8") {
        this.timeout = timeout;
        /** Debug-level logging of all socket communication. */
        this.verbose = false;
        /** IP version to prefer (4: IPv4, 6: IPv6, undefined: automatic). */
        this.ipFamily = undefined;
        /** Options for TLS connections. */
        this.tlsOptions = {};
        /** A multiline response might be received as multiple chunks. */
        this.partialResponse = "";
        this._encoding = encoding;
        // Help Typescript understand that we do indeed set _socket in the constructor but use the setter method to do so.
        this._socket = this.socket = this._newSocket();
        this._dataSocket = undefined;
    }
    /**
     * Close the context.
     *
     * The context can’t be used anymore after calling this method.
     */
    close() {
        // Close with an error: If there is an active task it will receive it justifiably because the user
        // closed while a task was still running. If no task is running, no error will be thrown (see closeWithError)
        // but all newly submitted tasks after that will be rejected because "the client is closed". Plus, the user
        // gets a stack trace in case it's not clear where exactly the client was closed. We use _closingError to
        // determine whether a context is closed. This also allows us to have a single code-path for closing a context.
        const message = this.task ? "User closed client during task" : "User closed client";
        const err = new Error(message);
        this.closeWithError(err);
    }
    /**
     * Send an error to the current handler and close all connections.
     */
    closeWithError(err) {
        // If this context already has been closed, don't overwrite the reason.
        if (this.closingError) {
            return;
        }
        this.closingError = err;
        // Before giving the user's task a chance to react, make sure we won't be bothered with any inputs.
        this.closeSocket(this._socket);
        this.closeSocket(this._dataSocket);
        // Give the user's task a chance to react, maybe cleanup resources.
        this.passToHandler(err);
        // The task might not have been rejected by the user after receiving the error.
        this.stopTrackingTask();
    }
    get closed() {
        return this.closingError !== undefined;
    }
    get socket() {
        return this._socket;
    }
    /**
     * Set the socket for the control connection. This will only close the current control socket
     * if the new one is not an upgrade to the current one.
     */
    set socket(socket) {
        // No data socket should be open in any case where the control socket is set or upgraded.
        this.dataSocket = undefined;
        // This being a soft reset, remove any remaining partial response.
        this.partialResponse = "";
        if (this._socket) {
            // Only close the current connection if the new is not an upgrade.
            const isUpgrade = socket.localPort === this._socket.localPort;
            if (!isUpgrade) {
                this._socket.destroy();
            }
            this.removeSocketListeners(this._socket);
        }
        if (socket) {
            // Setting a completely new control socket is in essence something like a reset. That's
            // why we also close any open data connection above. We can go one step further and reset
            // a possible closing error. That means that a closed FTPContext can be "reopened" by
            // setting a new control socket.
            this.closingError = undefined;
            // Don't set a timeout yet. Timeout for control sockets is only active during a task, see handle() below.
            socket.setTimeout(0);
            socket.setEncoding(this._encoding);
            socket.setKeepAlive(true);
            socket.on("data", data => this.onControlSocketData(data));
            this.setupErrorHandlers(socket, "control socket");
        }
        this._socket = socket;
    }
    get dataSocket() {
        return this._dataSocket;
    }
    /**
     * Set the socket for the data connection. This will automatically close the former data socket.
     */
    set dataSocket(socket) {
        this.closeSocket(this._dataSocket);
        if (socket) {
            // Don't set a timeout yet. Timeout data socket should be activated when data transmission starts
            // and timeout on control socket is deactivated.
            socket.setTimeout(0);
            this.setupErrorHandlers(socket, "data socket");
        }
        this._dataSocket = socket;
    }
    get encoding() {
        return this._encoding;
    }
    /**
     * Set the encoding used for the control socket.
     */
    set encoding(encoding) {
        this._encoding = encoding;
        if (this.socket) {
            this.socket.setEncoding(encoding);
        }
    }
    /**
     * Send an FTP command without waiting for or handling the result.
     */
    send(command) {
        // Don't log passwords.
        const message = command.startsWith("PASS") ? "> PASS ###" : `> ${command}`;
        this.log(message);
        this._socket.write(command + "\r\n", this.encoding);
    }
    /**
     * Log message if set to be verbose.
     */
    log(message) {
        if (this.verbose) {
            // tslint:disable-next-line no-console
            console.log(message);
        }
    }
    /**
     * Return true if the control socket is using TLS. This does not mean that a session
     * has already been negotiated.
     */
    get hasTLS() {
        return "encrypted" in this._socket;
    }
    /**
     * Send an FTP command and handle any response until the new task is resolved. This returns a Promise that
     * will hold whatever the handler passed on when resolving/rejecting its task.
     */
    handle(command, responseHandler) {
        if (this.task) {
            // The user or client instance called `handle()` while a task is still running.
            const err = new Error("User launched a task while another one is still running. Forgot to use 'await' or '.then()'?");
            err.stack += `\nRunning task launched at: ${this.task.stack}`;
            this.closeWithError(err);
        }
        return new Promise((resolvePromise, rejectPromise) => {
            const stack = new Error().stack || "Unknown call stack";
            const resolver = {
                resolve: (...args) => {
                    this.stopTrackingTask();
                    resolvePromise(...args);
                },
                reject: err => {
                    this.stopTrackingTask();
                    rejectPromise(err);
                }
            };
            this.task = {
                stack,
                resolver,
                responseHandler
            };
            if (this.closingError) {
                // This client has been closed. Provide an error that describes this one as being caused
                // by `_closingError`, include stack traces for both.
                const err = new Error("Client is closed"); // Type 'Error' is not correctly defined, doesn't have 'code'.
                err.stack += `\nClosing reason: ${this.closingError.stack}`;
                err.code = this.closingError.code !== undefined ? this.closingError.code : "0";
                this.passToHandler(err);
                return;
            }
            // Only track control socket timeout during the lifecycle of a task. This avoids timeouts on idle sockets,
            // the default socket behaviour which is not expected by most users.
            this.socket.setTimeout(this.timeout);
            if (command) {
                this.send(command);
            }
        });
    }
    /**
     * Removes reference to current task and handler. This won't resolve or reject the task.
     */
    stopTrackingTask() {
        // Disable timeout on control socket if there is no task active.
        this.socket.setTimeout(0);
        this.task = undefined;
    }
    /**
     * Handle incoming data on the control socket. The chunk is going to be of type `string`
     * because we let `socket` handle encoding with `setEncoding`.
     */
    onControlSocketData(chunk) {
        const trimmedChunk = chunk.trim();
        this.log(`< ${trimmedChunk}`);
        // This chunk might complete an earlier partial response.
        const completeResponse = this.partialResponse + trimmedChunk;
        const parsed = parseControlResponse_1.parseControlResponse(completeResponse);
        // Remember any incomplete remainder.
        this.partialResponse = parsed.rest;
        // Each response group is passed along individually.
        for (const message of parsed.messages) {
            const code = parseInt(message.substr(0, 3), 10);
            const response = { code, message };
            const err = code >= 400 ? new FTPError(response) : undefined;
            this.passToHandler(err ? err : response);
        }
    }
    /**
     * Send the current handler a response. This is usually a control socket response
     * or a socket event, like an error or timeout.
     */
    passToHandler(response) {
        if (this.task) {
            this.task.responseHandler(response, this.task.resolver);
        }
        // Errors other than FTPError always close the client. If there isn't an active task to handle the error,
        // the next one submitted will receive it using `_closingError`.
        // There is only one edge-case: If there is an FTPError while no task is active, the error will be dropped.
        // But that means that the user sent an FTP command with no intention of handling the result. So why should the
        // error be handled? Maybe log it at least? Debug logging will already do that and the client stays useable after
        // FTPError. So maybe no need to do anything here.
    }
    /**
     * Setup all error handlers for a socket.
     */
    setupErrorHandlers(socket, identifier) {
        socket.once("error", error => {
            error.message += ` (${identifier})`;
            this.closeWithError(error);
        });
        socket.once("close", hadError => {
            if (hadError) {
                this.closeWithError(new Error(`Socket closed due to transmission error (${identifier})`));
            }
        });
        socket.once("timeout", () => this.closeWithError(new Error(`Timeout (${identifier})`)));
    }
    /**
     * Close a socket.
     */
    closeSocket(socket) {
        if (socket) {
            socket.destroy();
            this.removeSocketListeners(socket);
        }
    }
    /**
     * Remove all default listeners for socket.
     */
    removeSocketListeners(socket) {
        socket.removeAllListeners();
        // Before Node.js 10.3.0, using `socket.removeAllListeners()` without any name did not work: https://github.com/nodejs/node/issues/20923.
        socket.removeAllListeners("timeout");
        socket.removeAllListeners("data");
        socket.removeAllListeners("error");
        socket.removeAllListeners("close");
        socket.removeAllListeners("connect");
    }
    /**
     * Provide a new socket instance.
     *
     * Internal use only, replaced for unit tests.
     */
    _newSocket() {
        return new net_1.Socket();
    }
}
exports.FTPContext = FTPContext;
