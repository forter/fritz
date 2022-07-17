import { getLogger } from "./logger.js";

const logger = getLogger("flush-handler");

export class FlushHandler {
  numAcksExpected;
  #resolve;
  #reject;

  constructor(numAcksExpected) {
    if (numAcksExpected <= 0) {
      throw new Error(`Expecting numAcksExpected to be greater than 0 and got ${numAcksExpected}`);
    }
    this.numAcksExpected = numAcksExpected;
  }

  executor(resolve, reject) {
    this.#resolve = resolve;
    this.#reject = reject;
  }

  handleAck() {
    this.numAcksExpected -= 1;
    if (this.numAcksExpected < 0) {
      logger.error(`Got to an invalid state with numAcksExpected=${this.numAcksExpected} < 0`);
    }
    if (this.numAcksExpected === 0) {
      this.#resolve();
    }
  }

  handleError(error) {
    this.#reject(error);
  }
}
