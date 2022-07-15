require("should");
const { Reader, Msg, Event, serialize, deserialize } = require("../lib/proto");
const { logger } = require("../lib/logger");

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
        deserialize(output).should.eql(input);
      });

      it("Returns a multiple messages", () => {
        const message = Msg.create({ events: [Event.create({ service: "test service", host: "localhost" })] });
        const input = [message, message];
        const data = Buffer.concat(input.map(serialize));
        const output = r.readMessagesFromBuffer(data);
        output.map(deserialize).should.eql(input);
      });

      it("Throws on long message", () => {
        const input = Msg.create({ events: [Event.create({ service: "test service abc 123", host: "localhost" })] });
        const data = serialize(input);
        const messages = r.readMessagesFromBuffer(data);
        messages.should.be.empty();
      });

      it("Handles partial messages", () => {
        const input = Msg.create({ events: [Event.create({ service: "test service", host: "localhost" })] });
        const data = serialize(input);
        const chunks = [data.slice(0, data.length - 2), data.slice(data.length - 2, data.length)];
        const messages = r.readMessagesFromBuffer(chunks[0]);
        messages.should.be.empty();
        const [output] = r.readMessagesFromBuffer(chunks[1]);
        deserialize(output).should.eql(input);
      });

      it("Handles partial message header", () => {
        const input = Msg.create({ events: [Event.create({ service: "test service", host: "localhost" })] });
        const data = serialize(input);
        const chunks = [data.slice(0, 2), data.slice(2, data.length)];
        const messages = r.readMessagesFromBuffer(chunks[0]);
        messages.should.be.empty();
        const [output] = r.readMessagesFromBuffer(chunks[1]);
        deserialize(output).should.eql(input);
      });
    });
  });
});
