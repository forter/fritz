'use strict';

const {Queue} = require('./queue'),
      net = require('net'),
      buffer = require('buffer'),
      {Msg, Reader, serialize, deserialize} = require('./proto'),
      FAILED = 'failed',
      OK = 'OK';

class ForwardClient {
    constructor(logger, host, port = 5555, minFlushEvents = 1000, maxBufferEvents = 2000, maxFlushInterval = 1000, reconnectTimeout = 1000, onStateChanged = () => {}) {
        this.logger = logger;
        this.host = host;
        this.port = port;
        this.client = null;
        this.reconnectTimeout = reconnectTimeout;
        this.stateChangedHandler = onStateChanged;
        this.eventQueue = new Queue(maxBufferEvents);
        this.minFlushEvents = minFlushEvents;
        this.maxFlushInterval = maxFlushInterval;
        this.reader = new Reader();
        this.state = OK;
        this.flushHandler = null;
        this.flushTimer = setInterval(this.flush.bind(this), this.maxFlushInterval);
        this.connect();
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

    enqueue(events) {
        if (this.eventQueue.isFull()) {
            const error = 'Riemann client buffer full, dropping ' + events.length + ' event(s)';
            this.setState(FAILED, error);
            this.logger.error(error);
        }
        for (const ev of events)
            this.eventQueue.pushright(ev);
        if (this.eventQueue.length >= this.minFlushEvents)
            this.flush();
    }

    setState(state, reason) {
        const func = state === FAILED ? 'error' : 'info';
        this.logger[func]('Forward client state changed to',  state);
        if (this.state !== state) {
            try {
                this.stateChangedHandler(state, reason);
            } catch (error) {
                this.logger.error('Failed to trigger state changed handler', error);
            }
            this.state = state;
        }
    }

    flush() {
        // Make sure we are connected and have no requests in-flight
        if (this.client !== null && this.flushHandler == null) {
            const message = new Msg();
            // if no events are set, acts as a keepalive packet
            message.events = this.eventQueue.toArray();
            this.logger.debug('Flushing', message.events.length, 'events');
            const data = serialize(message)
            this.logger.silly('>>', data);
            this.flushHandler = new FlushHandler();
            new Promise(this.flushHandler.executor.bind(this.flushHandler)).then(() => {
                this.flushHandler = null;
                this.setState(OK, 'All OK');
            }).catch((error) => {
                this.flushHandler = null;
                this.setState(FAILED, error.toString());
            });
            this.eventQueue = new Queue(this.eventQueue.maxLength);
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
    executor(resolve, reject) {
        this.resolve = resolve;
        this.reject = reject;
    }
}

module.exports = {ForwardClient, FAILED, OK};
