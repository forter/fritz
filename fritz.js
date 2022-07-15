const net = require("net");
const PagerDuty = require("./lib/pagerduty");
const { map, bufferTime } = require("rxjs/operators");
const { nconf } = require("./lib/config");
const { ForwardClient } = require("./lib/forward-client");
const { Msg, Reader, serialize } = require("./lib/proto");
const process = require("node:process");
const { logger } = require("./lib/logger");

const forward = nconf.get("forward");
const maxMessageLength = nconf.get("listen:maxMessageLength");
const OK = serialize(Msg.create({ ok: true }));

logger.debug(`Starting forward client from ${forward.host}:${forward.port}`);

const forwarder = new ForwardClient(
  forward.host,
  forward.port,
  forward.minFlushBufferSize,
  forward.maxBufferSize,
  forward.maxFlushInterval,
  forward.reconnectTimeout,
  forward.flushTimeout
);

const handlePagerdutyAlerts = () => {
  const pager = new PagerDuty(nconf.get("pagerduty:serviceKey"));
  const alertCheckIntervalSecs = nconf.get("pagerduty:alertCheckIntervalSecs");
  const lostMessagesThreshold = nconf.get("pagerduty:lostMessagesThreshold");
  const vm_data = nconf.get("pagerduty:vm_data");
  const hostname = vm_data["hostname"];

  const messageLossTotalsStream = forwarder.messageLossCounter.pipe(
    bufferTime(alertCheckIntervalSecs * 1000),
    map((events) => events.reduce((a, b) => a + b, 0))
  );

  let lossState = "passed";
  messageLossTotalsStream.subscribe((totalMessagesLost) => {
    const newState = totalMessagesLost >= lostMessagesThreshold ? "failed" : "passed";

    if (newState !== lossState) {
      lossState = newState;
      const func = lossState === "failed" ? "error" : "info";
      logger[func](
        "Forward client state is " +
          lossState +
          " (dropped " +
          totalMessagesLost +
          " in the last " +
          alertCheckIntervalSecs +
          "secs)"
      );

      const service = "fritz message loss";
      const incidentKey = `${hostname} ${service}`;
      const eventType = lossState === "failed" ? "trigger" : "resolve";
      pager.call({
        incidentKey,
        eventType,
        details: {
          time: new Date().toTimeString(),
          vm_data,
          service,
          lossState,
          totalMessagesLost,
        },
        description:
          hostname +
          " fritz dropped over " +
          lostMessagesThreshold +
          " in the last " +
          alertCheckIntervalSecs +
          " secs (" +
          totalMessagesLost +
          " lost messages). " +
          "See Fritz doc's Alerts section - https://forter.atlassian.net/wiki/spaces/ENG/pages/7897784/Fritz+-+Riemann+Proxy+System+Overview",
      });
    }
  });
};

if (nconf.get("pagerduty:serviceKey")) {
  handlePagerdutyAlerts();
}

for (const key of ["conf", "listen", "forward", "log", "pagerduty"]) {
  logger.debug(`config.${key}: ${JSON.stringify(nconf.get(key))}`);
}

forwarder.connect();

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
  server.listen(listenPort, listenHost, () => {
    logger.info("Server listening on", `${listenHost}:${listenPort}`);
  });
};

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => process.exit);
}

init();
