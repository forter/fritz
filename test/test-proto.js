import { expect } from "chai";

import { logger } from "../lib/logger.js";
import { deserialize, Event, Msg, Reader, serialize } from "../lib/proto.js";

describe("Reader", () => {
  let r;

  before(() => {
    logger.silent = true;
  });

  after(() => {
    logger.silent = false;
  });

  describe("with maxMessageLength", () => {
    beforeEach(() => {
      r = new Reader(30);
    });

    describe("#readMessagesFromBuffer()", () => {
      it("Returns a single message", () => {
        const input = Msg.create({ events: [Event.create({ service: "test service", host: "localhost" })] });
        const data = serialize(input);
        const [output] = r.readMessagesFromBuffer(data);
        expect(deserialize(output)).to.eql(input);
      });

      it("Returns a multiple messages", () => {
        const message = Msg.create({ events: [Event.create({ service: "test service", host: "localhost" })] });
        const input = [message, message];
        const data = Buffer.concat(input.map(serialize));
        const output = r.readMessagesFromBuffer(data);
        expect(output.map(deserialize)).to.eql(input);
      });

      it("Throws on long message", () => {
        const input = Msg.create({ events: [Event.create({ service: "test service abc 123", host: "localhost" })] });
        const data = serialize(input);
        const messages = r.readMessagesFromBuffer(data);
        expect(messages).to.be.empty;
      });

      it("Handles partial messages", () => {
        const input = Msg.create({ events: [Event.create({ service: "test service", host: "localhost" })] });
        const data = serialize(input);
        const chunks = [data.slice(0, data.length - 2), data.slice(data.length - 2, data.length)];
        const messages = r.readMessagesFromBuffer(chunks[0]);
        expect(messages).to.be.empty;
        const [output] = r.readMessagesFromBuffer(chunks[1]);
        expect(deserialize(output)).to.eql(input);
      });

      it("Handles partial message header", () => {
        const input = Msg.create({ events: [Event.create({ service: "test service", host: "localhost" })] });
        const data = serialize(input);
        const chunks = [data.slice(0, 2), data.slice(2, data.length)];
        const messages = r.readMessagesFromBuffer(chunks[0]);
        expect(messages).to.be.empty;
        const [output] = r.readMessagesFromBuffer(chunks[1]);
        expect(deserialize(output)).to.eql(input);
      });
    });
  });
});
