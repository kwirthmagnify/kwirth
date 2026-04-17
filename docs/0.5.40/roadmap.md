# Roadmap
We cite here some interesting capabilities that are missing today:

  - ~~`kwirth`, **Non-root path**. In order to be able to share an ingress with other kubernetes services, it is desirable to have the ability to configure Kwirth (front and API) for receiving requests in a non-root path, that is, something like 'http://your.dns.name/kwirth'.~~ DONE!
  - ~~`kwirth`, **Deployment**. As well as the root path should be the administrator's decision, the namespace where to deploy Kwirth should be selectable by the Kubernetes administrator.~~ DONE!
  - ~~`kwirth`, **Update self**. Add an option to restart Kwirth (if image is latest, this will update Kwirth to the latest available version).~~ DONE!
  - ~~`log`, **Starting logs**. When a user starts a log object, he should be able to decide how much logging info to receive from the started log: since pod started, previous pod log, only from now on...~~ DONE!
  - `log`, **Secure log text**. We plan to add an option to protect log lines that contain specific sensitive text, like 'password', 'pw', 'email', etc., so lines including these words are treated in a special way by masking sensitive content.
  - ~~`kwirth`, **API Key expire**. We need to add something useful for humans in the API management at the front application when setting expiration.~~ DONE!
  - `log`, **Log Content**. In the LogContent component (the real viewer), we need to add a socket error management component so the user knows if an error has occurred when receiving data. Several types of information can be received: socket errors, pod creation/deletion, etc.
  - ~~`log`, **Ephemeral log**. When you use Kwirth for alerting, you don't really need to store all the messages; you just want to receive them, process them, and show alerts if something happens, without storing uninterested messages.~~ DONE!
  - ~~`metrics`, **Metrics**. We plan to add basic Kubernetes metrics monitoring in the future by checking pod/node status. The metrics will be propagated to customers through the websocket, so users can view real-time metrics and statuses.~~ DONE!
  - ~~`kwirth`, **Helm**. Although Kwirth installation is simple and straightforward, we should create a Helm chart for installing Kwirth.~~ DONE!
  - ~~`kwirth`, **Event streaming**. It seems interesting to have an event streaming service (like logging or metrics) for monitoring all events that take place inside the Kubernetes cluster (object lifecycle, admin commands...).~~ DONE!
  - ~~`kwirth`, **Websocket multi-service**. Currently, we support exchanging information on a websocket that belongs to different services. We need to add a 'service instance id' to allow several instances of the same service to coexist in the same websocket.~~ DONE!
  - ~~`kwirth`, **Helm**. Add Ingress support to Helm Charts.~~ DONE!
  - `metrics`, **Alerting metrics**. We want Kwirth to be able to alert you based on metrics thresholds, not just log messages.
  - `kwirth`, **Session**. We need to manage frontend sessions and store access keys into the browser's `localStorage`.
  - ~~`kwirth`, **Terminal**. Add xterm support (with dedicated websocket) for implementing real shell sessions (not just TTY in HTML).~~ DONE via Ops channel!
  - ~~`kwirth`, **Dashboards**. Add workspace channel (grafana-like), and implement multi-channel websockets.~~ DONE via Magnify channel!
  - `kwirth`, **AI capabilities**. Integrate AI-driven insights for log analysis, anomaly detection or artifact analysis.
  - `kwirth`, **SSO**, implement Single Sing-On capabilities.
  - `kwirth`, **IdP**, implement integrations with external Identity Providers (EntraID, AD, Cognito, Keycloak, LDAP...)
  - `kwirth`, **Standard tokens**, implement JWT support (with scopes that match the VIEW system implemented inside Kwirth)
  - `magnify`, **Desktop**, create a Tauri compatible build for desktop versions.
  - `kwirth`, **Grafana**, develop grafana plugins for log streaming and aggregation.
  - `pinocchio`, **Pinocchio**, evolve to autonomous Kubernetes system, by adding AI capabilities like: processing logs, metrics and events with AI, and get recommendations, 
  - `kwirth`, **Channel config**, implement channel and provider external configuration via env vars (something like KWIRTH_CHANNEL_&lt;chid&gt;_ &lt;varname&gt;='sssss')
  - ~~`magnify`, **Node operations** add a KwirthWork or a KubeWork to shell a node.~~ DONE!
  - `magnify`, **Nerd operations**, since using fileman you can modify a container's filesystem, we need a tool to push the modified container back to a registry (nerdctl)
  - `kwirth`, **Extensibility**, implement a plugin system for front channels, back channels and providers, something like esm.sh.
  - `magnify`, **Data management**, for being able to work with big clusters, we should be able to filter data management sync by namespace.
  - `kwirth`, **Networking**, evaluate creation of a 'network diagnostics' channel, or an item action for diagnosing a pod.
  - `kwirth`, **Workspace**, workspaces should be exportable/importable by selecting a different than the one the workspace was builded for.
  - ~~`magnify`, **UX/UI**, improve filtering (add node filters (and other) on RFM).~~ DONE!
  - `kwirth`, **Mixed sources**, create a channel (or any other mechanism) for aggregating data from different sources under the same channel.
  - `magnify`, **Artifact configuration**, normally all classical artifacts from Kubernetes are added to a specific section inside Kwirth Magnify (workload, cluster, config, custom...). Let's take an example: with the arrival of Gateway API, all related resources (GatewayClass, GatewayApi, HTTPRoute...) are being shown as CRD and CRD instances. But, possibly a user would expect to get those information insde 'Network' section, nor 'Customization' section. For this to be something flexible and user-customizable, MAgnify must provide a mechanism to configure what top category (workload, network, config) any Kind belongs to. This way, the user can, for example, show HTTPRoute inside network (like Ingress resources), while other Gateway API resources can be kept inside 'Custom'.
  - `kwirth`, **Installation**, update Helm to support GatewayAPI
  