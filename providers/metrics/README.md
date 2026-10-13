# Metrics provider

The provider that reads **real-time resource metrics** from every node of a Kubernetes cluster for
**[Kwirth](https://kwirthmagnify.dev)**: CPU, memory, network, disk, pods. It asks each node's kubelet
(cAdvisor's `/metrics/cadvisor` and `/stats/summary`) directly, so there is **no Prometheus** or any other
scraping stack to install.

A provider has no tab of its own: it produces data and hands it to the channels that subscribe to it. In
Kwirth those are the **Metrics** channel, **Magnify**'s cluster overview, **Alert**'s metric rules,
**Pinocchio** and **Spectrum**, among others.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## Installing it

From Kwirth: **☰ → Manage extensions → Providers**, find **Metrics** in the marketplace and install it. It
already comes inside the Kwirth images that carry channels (`-readonly`, `-full`) and in the desktop app.

It needs a Kubernetes API behind Kwirth: without one (ECS, ACI, a container with no kubeconfig, the Helm
`zero` mode) there are no kubelets to read, and the provider says so once in the log and stays idle.

Inside a cluster it reaches the kubelets with the ServiceAccount token Kubernetes projects into the pod, so
the read-only deployment (`kwirth-full-ro.yaml`, Helm `readonly`) keeps its metrics. On the desktop it uses
the kubeconfig's credentials through the API server.

## How often it reads

Every **Cluster metrics interval** seconds (15 by default), set in Kwirth under **☰ → Kwirth settings**. A
new value takes effect on the next read, without restarting anything.

All nodes are read at once, and each call to a kubelet has a limit (40 % of the interval, at least 10 s), so
a node that hangs is reported by name and endpoint instead of holding the next reads back. If the interval
is shorter than a read of your cluster, the reads that would overlap are skipped and the log says so once,
with how long the read took — the figure to set the interval against.

## What it delivers

Every read, each subscriber gets the whole cluster:

```
{ metricsInterval, cluster, nodes, clusterMetricValues }
```

- `cluster`: the cluster usage (vCPUs, memory, CPU %, memory %, Tx/Rx Mbps, pods and pod capacity).
- `nodes`: per node, the raw cAdvisor values keyed `namespace/pod/container/metric` (containers) and
  `namespace/pod/metric` (pods), the machine values, and the kubelet's summary.
- Ready-made `kwirth_container_*` metrics (CPU %, memory %, read/write and Tx/Rx Mbps) next to the raw ones,
  and `kwirth_cluster_*` ones (total pods, pods %, memory %, CPU %) in `clusterMetricValues`.

The subscription payload is ignored today; consumers send `{ pod, container, machine }` flags. The provider
also serves, behind the caller's access key, the list of available metrics and the cluster usage at
`/core/providerconfig/metrics` and `/core/providerconfig/metrics/usage/cluster`.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
npm test                # unit tests (COVERAGE=1 for coverage)
```

To run it from source, add it to `back/kwirth-dev.json` as `"providers": { "metrics": "../providers/metrics/dist" }`.
A change to a provider's back end needs a **restart of the Kwirth back**.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
