'use strict';

const {Buffer} = require('buffer'),
      proto = require('protobufjs'),
      path = require('path'),
      builder = proto.loadProtoFile(path.join(__dirname,  'proto.proto')),
      Msg = builder.build('Msg'),
      MAX_MESSAGE_LEN = 1024 * 1024,
      INT_BYTES_LEN = 4;

function getMessageWithLengthBuffer(msg) {
    const lenBuf = new Buffer(INT_BYTES_LEN);
    const msgBuf = msg.toBuffer();
    lenBuf.writeInt32BE(msgBuf.length);
    return Buffer.concat([lenBuf, msgBuf]);
}

class Reader {
    constructor() {
        this.accumulatedData = null;
    }

    /* Read a single message from provided buffer
     * @return [message, unprocessed data in buffer]
     */
    _readMessageFromBuffer(data) {
        const msgLen = data.readInt32BE();
        if (msgLen > MAX_MESSAGE_LEN) {
            // Protect ourselves from malicious packets / bad clients
            throw new Error('Message length exceeded max message length');
        }
        if (data.length >= msgLen) {
            const msg = Msg.decode(data.slice(INT_BYTES_LEN, msgLen + INT_BYTES_LEN));
            if (data.length > msgLen + INT_BYTES_LEN)
                return [msg, data.slice(msgLen + INT_BYTES_LEN)];
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

module.exports = {Msg, Reader, getMessageWithLengthBuffer};
