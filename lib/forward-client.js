'use strict';

const net = require('net'),
      buffer = require('buffer'),
      Rx = require('rxjs/Rx'),
      {Msg, Reader, deserialize, frame} = require('./proto');

class ForwardClient {
    constructor(logger, host, port = 5555, minFlushBufferSize = 1000, maxBufferSize = 2000, maxFlushInterval = 1000, reconnectTimeout = 1000) {
        this.logger = logger;
        this.host = host;
        this.port = port;
        this.client = null;
        this.reconnectTimeout = reconnectTimeout;
        this.minFlushBufferSize = minFlushBufferSize;
        this.maxBufferSize = maxBufferSize;
        this.maxFlushInterval = maxFlushInterval;
        this.queuedMessages = [];   // received message queue
        this.queuedMessagesSize = 0; // total size of queuedMessages in bytes
        this.reader = new Reader();
        this.messageLossCounter = new Rx.BehaviorSubject(0);
        this.flushHandler = null;
        this.flushTimer = setInterval(this.flush.bind(this), this.maxFlushInterval);
    }

    /** connect must be called after subscribing to state in order to receive first failure */
    connect() {
        const client = net.connect({
          host: this.host,
          port: this.port
        }, () => {
            this.logger.info('Riemann client connected to:', this.host + ':' + this.port);
            this.client = client;
        }).on('end', () => {
            this.logger.warn('Riemann client disconnected, attempting reconnect in ', this.reconnectTimeout, 'ms');
            this.handleRemoteError(new Error('Riemann client disconnected'));
            this.triggerReconnect();
        }).on('data', (data) => {
            const messages = this.reader.readMessagesFromBuffer(data);
            for (const raw of messages) {
                const ack = deserialize(raw);
                this.logger.debug('Riemann server responsed with', ack);
                if (ack.ok) {
                    this.flushHandler.resolve();
                }
                else {
                    const error = 'Riemann server returned error in response: ' + ack.error;
                    this.logger.error(error);
                    this.handleRemoteError(new Error(error));
                }
            }
        }).on('error', (error) => {
            this.logger.error('Riemann client error:', error, ' attempting reconnect in ', this.reconnectTimeout, 'ms');
            this.handleRemoteError(error);
            this.triggerReconnect();
        });
    }

    handleRemoteError(error) {
        if (this.flushHandler !== null) {
            this.flushHandler.reject(error);
        }
    }

    triggerReconnect() {
        this.client = null;
        setTimeout(() => { this.connect(); }, this.reconnectTimeout);
    }

    enqueue(messages) {
        if (messages.length === 0) {
            return;
        }

        // Count total size of queued messages.
        const totalLength = messages.reduce((acc, curr) => acc + curr.length, this.queuedMessagesSize);
        if (totalLength > this.maxBufferSize) {
            this.messageLossCounter.next(this.messageLossCounter.getValue() + messages.length);
            this.logger.error('Riemann client buffer full, dropping ' + messages.length + ' message(s)');
            return;
        }

        // Append received messages to queuedMessages, this won't create a new third array.
        this.queuedMessages.push.apply(this.queuedMessages, messages);
        this.queuedMessagesSize = totalLength;

        if (totalLength >= this.minFlushBufferSize) {
            this.flush();
        }
    }

    flush() {
        // Make sure we are connected and have no requests in-flight
        if (this.client !== null && this.flushHandler == null) {
            let data, numAcksExpected;
            if (this.queuedMessagesSize > 0) {
                data = Buffer.concat(this.queuedMessages, this.queuedMessagesSize);
                numAcksExpected = this.queuedMessages.length;

                // Clear queue.
                this.queuedMessages = [];
                this.queuedMessagesSize = 0;
            }
            else {
                // if no events are set, acts as a keepalive packet
                data = frame(new Buffer(0));
                numAcksExpected = 1;
            }

            //this.logger.debug('Flushing', data.length, 'bytes');
            //this.logger.silly('>>', data);
            this.flushHandler = new FlushHandler(numAcksExpected);
            new Promise(this.flushHandler.executor.bind(this.flushHandler)).then(() => {
                this.flushHandler = null;
            }).catch((error) => {
                this.messageLossCounter.next(this.messageLossCounter.getValue() + this.flushHandler.numAcksExpected);
                this.flushHandler = null;
            });
            try {
                this.client.write(data);
            }
            catch (error) {
                this.flushHandler = null;
            }
        }
    }
}

class FlushHandler {
    constructor(numAcksExpected) {
        this.numAcksExpected = numAcksExpected;
    }

    executor(resolve, reject) {
        this._resolve = resolve;
        this.reject = reject;
    }

    resolve() {
        if (--this.numAcksExpected === 0) {
            this._resolve();
        }
    }
}

module.exports = {ForwardClient};
