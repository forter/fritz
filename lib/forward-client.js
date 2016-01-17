'use strict';

const {Queue} = require('./queue'),
      net = require('net'),
      buffer = require('buffer'),
      {Msg, Reader, getMessageWithLengthBuffer} = require('./proto');

class ForwardClient {
    constructor(logger, host, port = 5555, minFlushEvents = 1000, maxBufferEvents = 2000, maxFlushInterval = 1000, reconnectTimeout = 1000) {
        this.logger = logger;
        this.host = host;
        this.port = port;
        this.client = null;
        this.reconnectTimeout = reconnectTimeout;
        this.eventQueue = new Queue(maxBufferEvents);
        this.minFlushEvents = minFlushEvents;
        this.maxFlushInterval = maxFlushInterval;
        this.flushTimer = null;
        this.resetFlushTimer();
        this.reader = new Reader();
        this.connect();
        this.flushHandler = null;
    }

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
            for (const ack of messages) {
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

    enqueue(events) {
        if (this.eventQueue.isFull()) {
            // TODO: report event loss
            this.logger.error('Riemann client buffer full, dropping', events.length, 'event(s)');
        }
        for (const ev of events)
            this.eventQueue.pushright(ev);
        if (this.eventQueue.length >= this.minFlushEvents)
            this.flush();
    }

    resetFlushTimer() {
        if (this.flushTimer !== null);
        clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => {
            this.flush();
        }, this.maxFlushInterval);
    }

    flush() {
        try {
            // Make sure we are connected and have no requests in-flight
            if (this.client !== null && this.flushHandler == null) {
                const message = new Msg();
                // if no events are set, acts as a keepalive packet
                message.events = this.eventQueue.toArray();
                this.logger.debug('Flushing', message.events.length, 'events');
                const data = getMessageWithLengthBuffer(message)
                this.logger.silly('>>', data);
                this.flushHandler = new FlushHandler();
                new Promise(this.flushHandler.executor.bind(this.flushHandler)).then(() => {
                    this.flushHandler = null;
                }).catch((error) => {
                    this.flushHandler = null;
                    // TODO: report event loss
                });
                this.client.write(data);
                this.eventQueue = new Queue(this.eventQueue.maxLength);
            }
        }
        finally {
            this.resetFlushTimer();
        }
    }
}

class FlushHandler {
    executor(resolve, reject) {
        this.resolve = resolve;
        this.reject = reject;
    }
}

module.exports = {ForwardClient};
