'use strict';

const net = require('net'),
      winston = require('winston'),
      PagerDuty = require('./lib/pagerduty'),
      {nconf} = require('./lib/config'),
      {ForwardClient} = require('./lib/forward-client'),
      {Msg, Reader, serialize, deserialize} = require('./lib/proto');

// for the pairwise operator
require('rxjs/add/operator/pairwise');

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
      pager = new PagerDuty(nconf.get('pagerduty:serviceKey')),
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
    forward.reconnectTimeout)

const stateChangeStream = forwarder.lostEventsCounter
    .bufferTime(2000)
    .map(events => events.length === 0 ? 'passed' : 'failed')
    .pairwise()
    .filter(([a, b]) => a !== b)
    .map(([first,  second]) => second);

stateChangeStream.subscribe(state => {
    const func = state === 'failed' ? 'error' : 'info';
    logger[func]('Forward client state changed to',  state);

    const service = 'fritz event loss';
    const incidentKey = hostname + ' ' + service;
    const eventType = state === 'failed' ? 'trigger' : 'resolve';
    const lostEvents = forwarder.lostEventsCounter.getValue();
    pager.call({
        incidentKey,
        eventType,
        details: {
            time: new Date().getTime(),
            host: hostname,
            service,
            state,
            lostEvents
        },
        description: incidentKey + " is " + state + ' (' + lostEvents + ')'
    });
});

for (const key of ['conf', 'listen', 'forward', 'log', 'pagerduty']) {
    logger.debug('config.' + key + ':', nconf.get(key));
}

forwarder.connect();

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
