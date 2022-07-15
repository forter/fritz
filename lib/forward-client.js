"use strict";

const net = require("net");
const buffer = require("buffer");
const Rx = require("rxjs/Rx");
const { Msg, Reader, deserialize, frame, DEFAULT_MAX_MESSAGE_LEN } = require("./proto");

const emptyBuffer = new Buffer(0);

class ForwardClient {
  constructor(
    logger,
    host,
    port = 5555,
    minFlushBufferSize = 1000,
    maxBufferSize = 2000,
    maxFlushInterval = 1000,
    reconnectTimeout = 1000,
    flushTimeout = 60000
  ) {
    this.logger = logger;
    this.host = host;
    this.port = port;
    this.client = null;
    this.reconnectTimeout = reconnectTimeout;
    this.minFlushBufferSize = minFlushBufferSize;
    this.maxBufferSize = maxBufferSize;
    this.maxFlushInterval = maxFlushInterval;
    this.flushTimeout = flushTimeout;
    this.buffer = Buffer.allocUnsafe ? Buffer.allocUnsafe(maxBufferSize) : new Buffer(maxBufferSize);
    this.bufferWriteIndex = 0; // Points to the first free byte within buffer.
    this.bufferMessageCount = 0;
    this.reader = new Reader(DEFAULT_MAX_MESSAGE_LEN, logger); // messages are only acks, so no need to configure
    this.messageLossCounter = new Rx.BehaviorSubject(0);
    this.flushHandler = null;
    this.flushTimer = setInterval(this.flush.bind(this), this.maxFlushInterval);
    this.lastMessageTime = 0;
    this.updateLastMessageTime();
  }

  /** connect must be called after subscribing to state in order to receive first failure */
  connect() {
    const client = net
      .connect(
        {
          host: this.host,
          port: this.port,
        },
        () => {
          this.logger.info("Riemann client connected to:", this.host + ":" + this.port);
          this.client = client;
        }
      )
      .on("end", () => {
        this.logger.warn("Riemann client disconnected, attempting reconnect in ", this.reconnectTimeout, "ms");
        this.handleRemoteError(new Error("Riemann client disconnected"));
        this.triggerReconnect();
      })
      .on("data", (data) => {
        this.updateLastMessageTime();
        if (this.flushHandler === null) {
          this.logger.warn("Flush handler reset before new data arrived");
        }
        const messages = this.reader.readMessagesFromBuffer(data);
        for (const raw of messages) {
          const ack = deserialize(raw);
          this.logger.debug("Riemann server responded with", ack);
          if (ack.ok) {
            if (this.flushHandler !== null) {
              this.flushHandler.resolve();
            }
          } else {
            const error = "Riemann server returned error in response: " + ack.error;
            this.logger.error(error);
            this.handleRemoteError(new Error(error));
          }
        }
      })
      .on("error", (error) => {
        this.logger.error("Riemann client error:", error, " attempting reconnect in ", this.reconnectTimeout, "ms");
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
    setTimeout(() => {
      this.connect();
    }, this.reconnectTimeout);
  }

  enqueue(messages) {
    if (messages.length === 0) {
      return;
    }

    let consumedMessages = 0;
    for (const message of messages) {
      if (this.bufferWriteIndex + message.length > this.maxBufferSize) {
        const dropped = messages.length - consumedMessages;
        this.messageLossCounter.next(dropped);
        this.logger.error("Riemann client buffer full, dropping " + dropped + " message(s)");
        break;
      }
      consumedMessages += 1;
      message.copy(this.buffer, this.bufferWriteIndex);
      this.bufferWriteIndex += message.length;
    }
    this.bufferMessageCount += consumedMessages;

    if (this.bufferWriteIndex >= this.minFlushBufferSize) {
      this.flush();
    }
  }

  flush() {
    // Make sure we are connected and have no requests in-flight
    if (this.client !== null && this.flushHandler === null) {
      let data;
      let numAcksExpected;
      if (this.bufferWriteIndex > 0) {
        // slice returns a pointer into the buffer,
        // data and buffer point to the same memory block
        data = this.buffer.slice(0, this.bufferWriteIndex);
        numAcksExpected = this.bufferMessageCount;
      } else {
        // if no events are set, acts as a keep-alive packet
        data = frame(emptyBuffer);
        numAcksExpected = 1;
      }

      this.flushHandler = new FlushHandler(numAcksExpected);
      new Promise(this.flushHandler.executor.bind(this.flushHandler))
        .then(() => {
          this.flushHandler = null;
        })
        .catch((error) => {
          this.messageLossCounter.next(this.flushHandler.numAcksExpected);
          this.flushHandler = null;
        });
      try {
        this.client.write(data);
      } catch (error) {
        this.flushHandler = null;
      }

      // reset last message time
      this.updateLastMessageTime();

      this.bufferMessageCount = 0;
      this.bufferWriteIndex = 0;
    }

    this.checkFlushTimeout();
  }

  checkFlushTimeout() {
    const timeSinceLastMessage = Date.now() - this.lastMessageTime;
    if (this.flushHandler !== null && timeSinceLastMessage > this.flushTimeout) {
      const error = "Riemann server did not respond for " + timeSinceLastMessage + "ms";
      this.logger.error(error);
      this.handleRemoteError(new Error(error));
    }
  }

  updateLastMessageTime() {
    this.lastMessageTime = Date.now();
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

module.exports = { ForwardClient };
