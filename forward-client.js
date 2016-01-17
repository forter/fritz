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
            this.triggerReconnect();
        }).on('data', (data) => {
            const messages = this.reader.readMessagesFromBuffer(data);
            for (const ack of messages) {
                this.logger.debug('Riemann server responsed with', ack);
                if (!ack.ok)
                    this.logger.error('Riemann server returned error in response', ack);
            }
        }).on('error', (error) => {
            this.logger.error('Riemann client error:', error, ' attempting reconnect in ', this.reconnectTimeout, 'ms');
            this.triggerReconnect();
        });
    }

    triggerReconnect() {
        this.client = null;
        setTimeout(() => { this.connect(); }, this.reconnectTimeout);
    }

    enqueue(events) {
        // TODO: report event loss
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
        // TODO: check number of inflight requests
        try {
            if (this.client !== null) {
                const message = new Msg();
                // if no events are set, acts as a keepalive packet
                message.events = this.eventQueue.toArray();
                this.logger.debug('flushing', message.events.length, 'events');
                const data = getMessageWithLengthBuffer(message)
                this.logger.silly('>>', data);
                this.client.write(data);
                this.eventQueue = new Queue(this.eventQueue.maxLength);
            }
        }
        finally {
            this.resetFlushTimer();
        }
    }
}

module.exports = {ForwardClient};
