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
      vm_data = nconf.get('pagerduty:vm_data'),
      hostname = vm_data['hostname'],
      OK = serialize(new Msg(true)),
      logger = new (winston.Logger)({
          level: nconf.get('log:level'),
          transports: transports
      });

const forwarder = new ForwardClient(
    logger,
    forward.host,
    forward.port,
    forward.minFlushBufferSize,
    forward.maxBufferSize,
    forward.maxFlushInterval,
    forward.reconnectTimeout,
    forward.flushTimeout);

if (nconf.get('pagerduty:serviceKey')) {
    const pager = new PagerDuty(nconf.get('pagerduty:serviceKey')),
          timeResolutionSecs = nconf.get('pagerduty:timeResolutionSecs'),
          lostMessagesThreshold = nconf.get('pagerduty:lostMessagesThreshold');
    forwarder.messageLossCounter
        .bufferTime(timeResolutionSecs * 1000)
        .map(events => {
            const totalMessagesLost = events.reduce((a, b) => a + b, 0)

            const state = totalMessagesLost >= lostMessagesThreshold ? 'failed' : 'passed';

            const func = state === 'failed' ? 'error' : 'info';
            logger[func]('Forward client state changed to',  state);

            const service = 'fritz message loss';
            const incidentKey = hostname + ' ' + service;
            const eventType = state === 'failed' ? 'trigger' : 'resolve';
            pager.call({
                incidentKey,
                eventType,
                details: {
                    time: new Date().toTimeString(),
                    vm_data,
                    service,
                    state,
                    totalMessagesLost
                },
                description: hostname + ' fritz dropped over ' + lostMessagesThreshold + ' in the last ' +
                    timeResolutionSecs + ' secs (' + totalMessagesLost + ' lost messages). ' +
                    'Try setting a larger buffer than the current ' + forward.maxBufferSize + ' bytes ' +
                    ' or removing unneeded data like lengthy stack traces from your events.'
            });
        });
}

for (const key of ['conf', 'listen', 'forward', 'log', 'pagerduty']) {
    logger.debug('config.' + key + ':', nconf.get(key));
}

forwarder.connect();

const server = net.createServer((socket) => {
    const clientRepr = socket.remoteAddress + ':' + socket.remotePort;
    const reader = new Reader(maxMessageLength, logger);
    logger.info('client connected on', clientRepr);
    socket.on('data', (data) => {
        logger.silly('<<', data);
        try {
            const messages = reader.readMessagesFromBuffer(data);
            for (const _ in messages) {
                socket.write(OK);
            }
            forwarder.enqueue(messages);
        } catch (error) {
            logger.error('Exception in socket', clientRepr, ':', error);
            socket.end();
        }
    })
    .on('end', () => {
        logger.info('client disconnected on', clientRepr);
    })
    .on('error', (err) => {
        logger.error('client error on', clientRepr, ':', err);
    });
});

server.listen(listenPort, listenHost, () => {
    logger.info('server listening on', listenHost + ':' + listenPort);
});


for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, process.exit);
}
