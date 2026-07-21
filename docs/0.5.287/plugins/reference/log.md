# Log

The **Log** plugin streams real-time log output from any combination of containers, pods, groups, or namespaces. It supports previous-log retrieval, timestamp injection, per-pod buffering, and configurable sort order.

**Instance config (`ILogInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `previous` | `boolean` | `false` | Include logs from the previous container instance (useful after a crash) |
| `timestamp` | `boolean` | `false` | Prepend Kubernetes timestamps to each log line |
| `fromStart` | `boolean` | `false` | Stream from the very beginning of the container log instead of tailing |
| `startTime` | `number` | — | Unix timestamp (ms) from which to start streaming when `fromStart` is false |

**Channel config (`ILogConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `maxMessages` | `number` | `5000` | Maximum total lines kept in the tab view |
| `maxPerPodMessages` | `number` | `1000` | Maximum lines per pod kept in the tab view |
| `sortOrder` | `ELogSortOrder` | `TIME` | Display order: `none`, `time`, or `pod` |
| `showNames` | `boolean` | `true` | Show pod and container names alongside each line |
| `follow` | `boolean` | `true` | Auto-scroll to the latest line |
| `fromNowOn` | `boolean` | `true` | Only show lines arriving after the channel starts |
| `startDiagnostics` | `boolean` | `false` | Print a diagnostic line when the stream starts |
