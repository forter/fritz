import net from "node:net";
import process from "node:process";

import { nconf } from "./lib/config.js";
import { ForwardClient } from "./lib/forward-client.js";
import { getLogger } from "./lib/logger.js";
import { handleMessageLoss } from "./lib/message-loss.js";
import { Msg, Reader, serialize } from "./lib/proto.js";

const logger = getLogger("fritz");
const forward = nconf.get("forward");
const FORCE_TERMINATION_TIMEOUT = 5000;

const forwarder = new ForwardClient(
  forward.host,
  forward.port,
  forward.minFlushBufferSize,
  forward.maxBufferSize,
  forward.maxFlushInterval,
  forward.reconnectTimeout,
  forward.flushTimeout
);

handleMessageLoss(forwarder);

for (const key of ["conf", "listen", "forward", "log", "pagerduty"]) {
  logger.debug(`config.${key}: ${JSON.stringify(nconf.get(key))}`);
}

const maxMessageLength = nconf.get("listen:maxMessageLength");
const OK = serialize(Msg.create({ ok: true }));

const server = net.createServer((socket) => {
  const clientRepr = `${socket.remoteAddress}:${socket.remotePort}`;
  const reader = new Reader(maxMessageLength);
  logger.info(`Client connected on "${clientRepr}"`);
  socket
    .on("data", (data) => {
      logger.debug(`Client sent data of length ${data.length}`);
      try {
        const messages = reader.readMessagesFromBuffer(data);
        logger.debug(`Read ${messages.length} messages from client payload`);
        // eslint-disable-next-line
        for (const _ in messages) {
          // auto-respond with ok message
          socket.write(OK);
        }
        // pass messages to forwarder
        forwarder.enqueue(messages);
      } catch (error) {
        logger.error(`Exception in socket ${clientRepr}: ${error}`);
        socket.end();
      }
    })
    .on("end", () => {
      logger.info(`Client disconnected on ${clientRepr}`);
    })
    .on("error", (err) => {
      logger.error(`Client error on ${clientRepr}: ${err}`);
    });
});

const init = () => {
  const listenHost = nconf.get("listen:host");
  const listenPort = nconf.get("listen:port");

  forwarder.connect();

  server.listen(listenPort, listenHost, () => {
    logger.info(`Server listening on ${listenHost}:${listenPort}`);
  });
};

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    logger.info(`Got ${sig} signal, terminating..`);

    setTimeout(() => {
      logger.warn("Forcing termination since server did not terminate in time");
      process.exit(1);
    }, FORCE_TERMINATION_TIMEOUT);

    forwarder.close();

    logger.info("Closing server");
    server.close(() => {
      logger.info("Goodbye!");
      process.exit(0);
    });
  });
}

init();
