# Topology

The **Topology** plugin renders an interactive **3D visualization** of your Kubernetes cluster. Nodes represent workloads, services, ingresses, and persistent volumes; edges represent ownership and service-selection relationships. You can orbit, zoom, and pan the 3D canvas, click nodes to inspect them, and hide or filter by kind or namespace.

**Supported node kinds:** `Ingress`, `Service`, `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job`, `CronJob`, `Pod`, `PersistentVolumeClaim`

**Node status colours** reflect the real-time state: Running (green), Pending (yellow), Failed (red), Succeeded (blue), Terminating (orange), Unknown (gray), and PVC-specific states (Bound, Released, Lost).

**Channel config (`ITopologyConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `showPods` | `boolean` | `true` | Show Pod nodes |
| `showServices` | `boolean` | `true` | Show Service nodes |
| `showIngresses` | `boolean` | `true` | Show Ingress nodes |
| `showDeployments` | `boolean` | `true` | Show Deployment nodes |
| `showStatefulSets` | `boolean` | `true` | Show StatefulSet nodes |
| `showDaemonSets` | `boolean` | `true` | Show DaemonSet nodes |
| `showJobs` | `boolean` | `false` | Show Job nodes |
| `showCronJobs` | `boolean` | `false` | Show CronJob nodes |
| `showPvcs` | `boolean` | `true` | Show PersistentVolumeClaim nodes |
| `showOnlyRunning` | `boolean` | `false` | Hide non-running workloads |
| `edgeAnimated` | `boolean` | `true` | Animate edge flow |
| `labelSize` | `number` | `12` | Font size for node labels (px) |
| `nodeSpacingFactor` | `number` | `0.5` | Multiplier for the 3D layout spacing |
| `gridColumns` | `number` | `8` | Columns in the initial grid layout |

**Instance config (`ITopologyInstanceConfig`):** optional filters by pod name, service name, ingress name, or group (`Kind/name` format). Leave empty to show the full cluster.

The Topology plugin requires the **events** provider and is cluster-scoped (no specific resource needed).
