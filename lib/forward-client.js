import net from "node:net";
import { BehaviorSubject } from "rxjs";

import { getLogger } from "./logger.js";
import { DEFAULT_MAX_MESSAGE_LEN, deserialize, frame, Reader } from "./proto.js";

const logger = getLogger("forward-client");

const emptyBuffer = Buffer.alloc(0);

class ForwardClient {
  /**
   * @type {String}
   */
  host;

  /**
   * @type {Integer}
   */
  port;

  /**
   * @type {Socket}
   */
  client = null;

  /**
   * @type {Integer}
   */
  reconnectTimeout;

  /**
   * @type {Integer}
   */
  minFlushBufferSize;

  /**
   * @type {Integer}
   */
  maxBufferSize;

  /**
   * @type {Integer}
   */
  maxFlushInterval;

  /**
   * No response from remote forward host timeout
   * @type {Integer}
   */
  flushTimeout;
  // Currently in-memory buffer data
  buffer;
  // Points to the first free byte within buffer.
  bufferWriteIndex = 0;
  bufferMessageCount = 0;

  /**
   * messages are only acks, so no need to configure
   * @type {Reader}
   */
  reader;

  /**
   * rxjs stream reporting message losses
   * @type {BehaviorSubject}
   */
  messageLossCounter$;

  /**
   * @type {FlushHandler}
   */
  flushHandler = null;
  flushTimer;
  lastMessageTime = Date.now();
  // indicates whether instructed to close remote forwarder
  isClosed = false;

  constructor(host, port, minFlushBufferSize, maxBufferSize, maxFlushInterval, reconnectTimeout, flushTimeout) {
    this.host = host;
    this.port = port;
    this.reconnectTimeout = reconnectTimeout;
    this.minFlushBufferSize = minFlushBufferSize;
    this.maxBufferSize = maxBufferSize;
    this.maxFlushInterval = maxFlushInterval;
    this.flushTimeout = flushTimeout;
    this.buffer = Buffer.allocUnsafe(maxBufferSize);
    this.reader = new Reader(DEFAULT_MAX_MESSAGE_LEN);
    this.messageLossCounter$ = new BehaviorSubject(0);
    this.flushTimer = setInterval(this.flush.bind(this), this.maxFlushInterval);

    logger.info(`Starting forward client from ${host}:${port}`);
  }

  /** connect must be called after subscribing to state in order to receive first failure */
  connect() {
    this.client = net
      .createConnection({ host: this.host, port: this.port }, () => {
        logger.info(`Forward client connected to "${this.host}:${this.port}"`);
      })
      .on("end", () => {
        logger.warn(`Forward client disconnected, attempting reconnect in ${this.reconnectTimeout}ms`);
        this.handleRemoteError(new Error("Riemann client disconnected"));
        this.triggerReconnect();
      })
      .on("data", (data) => {
        this.updateLastMessageTime();
        if (this.flushHandler === null) {
          logger.warn("Flush handler reset before new data arrived");
        }
        const messages = this.reader.readMessagesFromBuffer(data);
        for (const raw of messages) {
          const ack = deserialize(raw);
          if (ack.ok) {
            if (this.flushHandler !== null) {
              this.flushHandler.resolve();
            }
          } else {
            const error = `Remote forward client returned error in response: ${ack.error}`;
            logger.error(error);
            this.handleRemoteError(new Error(error));
          }
        }
      })
      .on("error", (error) => {
        logger.error(`Forward client error: ${error} attempting reconnect in ${this.reconnectTimeout}ms`);
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
    setTimeout(() => {
      this.client = null;
      if (this.isClosed) {
        return;
      }
      this.connect();
    }, this.reconnectTimeout);
  }

  /**
   * @param {Buffer[]} messages
   */
  enqueue(messages) {
    if (this.isClosed) {
      return;
    }
    if (messages.length === 0) {
      return;
    }

    let consumedMessages = 0;
    for (const message of messages) {
      if (this.bufferWriteIndex + message.length > this.maxBufferSize) {
        const dropped = messages.length - consumedMessages;
        this.messageLossCounter$.next(dropped);
        logger.error(`Forward client buffer full, dropping ${dropped} message(s)`);
        break;
      }
      consumedMessages += 1;
      message.copy(this.buffer, this.bufferWriteIndex);
      this.bufferWriteIndex += message.length;
    }
    this.bufferMessageCount += consumedMessages;
    logger.debug(`Currently buffering ${this.bufferMessageCount} messages`);

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
        logger.debug(`Writing data to forward client length=${data.length} numAcksExpected=${numAcksExpected}`);
      } else {
        // if no events are set, acts as a keep-alive packet
        logger.debug("No events to buffer, sending a keep-alive to remote host");
        data = frame(emptyBuffer);
        numAcksExpected = 1;
      }

      this.flushHandler = new FlushHandler(numAcksExpected);
      new Promise(this.flushHandler.executor.bind(this.flushHandler))
        .then(() => {
          this.flushHandler = null;
        })
        // eslint-disable-next-line
        .catch((error) => {
          this.messageLossCounter$.next(this.flushHandler.numAcksExpected);
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
      const error = `Remote forward client did not respond for ${timeSinceLastMessage}ms`;
      logger.error(error);
      this.handleRemoteError(new Error(error));
    }
  }

  updateLastMessageTime() {
    this.lastMessageTime = Date.now();
  }

  close() {
    logger.info("Closing remote forward client");
    this.isClosed = true;
    try {
      this.client.end();
    } catch (e) {
      logger.error("Could not close Remote forward client", e);
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

export { ForwardClient };
