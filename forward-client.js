'use strict';

const {Queue} = require('./queue'),
      net = require('net'),
      path = require('path'),
      proto = require('protobufjs'),
      buffer = require('buffer'),
      {Reader} = require('./transport'),
      builder = proto.loadProtoFile(path.join(__dirname, 'proto.proto')),
      Msg = builder.build('Msg'),
      {getMessageWithLengthBuffer} = require('./proto');

class ForwardClient {
    constructor(host, port, lowWaterMark, highWaterMark, maxFlushInterval, logger) {
        this.logger = logger;
        this.host = host;
        this.port = port;
        this.client = null;
        this.reconnectTimeout = 1000;
        this.eventQueue = new Queue(highWaterMark);
        this.lowWaterMark = lowWaterMark;
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
            this.logger.info('Riemann client connected');
            this.client = client;
        }).on('end', () => {
            this.logger.warn('Riemann client disconnected, attempting reconnect in ', this.reconnectTimeout, 'ms');
            this.client = null;
            setTimeout(() => { this.connect(); }, this.reconnectTimeout);
        }).on('data', (data) => {
            const messages = this.reader.readMessagesFromBuffer(data);
            for (const ack of messages) {
                this.logger.debug('Riemann server responsed with', ack);
                if (!ack.ok)
                    this.logger.error('Riemann server returned error in response', ack);
            }
        }).on('error', (error) => {
            this.logger.error('Riemann client error:', error, ' attempting reconnect in ', this.reconnectTimeout, 'ms');
            setTimeout(() => { this.connect(); }, this.reconnectTimeout);
        });
    }

    enqueue(events) {
        for (const ev of events)
            this.eventQueue.pushright(ev);
        if (this.eventQueue.length >= this.lowWaterMark)
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
        if (this.client !== null) {
            const message = new Msg();
            // if no events are set, acts as a keepalive packet
            message.events = this.eventQueue.toArray();
            this.logger.info('flushing', message.events.length, 'events');
            const data = getMessageWithLengthBuffer(message)
            this.logger.debug('>>', data);
            this.client.write(data);
            this.eventQueue = new Queue(this.eventQueue.maxLength);
        }
        this.resetFlushTimer();
    }
}

module.exports = {ForwardClient};
