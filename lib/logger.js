const winston = require("winston");
const { nconf } = require("./config");

const transports = [];
if (nconf.get("log:file")) {
  transports.push(new winston.transports.File({ filename: nconf.get("log:file") }));
}
if (nconf.get("log:console")) {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp(), winston.format.colorize(), winston.format.cli()),
    })
  );
}

exports.logger = new winston.createLogger({
  level: nconf.get("log:level"),
  transports: transports,
});