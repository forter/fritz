const request = require("request");
const identity = () => {};

class PagerDuty {
  constructor(serviceKey) {
    this.serviceKey = serviceKey;
  }

  call({ incidentKey, description, details, eventType, callback }) {
    callback = callback || identity;
    request(
      {
        method: "POST",
        uri: "https://events.pagerduty.com/generic/2010-04-15/create_event.json",
        json: {
          service_key: this.serviceKey,
          incident_key: incidentKey,
          event_type: eventType,
          description,
          details,
        },
      },
      (err, res, body) => {
        if (err) {
          callback(err);
        } else if (res.statusCode !== 200) {
          callback(new Error(`Pagerduty error ${res.statusCode}: ${body}`));
        } else {
          callback(null, body);
        }
      }
    );
  }
}

module.exports = PagerDuty;
