import got from "got";

import { getLogger } from "./logger.js";

const logger = getLogger("pagerduty");

class PagerDuty {
  constructor(serviceKey) {
    this.serviceKey = serviceKey;
  }

  async call({ incidentKey, description, details, eventType }) {
    try {
      const response = await got
        .post("https://events.pagerduty.com/generic/2010-04-15/create_event.json", {
          timeout: { request: 20000 },
          json: {
            service_key: this.serviceKey,
            incident_key: incidentKey,
            event_type: eventType,
            description,
            details,
          },
        })
        .json();
      if (!response.ok) {
        logger.error(`Got status code ${response.statusCode} from pagerduty with exception`, response.body);
      }
    } catch (e) {
      logger.error("Pagerduty exception", e);
    }
  }
}

export { PagerDuty };
