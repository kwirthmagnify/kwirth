# Matrix — a homepage for Kwirth

A Matrix-style cluster overview for [Kwirth](https://kwirthmagnify.dev), with **one card per connected
cluster**.

## What it shows

- A card per connected cluster.
- One-click launch into the **Magnify** channel, or into **Topology**, already pointed at that cluster.

## Installing it in Kwirth

**☰ → Manage extensions → Homepages**, find **Matrix** in the marketplace and install it. Then pick it as
the homepage in **Settings**.

To develop against it instead, point `kwirth-dev.json` at your build:

```json
{
  "homepages": {
    "matrix": "../homepages/matrix/dist"
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
