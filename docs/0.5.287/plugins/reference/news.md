# News

The **News** plugin polls a set of RSS feeds and streams news items to the frontend tab in real time. Items are deduplicated across polls so each link is shown only once per session.

**Feeds available:**

| Feed key | Source |
|---|---|
| `kubernetes` | `kubernetes.io` official blog |
| `ai` | TechCrunch AI section |

**Instance config (`INewsInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `selectedFeeds` | `string[]` | `['kubernetes','ai']` | Which feed keys to subscribe to |

**Channel config (`INewsChannelConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `maxItems` | `number` | `50` | Maximum items kept in the tab view |

The poll interval is 5 minutes. The plugin does not require any Kubernetes resource — it works with `cluster: true` and selects any cluster-level object as its trigger.
