# Metrics

The channel that draws **real-time resource metrics** — CPU, memory, network and disk — as live charts in
**[Kwirth](https://kwirthmagnify.dev)**.

It reads straight from the kubelet/cAdvisor of your nodes through Kwirth's built-in `metrics` provider, so
there is **no Prometheus** (or any other scraping stack) to install. Pick a scope — a namespace, a
controller's pods, specific pods or a single container — choose the metrics, and the charts start filling.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Watching CPU and memory** of a workload while it takes load.
- **Comparing** several namespaces or pods side by side (*merge*), or seeing them as a single total (*aggregate*).
- **A quick current value** of a metric, without a full chart.

It is also the channel Kwirth's **Magnify** opens when you ask for the metrics of a pod or a controller.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Metrics** in the marketplace and install it.

It needs the cluster's `metrics` provider, which ships with the Kwirth core on Kubernetes: nothing else to
install. Without a Kubernetes API (ECS, ACI, bare OS) there are no metrics to draw.

## Configuration

The setup dialog picks the metrics (at least one), the depth of the charts (how many samples they keep),
how many charts per row, the sampling interval, and how several objects are drawn: one chart each, merged
into one chart, or aggregated into a single series. Each chart's menu changes its type (line, area, bar,
pie, value, treemap), stacking, labels, legend, and exports its data.

The user guide, with screenshots, lives in the Kwirth documentation:
**https://kwirthmagnify.dev** → Guide → Extensions → Plugins → Metrics.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"metrics": "../plugins/metrics/dist"`. With
the watch running, a back change is hot-reloaded by the core; a front change needs a browser reload.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
