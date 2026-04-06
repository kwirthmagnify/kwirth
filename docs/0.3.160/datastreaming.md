# Data streaming
Kwirth, originally a log exporting system, can export Kubernetes data in real time. In the very first versions only log data was exported from Kubernetes (through Kwirth streaming mechanisms). Starting with version 0.3, Kwirth can also export:

  - Signaling data, that is, events related to contrl of the streams (info messages, error messaes and so on)
  - Metrcis data, that is, Kwirth can export Kubernetes metrics (container related metrics) in real time.

And since version 0.4 source data is managed in **channels**, what represent in fact an extension mechanism for adding functionality to Kwirth.

## How it works
As you may know, it's up to Kwirth clients to open connections to Kwirth server, I mean, opening web sockets for requesting data. Opening a websocket from a client to Kwirth is free, that is, there are no security requirements for opening the web socket. Security comes into action once the web socket is open and you want to start receiving a stream of data, wherever it be log, metrics or anything else. It's important to note that a web socket is a non-dedicated transport, what means that an open web socket can be used to stream different kinds of data. For sending data from server to client in an ordered way, a web socket can be used as a transport for different **intances**. An instance is a stream of data with a common scope and a common view (aside form other common charqacteristics less relevant at this momento).

  - **scope** is a spec of the kind of action you want to perform with the stream of data, for example:
    - View log lines
    - View pod status (obtaining real-time status streamed)
    - Receive metrics in real-time (a stream of metics in real-time)
    - Receive a metrics snapshot (just instant values with no streaming) 
  - **view** means what group of data you want to receive, that is, if your scope states a namespace and group of pods, you can decide what data you want to receive, for example:
    - Receive data for a set of pods (selected, for example, via a regex)
    - Receive data for a whole namespace

It is important to undertand what a **view** means:

  - If you open and start a streaming log channel, and your view is set to **namespace**, you will receive a stream of log lines including all the pods in the namespace.
  - Using the same scope, if your view is set to **container** you will receive a stream of log lines that are produced by all the containers that fulfill your scope declaration.

Simply put, scope is the action you want to perform, and view is a set of objects your want to work with.

## Messaging
When a client opens a web socket, the next action is to send an 'start instance' message, that is, to send a message to the Kwirth server explaining what kind of **streaming data** the client wants to receive.

When the server receives a message like that, it performs the following actions:

  - Extracts the **access key** in order to evaluate if that access key is suitable for this Kwirth server.
  - If everything is ok, next step is to check if the access key allows client to use the channel that the client wants to start (log streaming, for example)
  - If the client is not allowed, a negative response is sent.
  - If the client is allowed, the streaming service is started, sending streaming messages through the web socket according to scope spec sent by client.
  - Streaming continues until web socket is closed (obiously) or the instance is stoped via a 'stop instance' message.

Streaming data messages (log lines, metrics...) do contain information on the type of information they carry, so one only web socket can be used to receive different kinds of data. On the other side, clients may decide to open a specific web socket for each particular scope or particular kind of data, the server doesn't mind.

A typical 'start instance' message would contain this information:
  - **channel** of service (log, metrics...)
  - **access key**, previously obtaind using different methods (manually creating, creating via API...)
  - scope, indicating the action you want to perform (snapshot, stream...)
  - the view, indicating how to group streaming data
  - the resource spec (namespace, controller, pod, container)
  - specific data for configuring the streaming service according to the type of service the client is starting, that is, log streaming requires specific configuration that is different from the one used in metrics streaming.

## Channels
Up to this vesion of Kwirth, following streaming services are available.

### Log Streaming Service
Log streaming means receiving log data streams at client that is originated at a set of resurces (or an individual one).

A typical 'start log instance' message for receiving all log lines originated at 'production' namespace would be created like this (Typescript sample):

```javascript
var logConfig:LogConfig = {
    action: 'start',
    flow: 'request',
    channel: 'log',
    accessKey: '2f945632-5865-9f34-3f3e-437c5623c0c7|permanent|cluster:::::',
    instance: ''
    objects: 'pods',
    scope: 'view',
    view: 'namespace',
    namespace: 'production,qa,cert', 
    group: '',
    pod: '', 
    container: '',
    data: {
      timestamp: true,
      previous: false,
      maxMessages: 5000
    }
}                
ws.send(JSON.stringify(logConfig))
```

You will typically receive an answer like this one to that request:

```json
{
  "action": "start",
  "channel": "log",
  "flow": "response",
  "instance": "8212afcd2-e8fd-4f3b-b157-08127707b677",
  "reconnectKey": "a07d760f-8f86-4d5c-b7ba-6e3c4a241b54",
  "text": "Service Config accepted",
  "type": "signal"
}
```

Following message should be other 'signal' messages (form Kwirth to client). For example, next message is a signal message stating that a log for a specific container has started:

