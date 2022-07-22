import net from "node:net";

import { nconf } from "./lib/config.js";
import { ForwardClient } from "./lib/forward-client.js";
import { getLogger } from "./lib/logger.js";
import { handleMessageLoss } from "./lib/message-loss.js";
import { Msg, Reader, serialize } from "./lib/proto.js";
import { handleTerminationSignals } from "./lib/termination-signals.js";

const logger = getLogger("fritz");
const forward = nconf.get("forward");

for (const key of ["conf", "listen", "forward", "log", "pagerduty", "hostname"]) {
  logger.debug(`config.${key}: ${JSON.stringify(nconf.get(key))}`);
}

const forwarder = new ForwardClient(forward);

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
        // auto-respond with ok message
        messages.forEach(() => socket.write(OK));
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
  handleMessageLoss(forwarder);
  handleTerminationSignals(server, forwarder);

  forwarder.connect();

  const listenHost = nconf.get("listen:host");
  const listenPort = nconf.get("listen:port");
  server.listen(listenPort, listenHost, () => {
    logger.info(`Server listening on ${listenHost}:${listenPort}`);
  });
};

init();
