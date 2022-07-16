import { createClient } from "riemann";

const RIEMANN_PORT = 5555;
const RIEMANN_HOST = "localhost";

const run = async () => {
  console.log("Connecting to riemann");
  const client = await createClient({
    host: RIEMANN_HOST,
    port: RIEMANN_PORT,
    returnPromise: true,
  });

  console.log("Sending first event");
  let data = await client.send(
    client.Event({
      service: "buffet_plates",
      metric: 252.2,
      tags: ["nonblocking"],
    }),
    client.tcp
  );

  console.log(data);

  console.log("Sending second event");
  data = await client.send(
    client.Event({
      service: "foo",
      metric: 3.4,
      tags: ["nonblocking"],
    }),
    client.tcp
  );
  console.log(data);

  console.log("Sending fatal exception event");
  data = await client.send(
    client.Event({
      service: "prod-tx-storm-batch-instance-2015-03-23T1735 test",
      host: "192.168.10.3",
      // time: Math.floor(Date.now() / 1000),
      metric: 3.4,
      tags: ["fatal-exception"],
    }),
    client.tcp
  );
  console.log(data);

  await client.disconnect();
};

await run();
