import nconf from "nconf";
import os from "os";

nconf
  .argv()
  .env()
  .add("configfile-default", {
    // Setting default location of config file (nconf.get("conf"))
    type: "literal",
    conf: "/etc/forter/events-forwarder/events-forwarder.json",
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
      level: "warn", // one of { error,  warn,  info,  verbose,  debug,  silly }
      file: "/var/log/forter/events-forwarder/events-forwarder.log", // omit file to disable logging to file
      console: "color", // one of {color, no-color}, omit to disable console logging
    },
    pagerduty: {
      serviceKey: null,
      vm_data: null,
      alertCheckIntervalSecs: 60,
      lostMessagesThreshold: 100,
    },
    hostname: os.hostname(),
  })
  .required(["forward:host"]);

export { nconf };
