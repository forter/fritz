import process from "node:process";

import { getLogger } from "./logger.js";

const logger = getLogger("termination-signals");

const FORCE_TERMINATION_TIMEOUT = 5000;

/**
 * @param {Server} server
 * @param {ForwardClient} forwarder
 */
const handleTerminationSignals = (server, forwarder) => {
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
};

export { handleTerminationSignals };
