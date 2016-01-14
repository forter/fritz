'use strict';

const {Queue} = require('../queue.js');
let q = new Queue(3);
q.pushright('a');
q.pushright('b');
q.pushright('c');
console.log(q);
q.pushright('d');
console.log(q);
for (let x of q) {console.log(x)}
//assert()
