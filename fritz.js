'use strict';

const net = require('net'),
      winston = require('winston'),
      {ForwardClient} = require('./forward-client'),
      {Msg, Reader, getMessageWithLengthBuffer} = require('./proto');

const port = 6666,
      address = '127.0.0.1',
      OK = getMessageWithLengthBuffer(new Msg(true)),
      logger = new (winston.Logger)({
          level: 'debug',
          transports: [
              new (winston.transports.Console)({colorize: true})
          ]
      });

const forwarder = new ForwardClient(logger, 'localhost', 5555, 3, 4, 5000);

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
