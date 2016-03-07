'use strict';

const {Buffer} = require('buffer'),
      proto = require('protobufjs'),
      path = require('path'),
      builder = proto.loadProtoFile(path.join(__dirname, '..', 'proto.proto')),
      root = builder.build(),
      Msg = root.Msg,
      Event = root.Event,
      DEFAULT_MAX_MESSAGE_LEN = 1024 * 1024,
      INT_BYTES_LEN = 4;

function serialize(msg) {
    const lenBuf = new Buffer(INT_BYTES_LEN);
    const msgBuf = msg.toBuffer();
    lenBuf.writeInt32BE(msgBuf.length);
    return Buffer.concat([lenBuf, msgBuf]);
}

class Reader {
    constructor(maxMessageLength = DEFAULT_MAX_MESSAGE_LEN) {
        this.accumulatedData = null;
        this.maxMessageLength = maxMessageLength
    }

    /* Read a single message from provided buffer
     * @return [message, unprocessed data in buffer]
     */
    _readMessageFromBuffer(data) {
        const msgLen = data.readInt32BE();
        const frameLen = msgLen + INT_BYTES_LEN;
        if (msgLen > this.maxMessageLength) {
            // Protect ourselves from malicious packets / bad clients
            throw new Error('Message length exceeded max message length:' + msgLen + '/' + this.maxMessageLength);
        }
        if (data.length >= frameLen) {
            const msg = Msg.decode(data.slice(INT_BYTES_LEN, frameLen));
            if (data.length > frameLen)
                return [msg, data.slice(frameLen)];
            else
                return [msg, null];
        }
        return [null, data];
    }

    /* Read all messages from provided buffer
     * @return [list of messages, unprocessed data in buffer]
     */
    _readMessagesFromBuffer(data) {
        const messages = [];

        while (true) {
            const [msg, rest] = this._readMessageFromBuffer(data);
            if (msg !== null)
                messages.push(msg);
            if (rest === null || msg === null)
                return [messages, rest];
            data = rest;
        }
    }

    /* Read all messages from provided buffer
     * @return list of messages
     */
    readMessagesFromBuffer(data) {
        if (this.accumulatedData !== null)
            data = Buffer.concat([this.accumulatedData, data]);
        const [messages, rest] = this._readMessagesFromBuffer(data);
        this.accumulatedData = rest;
        return messages;
    }
}

module.exports = {Msg, Event, Reader, serialize};
