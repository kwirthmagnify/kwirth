# Roadmap
We cite here some interesting capabilities that are missing today:

  - ~~**Non-root path**. In order to be able to share an ingress with other kubernetes services, it is desirable to have the ability to configure Kwirth (front and API) for receiving requests in a non-root path, that is, something like 'http://your.dns.name/kwirth'.~~ DONE!
  - ~~**Deployment**. As well as the root path should be the administrator's decision, the namespace where to deploy Kwirth should be selectable by the Kubernetes administrator.~~ DONE!
  - ~~**Update self**. Add an option to restart Kwirth (if image is latest, this will update Kwirth to the latest available version).~~ DONE!
  - ~~**Starting logs**. When a user starts a log object, he should be able to decide how much logging info to receive from the started log: since pod started, previous pod log, only from now on...~~ DONE!
  - **Secure log text**. We plan to add an option to protect log lines that contain specific sensitive text, like 'password', 'pw', 'email', etc., so lines including these words are treated in a special way by masking sensitive content.
  - ~~**API Key expire**. We need to add something useful for humans in the API management at the front application when setting expiration.~~ DONE!
  - **Log Content**. In the LogContent component (the real viewer), we need to add a socket error management component so the user knows if an error has occurred when receiving data. Several types of information can be received: socket errors, pod creation/deletion, etc.
  - ~~**Ephemeral log**. When you use Kwirth for alerting, you don't really need to store all the messages; you just want to receive them, process them, and show alerts if something happens, without storing uninterested messages.~~ DONE!
  - **Consolidated log object**. In addition to the ability to have config workspaces with content from more than one source cluster, it is desirable to create a log object (a tab, not a full config) in which you can consolidate logging from different source clusters into a single log stream.
  - **Import/Export**. For the import/export process to be really useful, it is desirable that the user could select which config workspaces to export or import.
  - ~~**Metrics**. We plan to add basic Kubernetes metrics monitoring in the future by checking pod/node status. The metrics will be propagated to customers through the websocket, so users can view real-time metrics and statuses.~~ DONE!
  - ~~**Helm**. Although Kwirth installation is simple and straightforward, we should create a Helm chart for installing Kwirth.~~ DONE!
  - ~~**Event streaming**. It seems interesting to have an event streaming service (like logging or metrics) for monitoring all events that take place inside the Kubernetes cluster (object lifecycle, admin commands...).~~ DONE!
  - **IAM**. Add integration with common IAM systems; that is, implement SSO with Google, Azure, GitHub, etc.
  - ~~**Websocket multi-service**. Currently, we support exchanging information on a websocket that belongs to different services. We need to add a 'service instance id' to allow several instances of the same service to coexist in the same websocket.~~ DONE!
  - ~~**Helm**. Add Ingress support to Helm Charts.~~ DONE!
  - **Alerting metrics**. We want Kwirth to be able to alert you based on metrics thresholds, not just log messages.
  - **Session**. We need to manage frontend sessions and store access keys into the browser's `localStorage`.
  - ~~**Terminal**. Add xterm support (with dedicated websocket) for implementing real shell sessions (not just TTY in HTML).~~ DONE via Ops channel!
  - ~~**Dashboards**. Add dashworkspace channel (grafana-like), and implement multi-channel websockets.~~ DONE via Magnify channel!
  - **AI capabilities**. Integrate AI-driven insights for log analysis and anomaly detection.
