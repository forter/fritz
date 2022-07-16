const nconf = require("nconf");
const os = require("os");

nconf
  .argv()
  .env()
  .add("configfile-default", {
    type: "literal",
    conf: "/etc/fritz.json",
  })
  .file({ file: nconf.get("conf") })
  .defaults({
    listen: {
      host: "127.0.0.1",
      port: 5555,
      // clients which send messages larger than this value will be dropped
      maxMessageLength: 1024 * 1024, // 1 MB
    },
    forward: {
      host: nconf.get("RIEMANN_HOST"),
      port: 5555,
      minFlushBufferSize: 10 * 1024,
      maxBufferSize: 10 * 1024 * 1024,
      maxFlushInterval: 1000,
      flushTimeout: 60000,
      reconnectTimeout: 1000,
    },
    log: {
      level: "debug", // one of { error,  warn,  info,  verbose,  debug,  silly }
      file: "/var/log/fritz.log", // omit file to disable logging to file
      console: "color", // one of {color, no-color}, omit to disable console logging
    },
    hostname: os.hostname(),
  })
  .required(["forward:host"]);

module.exports = { nconf };
