const net = require("node:net");
const { nconf } = require("./lib/config");
const { ForwardClient } = require("./lib/forward-client");
const { Msg, Reader, serialize } = require("./lib/proto");
const process = require("node:process");
const { getLogger } = require("./lib/logger");
const { handlePagerdutyAlerts } = require("./lib/pagerduty-alerts");

const logger = getLogger("fritz");
const forward = nconf.get("forward");

const forwarder = new ForwardClient(
  forward.host,
  forward.port,
  forward.minFlushBufferSize,
  forward.maxBufferSize,
  forward.maxFlushInterval,
  forward.reconnectTimeout,
  forward.flushTimeout
);

if (nconf.get("pagerduty:serviceKey")) {
  handlePagerdutyAlerts(forwarder);
}

for (const key of ["conf", "listen", "forward", "log", "pagerduty"]) {
  logger.debug(`config.${key}: ${JSON.stringify(nconf.get(key))}`);
}

const maxMessageLength = nconf.get("listen:maxMessageLength");
const OK = serialize(Msg.create({ ok: true }));

const server = net.createServer((socket) => {
  const clientRepr = `${socket.remoteAddress}:${socket.remotePort}`;
  const reader = new Reader(maxMessageLength);
  logger.info(`Client connected on ${clientRepr}`);
  socket
    .on("data", (data) => {
      logger.silly("<<", data);
      try {
        const messages = reader.readMessagesFromBuffer(data);
        // eslint-disable-next-line
        for (const _ in messages) {
          socket.write(OK);
        }
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
    logger.warn(`Got ${sig} signal, terminating..`);
    logger.info("Closing server");
    server.close(() => {
      forwarder.close();
      logger.info("Goodbye!");
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn("Forcing termination since server did not terminate in time");
      process.exit(1);
    }, 2000);
  });
}

init();
