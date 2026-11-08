# Avicii — a homepage for Kwirth

A styled landing page for [Kwirth](https://kwirthmagnify.dev): warm gold on black, geometric triangle
motifs and sharp Oswald typography, with **one card per connected cluster** and its live metrics.

## What it shows

- A card per connected cluster, with live metrics when the metrics provider is available.
- One-click launch into the **Magnify** channel, or into **Topology**, already pointed at that cluster.

Its settings are remembered per browser.

## Installing it in Kwirth

**☰ → Manage extensions → Homepages**, find **Avicii** in the marketplace and install it. Then pick it
as the homepage in **Settings**.

To develop against it instead, point `kwirth-dev.json` at your build:

```json
{
  "homepages": {
    "avicii": "../homepages/avicii/dist"
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
