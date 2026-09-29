# Channels
As of kwirth version 0.6.31, these are the existing channels:

  - **[Log](log)**. Real time log streaming from different source objects (a container, a pod, a namespace or a custom mix of any of them).
  - **[Metrics](metrics)**. Real-time metrics (CPU, memory, I/O, bandwidth...) on a set of objects.
  - **[Alert](alert)**. Alerts based on log messages. Log messages are processed at kwirth core, so you only receive alerts according to your channel config.
  - **[Echo](echo)**. This is a reference channel for channel implementers, it is not useful for real Kubernetes operations.
  - **[Trivy](trivy)**. Get security-related information based on Trivy vulnerability analyzer.
  - **[Ops](ops)**. Perform day-to-day operations like shell, restarts, getting info, etc.
  - **[Fileman](fileman)**. Access all your cluster filesystems (all your containers FS and your volumes) from one consolidated point.
  - **[Magnify](magnify)**. Manage your cluster with a management tool like Lens, K9s or Headlamp: full access.
  - **[Pinocchio](pinocchio)**. Extend kwirth capabilities with AI, by adding LLM features.
  - **[Censor](censor)**. LLM-based log noise filtering: learn regex patterns automatically and filter out boilerplate so only meaningful lines reach your screen.
  - **[Topology](topology)**. Interactive 3D visualization of cluster resources and relationships.
  - **[Status](status)**. What this Kwirth has inside: every provider, sender and webhook it has mounted, what state each one is in, and why.
  - **[News](news)**. RSS news feed reader — test/demo plugin.
  - **[Provider Debug](/0.6.31/guide/extensions/plugins/provider-debug)**. For debugging purposes, it shows provider subscriptions data in real time.
  - **[Sender Debug](/0.6.31/guide/extensions/plugins/sender-debug)**. For debugging purposes, it sends a hand-written message through a sender and shows what the sender answered.

Please follow the links to get specific information on each channel.
