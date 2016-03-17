'use strict';

class Queue {
    constructor(maxLength = null) {
        this.length = 0;
        this.maxLength = maxLength;
        this.head = null;
        this.tail = null;
    }

    pushright(value) {
        if (this.length === this.maxLength)
            this.popleft();
        const node = new Node(value);
        if (this.head === null)
            this.tail = this.head = node;
        else
            this.tail = this.tail.next = node;
        this.length += 1;
    }

    popleft(value) {
        if (this.head !== null) {
            const first = this.head;
            this.head = this.head.next;
            if (this.head === null)
                this.tail = null;
            this.length -= 1;
            first.next = null;
            return first.value;
        }
        return null;
    }

    *[Symbol.iterator]() {
        let curr = this.head;
        while (curr !== null) {
            yield curr.value;
            curr = curr.next;
        }
    }

    toArray() {
        const arr = [];
        for (const val of this)
            arr.push(val);
        return arr;
    }

    isFull() {
        return this.length === this.maxLength;
    }
}

class Node {
    constructor(value, next = null) {
        this.value = value;
        this.next = next;
    }
}

module.exports = {Queue};
