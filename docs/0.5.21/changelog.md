# Change log
Although not too exhaustive, this page contains some detail on what has been done on each version.

## 0.5.21
The change log for this version is quite extensive. What follows is just an excerpt:
  - **Multiple deployment options**: Now you can deliver Kwirth in several ways, not just as a Kubernetes pod: **Magnify** (a Desktop application), **Docker** (a standalone dockerized version), and **External** (a setup designed for deploying Kwirth directly to your Windows, macOS, or Linux box).
  - Added **Magnify channel**: A full replacement for tools like Lens or K9s.
  - Finished **Trivy channel**: Now the Trivy channel shows more information about your workload, including SBOM and configuration auditing, in addition to exposed secrets and vulnerabilities.
  - Improved performance and security for the **Fileman channel**.
  - **Dark mode** is finally working smoothly (CSS is so annoying...).

## 0.4.127
  - Added **Fileman channel**.
  - Added configurable endpoint for channel use.
  - Added **homepage** including:
    - Cluster details.
    - Cluster usage data.
    - "Last & Fav" tabs and workspaces.
  - Added a **notifier** for sending messages to users from frontend channels.
  - Added `react-file-manager` as a customizable file manager for Kwirth.
  - Added a parse listener for parsing `ls` commands in the Fileman channel.
  - Added **Helm chart** installation support.

## 0.4.20
  - **Strong architecture changes**: Introduced internal changes to support different kinds of connections consuming various types of information (not only logs).
  - **Added Channels**: A Channel represents a specific kind of information that Kwirth extracts from Kubernetes and sends to clients. The first implemented channels (included in Kwirth core) are: **Log, Metrics, and Alert**.
  - **Extensibility**: Kwirth can now be extended by creating new channels that can be loaded at runtime; increasing Kwirth's capabilities no longer implies modifying its core.
  - **Instances**: To allow consumers to mix content from different resources, Kwirth introduced the concept of "instances" orthogonally with channels. When a client opens a WebSocket for a specific channel type, it can create instances to receive information from different sets of origin resources.
  - **Bearer Tokens**: Since increased capabilities can produce heavy workloads, we introduced specific bearer tokens to drastically simplify workload management when multiple Kubernetes replicas are running in the backend.
  - **Multi-resource selection**: The base frontend application now supports selecting multi-resource objects. For example, you can monitor the CPU usage of three different pods from different namespaces or groups simultaneously.
  - **Data Aggregation**: The metrics section enables aggregating and/or merging data from different objects.
  - **Custom Metrics**: The Metrics channel implements several custom metrics to simplify observability:
    - **kwirth_container_memory_percentage**: Percentage of memory used by the object relative to the whole cluster.
    - **kwirth_container_cpu_percentage**: Percentage of CPU used relative to the whole cluster.
    - **kwirth_container_random_counter**: Accumulated container random values.
    - **kwirth_container_random_gauge**: Instant container random values.
    - **kwirth_container_transmit_percentage**: Percentage of data sent in relation to the whole cluster.
    - **kwirth_container_receive_percentage**: Percentage of data received in relation to the whole cluster.
    - **kwirth_container_transmit_mbps**: Mbps of data sent over the last period.
    - **kwirth_container_receive_mbps**: Mbps of data received over the last period.
    - **kwirth_container_write_mbps**: Mbps of data written to disk during the last period.
    - **kwirth_container_read_mbps**: Mbps of data read from disk during the last period.
  - **Versioned Documentation**: Documentation is now versioned; you can select the specific Kwirth version documentation from the sidebar.

## 0.3.160
  - Created `@kwirthmagnify/kwirth-common` for sharing data structures between clients and the Kwirth server.
  - Added a new **version detector** on user login to identify backend versions.
  - Added **multi-streaming channels** to WebSockets (required for streaming data other than logs).
  - **New Security System**: Based on differentiating services (log, streaming, operation...) and scopes. By adding the "service" entity, we can now add different data streams like metrics (snapshot or stream) and signaling info (errors, warnings).
  - **Streaming Metric Service**: Includes two scopes: **snapshot** (instant metrics set) and **streaming** (continuous metrics), relative to a Kubernetes artifact (container, pod, deployment, or namespace). Aggregated artifacts will have metrics summed or averaged according to their semantics.
  - This first version of streaming metrics requires establishing a log service to open the WebSocket, but future updates will allow independent or unified WebSockets for all services.

## 0.2.8
  - **Security Redefinition**: Overhauled the API Key / Access Key system for more flexible management.
  - **Status Information**: Kwirth now sends status data (pods added/stopped, Kubernetes errors) through the same socket used for log streams.
  - **Version Info via API**: Clients can now query the version to know which features are implemented.
  - Added `/find` endpoint to perform searches on Kubernetes artifacts.
  - **Kubernetes Operations**: Added permissions-based operations to restart deployments and pods via Kwirth.
  - Several UI improvements and a simplified resource selector.

## 0.1
Initial version including:
  - Access to several clusters.
  - Admin user management.
  - API key security for distributed Kwirth instances.
  - React/TS frontend.