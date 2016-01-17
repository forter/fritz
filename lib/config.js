'use strict';
const nconf = require('nconf');

nconf
    .argv()
    .env()
    .defaults({
        'conf': '/etc/fritz.json'
    })
    .file({file: nconf.get('conf')})
    .defaults({
        listen: {
            host: '127.0.0.1',
            port: 5555,
            // clients which send messages larger than this value will be dropped
            maxMessageLength: 1024 * 1024, // 1 MB
        },
        forward: {
            // required 'host'
            port: 5555,
            minFlushEvents: 1000,
            maxBufferEvents: 40000,
            maxFlushInterval: 1000,
            reconnectTimeout: 1000,
        },
        log: {
            level: 'warn', // one of { error,  warn,  info,  verbose,  debug,  silly }
            file: '/var/log/fritz.log',
            console: true
        }
    });

if (typeof nconf.get('forward:host') === 'undefined') {
    throw new Error('no forward host supplied');
}

module.exports = {nconf};
