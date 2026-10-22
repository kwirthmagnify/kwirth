# Clusterized — a homepage for Kwirth

A cluster-centric landing page for [Kwirth](https://kwirthmagnify.dev): **one card per cluster**, each
with its status and a one-click launch into Magnify on that cluster.

It answers the question you actually have when you open Kwirth with more than one cluster connected —
*which of them is in trouble, and how do I get there* — without going through a menu first.

## What it shows

- A card per connected cluster, with a status indicator.
- Live metrics per cluster when the metrics provider is available; the card degrades gracefully when it
  is not, instead of showing an empty frame.
- A launch button that opens the **Magnify** channel already pointed at that cluster.

Its settings are remembered per browser, so each person keeps the layout they chose.

## Installing it in Kwirth

**☰ → Manage extensions → Homepages**, find **Clusterized** in the marketplace and install it. Then pick
it as the homepage in **Settings**.

To develop against it instead, point `kwirth-dev.json` at your build:

```json
{
  "homepages": {
    "clusterized": "../homepages/clusterized/dist"
  }
}
```

## About Kwirth

**Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
in real time, extended with plugins, providers and homepages like this one.

- Website: **https://kwirthmagnify.dev**
- Source: **https://github.com/kwirthmagnify/kwirth**

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
