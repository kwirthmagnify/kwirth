# Alert

The **Alert** plugin watches log streams and metric values in real time and fires notifications when configured rules match. It supports two complementary rule types: regex-based log rules and threshold-based metric rules.

**How it works:**

1. Log lines from watched resources are tested against the configured regex lists. Matching lines fire an alert at the corresponding severity level.
2. Metric values received from the metrics provider are evaluated against the configured metric rules. When a threshold is crossed, an alert fires according to the selected trigger mode.
3. Fired alerts are forwarded to the configured sender (if any) and displayed in the Alert tab.

**Instance config (`IAlertInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `regexInfo` | `string[]` | `[]` | Regex patterns that fire an INFO alert when matched |
| `regexWarning` | `string[]` | `[]` | Regex patterns that fire a WARNING alert when matched |
| `regexError` | `string[]` | `[]` | Regex patterns that fire an ERROR alert when matched |
| `metricRules` | `IAlertMetricRule[]` | `[]` | Threshold rules evaluated against incoming metric values |
| `senderId` | `string` | — | Sender to notify when an alert fires |
| `senderConfigName` | `string` | — | Config name for the sender above |

**Metric rule (`IAlertMetricRule`):**

| Field | Type | Description |
|---|---|---|
| `metric` | `string` | Metric name to watch (e.g. `kwirth_container_cpu_percentage`) |
| `operator` | `TAlertMetricOperator` | Comparison operator: `<`, `<=`, `>`, `>=`, `==`, `!=` |
| `value` | `number` | Threshold value |
| `severity` | `EAlertSeverity` | Alert severity: `info`, `warning`, `error` |
| `mode` | `TAlertTriggerMode` | When to fire: `leading-edge` (once on first breach), `cooldown` (once, then wait), `continuous` (every evaluation) |
| `cooldown` | `number` | Seconds to wait before re-firing in `cooldown` mode |
