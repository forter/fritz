"use strict";

const { Buffer } = require("buffer");
const proto = require("protobufjs");
const path = require("path");
const builder = proto.loadProtoFile(path.join(__dirname, "..", "proto.proto"));
const root = builder.build();
const Msg = root.Msg;
const Event = root.Event;
const DEFAULT_MAX_MESSAGE_LEN = 1024 * 1024;
const INT_BYTES_LEN = 4;

function serialize(msg) {
  return frame(msg.toBuffer());
}

function frame(msgBuf) {
  const lenBuf = new Buffer(INT_BYTES_LEN);
  lenBuf.writeInt32BE(msgBuf.length);
  return Buffer.concat([lenBuf, msgBuf]);
}

function unframe(framed) {
  return framed.slice(INT_BYTES_LEN);
}

function deserialize(framed) {
  return Msg.decode(unframe(framed));
}

class Reader {
  constructor(maxMessageLength = DEFAULT_MAX_MESSAGE_LEN, logger) {
    this.accumulatedData = null;
    this.maxMessageLength = maxMessageLength;
    this.logger = logger;
  }

  /* Read a single message from provided buffer
   * @return [message, unprocessed data in buffer]
   */
  _readMessageFromBuffer(data) {
    if (data.length < INT_BYTES_LEN) {
      return [null, data];
    }
    const msgLen = data.readInt32BE();
    const frameLen = msgLen + INT_BYTES_LEN;
    if (data.length >= frameLen) {
      if (msgLen > this.maxMessageLength) {
        // Protect ourselves from malicious packets / bad clients
        this.logger.error(
          "Message length exceeded max message length:" + msgLen + "/" + this.maxMessageLength + " - dropping!"
        );
        return [null, data.slice(frameLen)];
      }
      if (data.length > frameLen) return [data.slice(0, frameLen), data.slice(frameLen)];
      else return [data, null];
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
      if (msg !== null) messages.push(msg);
      if (rest === null || msg === null) return [messages, rest];
      data = rest;
    }
  }

  /* Read all messages from provided buffer
   * @return list of messages
   */
  readMessagesFromBuffer(data) {
    if (this.accumulatedData !== null) data = Buffer.concat([this.accumulatedData, data]);
    const [messages, rest] = this._readMessagesFromBuffer(data);
    this.accumulatedData = rest;
    return messages;
  }
}

module.exports = { Msg, Event, Reader, serialize, deserialize, frame, unframe };
