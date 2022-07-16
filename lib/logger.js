import winston from "winston";

import { nconf } from "./config.js";

const transports = [];

if (nconf.get("log:file")) {
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

const logger = new winston.createLogger({
  level: nconf.get("log:level"),
  transports: transports,
});

const getLogger = (service = "main") => {
  return logger.child({ serviceName: service });
};

export { getLogger, logger };
