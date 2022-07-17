import winston from "winston";

import { nconf } from "./config.js";

const transports = [];

if (nconf.get("log:file") && nconf.get("log:file") !== "/dev/null") {
  transports.push(new winston.transports.File({ filename: nconf.get("log:file") }));
}

if (nconf.get("log:console")) {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.cli(),
        winston.format.printf((options) => {
          return `[${options.serviceName}] ${options.timestamp} ${options.level}: ${options.message}`;
        })
      ),
    })
  );
}

/**
 * Pointer to the singleton logger instance we have. To create logger childs use getLogger
 * @type {winston.Logger}
 */
const logger = new winston.createLogger({
  level: nconf.get("log:level"),
  transports: transports,
});

/**
 * @param {string} service
 * @returns {winston.Logger}
 */
const getLogger = (service = "main") => {
  return logger.child({ serviceName: service });
};

export { getLogger, logger };
