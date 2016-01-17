'use strict';

const net = require('net'),
      winston = require('winston'),
      {nconf} = require('./config'),
      {ForwardClient} = require('./forward-client'),
      {Msg, Reader, getMessageWithLengthBuffer} = require('./proto');


const listenPort = nconf.get('listen:port'),
      listenHost = nconf.get('listen:host'),
      forward = nconf.get('forward'),
      OK = getMessageWithLengthBuffer(new Msg(true)),
      logger = new (winston.Logger)({
          level: nconf.get('logging:level'),
          transports: [
              new (winston.transports.Console)({colorize: true})
              //new (winston.transports.File)({ filename: 'somefile.log' })
          ]
      });

const forwarder = new ForwardClient(
    logger,
    forward.host,
    forward.port,
    forward.minFlushEvents,
    forward.maxBufferEvents,
    forward.maxFlushInterval,
    forward.reconnectTimeout);

const server = net.createServer((socket) => {
    const clientRepr = socket.remoteAddress + ':' + socket.remotePort;
    const reader = new Reader();
    logger.info('client connected on', clientRepr);
    socket.on('data', (data) => {
        logger.debug('<<', data);
        try {
            const messages = reader.readMessagesFromBuffer(data);
            for (const msg of messages) {
                logger.debug('Read message from', clientRepr, ':', msg);
                socket.write(OK);
                forwarder.enqueue(msg.events);
            }
        } catch (error) {
            logger.error('Exception in socket', clientRepr, ':', error);
            socket.end();
        }
    });
});

server.listen(listenPort, listenHost, () => {
    logger.info('server listening on', listenHost + ':' + listenPort);
});
