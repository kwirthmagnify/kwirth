# Metrics (provider)

> **Type:** Provider<br>
> **Package:** `@kwirthmagnify/kwirth-provider-metrics`

## What it does

The **Metrics** provider reads **real-time resource metrics** from every node of the cluster: CPU, memory, network, disk and pods. It asks each node's **kubelet** directly (cAdvisor's `/metrics/cadvisor` and the `/stats/summary` endpoint), so there is **no Prometheus** or any other scraping stack to install.

Every **Cluster metrics read interval** seconds it reads the whole cluster and hands that reading to every channel subscribed to it. It is what feeds:

| Consumer | What it uses |
|---|---|
| **[Metrics](../plugins/metrics)** channel | Everything: the per-container and per-pod values, and the list of available metrics its setup offers. |
| **[Magnify](../plugins/magnify)** | The cluster usage in its overview (% CPU, % Memory, Tx/Rx Mbps), and the Metrics windows it opens on objects. |
| **[Alert](../plugins/alert)** | Its metric-threshold rules. |
| **Pinocchio**, **Spectrum**, **Agora** | Their own analyses and panels. |
| **Home page** | The cluster consumption figures. |

Besides the raw cAdvisor values it adds ready-made metrics: `kwirth_container_*` (CPU %, memory %, read/write and Tx/Rx Mbps) and `kwirth_cluster_*` (total pods, pods %, memory %, CPU %). They are described on the [Metrics channel](../plugins/metrics#the-kwirth_-convenience-metrics) page.

## When you need it

Whenever Kwirth runs **with a Kubernetes cluster behind it** and you want metrics: the Metrics channel, Magnify's consumption charts, metric alerts. Without it those still open, but have nothing to show — Magnify says so in its overview instead of drawing empty charts:

> *The metrics provider is not installed in this cluster, so there is no cluster usage to draw. Install it from ☰ → Manage extensions → Providers.*

## Installing it

From **☰ → Manage extensions → Providers**, find **Metrics** in the marketplace and install it. It **already comes installed** in the images that carry channels (`-readonly` and `-full`, which is also the plain image tag and `latest`) and in the desktop app — see the image variants in [Deployment](../../admin/01-deployment). On a `-core` image you install it yourself.

The plugins that live on it (**Metrics**, **Alert**, **Pinocchio**, **Spectrum**, **Agora**) declare it as a requirement, so the marketplace will not let you install them without it.

## Configuration

**None** of its own. The one setting it obeys is the **Cluster metrics read interval (seconds)** in **☰ → Kwirth settings** (15 by default), which belongs to Kwirth: change it there and the provider takes the new value on its next read, without restarting anything. See [Initial configuration](../../admin/02-initial-config).

## How it reaches the kubelets

| Where Kwirth runs | How |
|---|---|
| **Inside the cluster** | Straight to each node's kubelet (port 10250), with the **ServiceAccount token** Kubernetes projects into the pod. That is why the read-only deployment (`kwirth-full-ro.yaml`, Helm mode `readonly`) keeps its metrics: reading that token needs no permission. |
| **Outside, with a kubeconfig** | Through the API server's node proxy (`/api/v1/nodes/<node>/proxy/...`). |
| **Desktop** | The same proxy, with the **kubeconfig's credentials**. |

## Notes

- **No Kubernetes behind Kwirth** (ECS, ACI, a container without a kubeconfig, Helm mode `zero`): there are no kubelets to read. The provider says so **once** in the log and stays idle, so don't bother installing it there.
- **No ServiceAccount token** inside a cluster: every read would be a 401, so it does not start its clock and warns once, instead of one error per node every interval.
- **A node that does not answer** only loses its own metrics for that read; the rest of the cluster keeps coming. Every node is read at the same time, and each call to a kubelet is given a limit (40 % of the interval, never under 10 s): a node that hangs is reported in the log by name and endpoint (`'/metrics/cadvisor' did not answer within 10s`) instead of holding every later read back.
- **An interval shorter than a read.** Reading the whole cluster takes a while — a few hundred KB per node. If the interval is shorter, the reads that would start while one is still running are skipped: the log says *Still loading cluster metrics* **once**, and when that read ends, how long it took and how many reads were skipped. That figure is what to set the interval against; 15 s suits most clusters, and very short values (a few seconds) rarely do.
- It needs nothing from the cluster beyond what Kwirth already reads: no extra RBAC, no agents.

---

← Back to [Providers](index)
