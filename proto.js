const {Buffer} = require('buffer'),
      INT_BYTES_LEN = 4;

function getMessageWithLengthBuffer(msg) {
    const lenBuf = new Buffer(INT_BYTES_LEN);
    const msgBuf = msg.toBuffer();
    lenBuf.writeInt32BE(msgBuf.length);
    return Buffer.concat([lenBuf, msgBuf]);
}

module.exports = {INT_BYTES_LEN, getMessageWithLengthBuffer};
