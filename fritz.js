'use strict';

const net = require('net'),
      path = require('path'),
      proto = require('protobufjs'),
      winston = require('winston'),
      client = require('riemann'),
      {Reader} = require('./transport'),
      {ForwardClient} = require('./forward-client'),
      {getMessageWithLengthBuffer} = require('./proto');

const port = 6666,
      address = '127.0.0.1',
      builder = proto.loadProtoFile(path.join(__dirname, 'proto.proto')),
      Msg = builder.build('Msg'),
      OK = getMessageWithLengthBuffer(new Msg(true)),
      logger = new (winston.Logger)({
          level: 'debug',
          transports: [
              new (winston.transports.Console)({colorize: true})
          ]
      });

const forwarder = new ForwardClient('localhost', 5555, 3, 4, 5000, logger);

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

server.listen(port, address, () => {
    logger.info('server listening on', address + ':' + port);
});
