'use strict';

const {Queue} = require('../queue'),
      should = require('should');

describe('Queue', () => {
    let q;

    describe('with maxLength', () => {
        beforeEach(() => {
            q = new Queue(2);
        });

        describe('#pushright()', () => {
            it('Pushes a single element', () => {
                q.pushright('a');
                q.toArray().should.eql(['a']);
            });

            it('Pushes a second element', () => {
                q.pushright('a');
                q.pushright('b');
                q.toArray().should.eql(['a', 'b']);
            });

            it('Rotates after third element', () => {
                q.pushright('a');
                q.pushright('b');
                q.pushright('c');
                q.toArray().should.eql(['b', 'c']);
            });

            it('Maintains correct length', () => {
                q.length.should.equal(0);
                q.pushright('a');
                q.length.should.equal(1);
                q.pushright('b');
                q.length.should.equal(2);
                q.pushright('c');
                q.length.should.equal(2);
            });
        });

        describe('#popleft', () => {
            it('Does nothing when empty', () => {
                q.popleft();
                q.toArray().should.eql([]);
            });
        });
    });
});
