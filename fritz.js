'use strict';

const net = require('net'),
      winston = require('winston'),
      PagerDuty = require('pagerduty'),
      {nconf} = require('./lib/config'),
      {ForwardClient, FAILED} = require('./lib/forward-client'),
      {Msg, Reader, serialize, deserialize} = require('./lib/proto');

const transports = [];
if (nconf.get('log:file')) {
    transports.push(
        new (winston.transports.File)({filename: nconf.get('log:file')})
    );
}
if (nconf.get('log:console')) {
    const colorize = nconf.get('log:console') === 'color';
    transports.push(
        new (winston.transports.Console)({colorize: colorize})
    );
}

const listenPort = nconf.get('listen:port'),
      listenHost = nconf.get('listen:host'),
      forward = nconf.get('forward'),
      maxMessageLength = nconf.get('listen:maxMessageLength'),
      hostname = nconf.get('hostname'),
      pager = new PagerDuty({
          serviceKey: nconf.get('pagerduty:serviceKey')
      }),
      OK = serialize(new Msg(true)),
      logger = new (winston.Logger)({
          level: nconf.get('log:level'),
          transports: transports
      });

const forwarder = new ForwardClient(
    logger,
    forward.host,
    forward.port,
    forward.minFlushEvents,
    forward.maxBufferEvents,
    forward.maxFlushInterval,
    forward.reconnectTimeout,
    (state, reason) => {
        const service = 'fritz';
        const incidentKey = hostname + ' ' + service;
        const func = state === FAILED ? 'create' : 'resolve';
        pager[func]({
            incidentKey: incidentKey,
            details: {
                time: new Date().getTime(),
                host: hostname,
                service: service,
                state: state,
                reason: reason,
            },
            description: incidentKey + " is " + state + ' (' + reason + ')'
        });
    });


for (const key of ['conf', 'listen', 'forward', 'log', 'pagerduty']) {
    logger.debug('config.' + key + ':', nconf.get(key));
}

const server = net.createServer((socket) => {
    const clientRepr = socket.remoteAddress + ':' + socket.remotePort;
    const reader = new Reader(maxMessageLength);
    logger.info('client connected on', clientRepr);
    socket.on('data', (data) => {
        logger.silly('<<', data);
        try {
            const messages = reader.readMessagesFromBuffer(data);
            for (const raw of messages) {
                const msg = deserialize(raw);
                logger.debug('Read message from', clientRepr, ':', msg);
                socket.write(OK);
                forwarder.enqueue(msg.events);
            }
        } catch (error) {
            logger.error('Exception in socket', clientRepr, ':', error);
            socket.end();
        }
    })
    .on('end', () => {
        logger.info('client diconnected on', clientRepr);
    })
    .on('error', (err) => {
        logger.error('client error on', clientRepr, ':', err);
    });
});

server.listen(listenPort, listenHost, () => {
    logger.info('server listening on', listenHost + ':' + listenPort);
});
