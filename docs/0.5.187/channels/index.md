# Channels
As of Kwirth version 0.5.187, these are the existing channels:

  - **[Log](channels/log)**. Real time log streaming from different source objects (a container, a pod, a namespace or a custom mix of any of them).
  - **[Metrics](channels/metrics)**. Real-time metrics (CPU, memory, I/O, bandwidth...) on a set of objects.
  - **[Alert](channels/alert)**. Alerts based on log messages. Log messages are processed at Kwirth core, so you only receive alerts according to your channel config.
  - **[Echo](channels/echo)**. This is a reference channel for channel implementers, it is not useful for real Kubernetes operations.
  - **[Trivy](channels/trivy)**. Get security-related information based on Trivy vulnerability analyzer.
  - **[Ops](channels/ops)**. Perform day-to-day operations like shell, restarts, getting info, etc.
  - **[Fileman](channels/fileman)**. Access all your cluster filesystems (all your containers FS and your volumes) from one consolidated point.
  - **[Magnify](channels/magnify)**. Manage your cluster with a management tool like Lens, K9s or Headlamp: full access.
  - **[Pinocchio](channels/pinocchio)**. Extend Kwirth capabilities with AI, by adding LLM features.
  - **[Censor](channels/censor)**. LLM-based log noise filtering: learn regex patterns automatically and filter out boilerplate so only meaningful lines reach your screen.
  - **[Topology](channels/topology)**. Interactive 3D visualization of cluster resources and relationships.
  - **[News](channels/news)**. RSS news feed reader — test/demo plugin.

Please follow the links to get specific information on each channel.
