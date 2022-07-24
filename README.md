# Events Forwarder

Main goal is to buffer & forward events to Riemann.
This application usually runs as a sidecar to main applications and has these main traits:

1. Reconnecting client to remote Riemann
2. Buffers events and immediately acks them on receives
3. Easy configuration to custom-tailer to the various producers
4. Meant for high-throughput event producing to Riemann
5. Can report high failure rates to Pagerduty
6. Batches events when writing to Riemann

All code based on the original Fritz [code](https://github.com/forter/fritz)

[Documentation](https://docs.google.com/document/d/1kMyjnLxM17YhrZ7WF-AlX1dK650M5MhlweG3iwTfgfg)

## Running locally

Directly running the server:

```shell
$ npm start -- --log:level=debug --forward:host=localhost
```

Running locally using docker-compose and a local riemann

```shell
$ docker-compose up
```

Sending test events to local docker-compose server

```shell
$ node test/integration/send-events.js
```

You should see 3 events appear in your local Riemann logs like this:

```
fritz-local-riemann-1  | #riemann.codec.Event{:host "Gilad-MBP-Forter", :service "buffet_plates", :state nil, :description nil, :metric 252.2, :tags ["nonblocking"], :time 1658495100, :ttl nil}
fritz-local-riemann-1  | #riemann.codec.Event{:host "Gilad-MBP-Forter", :service "foo", :state nil, :description nil, :metric 3.4, :tags ["nonblocking"], :time 1658495100, :ttl nil}
fritz-fritz-1          | [forward-client] 2022-07-22T13:05:01.296Z debug:    Writing data to forward client length=99 numAcksExpected=1
fritz-local-riemann-1  | #riemann.codec.Event{:host "192.168.10.3", :service "prod-tx-storm-batch-instance-2015-03-23T1735 test", :state nil, :description nil, :metric 3.4, :tags ["fatal-exception"], :time 1658495100, :ttl nil}
```

### Running unit tests

```shell
$ npm test -- --log:level=debug --forward:host=localhost
```

### Linting

```shell
$ npm run prettier && npm run eslint
```

#### Getting the proto file

wget https://raw.githubusercontent.com/aphyr/riemann-java-client/master/riemann-java-client/src/main/proto/riemann/proto.proto