```json
{
  "channel": "log",
  "instance": "812afcd2-e8fd-4f3b-b157-08127707b677",
  "level": "info",
  "text": "Container ADDED: ingress-nginx/ingress-nginx-controller-7f6c7c5b59-tsls7/controller",
  "type": "signal"
}
```

If everything is ok, the Kwirth server would start sending log messages. What follows is a stream of JSON messages sent by the websocket.
```json
{
  "channel": "log",
  "container": "kafka",
  "instance": "812afcd2-e8fd-4f3b-b157-08127707b677",
  "namespace": "kafka",
  "pod": "kafka-broker-1",
  "text": "[2025-03-25 17:53:23,717] INFO [ProducerStateManager partition=__consumer_offsets-21] Loading producer state from snapshot file 'SnapshotFile(offset=7000, file=/bitnami/kafka/data/__consumer_offsets-21/00000000000000007000.snapshot)' (org.apache.kafka.storage.internals.log.ProducerStateManager)",
  "type": "data"
}
{
"channel": "log",
"container": "controller",
"instance": "812afcd2-e8fd-4f3b-b157-08127707b677",
"namespace": "ingress-nginx",
"pod": "ingress-nginx-controller-7f6c7c5b59-tsls7",
"text: "87.58.88.174 - - [25/Mar/2025:19:23:32 +0000] \"GET /api/logout HTTP/2.0\" 200 0 \"https://secure.secure.com/reports\" \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36\" 68 0.154 [pro-gateway-platform-svc-8080] [] 10.0.5.123:8080 0 0.154 200 2b79e96150faecc9b9694c7ad851079b",
"type": "data"  
}
```

As you may see, log data comes in massages of type 'data'.


### Metrics streaming
Metrics streaming means sending resource metrics from server to client. When talking about 'resource metrics' it is very important to note that metrics can be aggregated according to 'start instance' message indications on resource.

A typical 'metrics start' for receiving a stream of data about pod 'shopping-cart' would be created like this (Typescript sample):
```javascript
var metricsConfig:MetricsConfig = {
  "channel": "metrics",
  "objects": "pods",
  "action": "start",
  "flow": "request",
  "instance": "",
  "accessKey": "2f945f32-5865-9f34-3f3e-437c5623c0c7|permanent|cluster:::::",
  "scope": "subscribe",
  "view": "namespace",
  "namespace": "pro,kafka,ingress-nginx,default,data",
  "group": "",
  "pod": "",
  "container": "",
  "data": {
    "mode": "stream",
    "aggregate": false,
    "interval": 5,
    "metrics": ["container_blkio_device_usage_total_write"]
  }
}
ws.send(JSON.stringify(metricsConfig))
```
If everything is ok, the Kwirth server would start sending metrics messages. What follows is a stream of JSON messages sent by Kwirth:

```json
{"level":"info","channel":"metrics","instance":"9a3edb19-8c3f-44cc-8983-1ba3267c7d49","type":"signal","text":"Container ADDED: ingress-nginx/ingress-nginx-controller-7f6c7c5b59-tsls7/controller"}
```

And what follows is a sample of a metric message with metric data.
```json
{
  "channel":"metrics",
  "type":"data",
  "instance":"9a3edb19-8c3f-44cc-8983-1ba3267c7d49",
  "assets":[
    {"assetName":"ingress-nginx", "values":[ {"metricName":"container_blkio_device_usage_total_write", "metricValue":135168}]},
    {"assetName":"pro","values":[{"metricName":"container_blkio_device_usage_total_write","metricValue":651280384}]},
    {"assetName":"data","values":[{"metricName":"container_blkio_device_usage_total_write","metricValue":41869312}]},
    {"assetName":"kafka","values":[{"metricName":"container_blkio_device_usage_total_write","metricValue":30289920}]}],
  "namespace":"pro,kafka,ingress-nginx,default,data",
  "pod":"",
  "timestamp":1742931059651
}
```

### Signaling
When a stream of data is open, clients may receive information on that stream related with the events that occur in Kubernetes and impact the resources in scope, for example, new pods created, pods deleted, streaming errors, etc...

What follows are several sample signal messages that could be received at client side:

```json
{"level":"info","channel":"log","instance":"812afcd2-e8fd-4f3b-b157-08127707b677","type":"signal","text":"Pod MODIFIED: data/report-sender-processor-cron-jckb2"}
```

```json
{"level":"warning","channel":"log","instance":"812afcd2-e8fd-4f3b-b157-08127707b677","type":"signal","text":"Pod DELETED: data/report-sender-49m6g"}
```

```json
{"level":"error","channel":"metrics","instance":"812afcd2-e8fd-4f3b-b157-08127707b677","type":"signal","text":"Metric name is is incorrect"}
```

As you may see, every message contains a signal category, like 'info', 'warning', or 'error'. Typical Kubernetes events, like pod creating, pod deletion, etc., belong to the 'info category'.