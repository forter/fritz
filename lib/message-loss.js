import { bufferTime, map } from "rxjs/operators";

import { nconf } from "./config.js";
import { getLogger } from "./logger.js";
import { PagerDuty } from "./pagerduty.js";

const logger = getLogger("pagerduty-alerts");

const handleMessageLoss = (forwarder) => {
  const pager = new PagerDuty(nconf.get("pagerduty:serviceKey"));
  const alertCheckIntervalSecs = nconf.get("pagerduty:alertCheckIntervalSecs");
  const lostMessagesThreshold = nconf.get("pagerduty:lostMessagesThreshold");
  const vm_data = nconf.get("pagerduty:vm_data");
  const hostname = vm_data ? vm_data["hostname"] : nconf.get("hostname");
  let lossState = "passed";

  forwarder.messageLossCounter$
    .pipe(
      bufferTime(alertCheckIntervalSecs * 1000),
      map((events) => events.reduce((a, b) => a + b, 0))
    )
    .subscribe(async (totalMessagesLost) => {
      const newState = totalMessagesLost >= lostMessagesThreshold ? "failed" : "passed";

      if (newState !== lossState) {
        lossState = newState;
        logger.warn(
          `Forward client state is ${lossState} (dropped ${totalMessagesLost} in the last ${alertCheckIntervalSecs} secs)`
        );

        if (!nconf.get("pagerduty:serviceKey")) {
          return;
        }

        const service = "fritz message loss";
        const incidentKey = `${hostname} ${service}`;
        const eventType = lossState === "failed" ? "trigger" : "resolve";
        await pager.call({
          incidentKey,
          eventType,
          details: {
            time: new Date().toTimeString(),
            vm_data,
            service,
            lossState,
            totalMessagesLost,
          },
          description:
            hostname +
            " fritz dropped over " +
            lostMessagesThreshold +
            " in the last " +
            alertCheckIntervalSecs +
            " secs (" +
            totalMessagesLost +
            " lost messages). " +
            "See Fritz doc's Alerts section - https://forter.atlassian.net/wiki/spaces/ENG/pages/7897784/Fritz+-+Riemann+Proxy+System+Overview",
        });
      }
    });
};

export { handleMessageLoss };
