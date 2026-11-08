# Depeche Mode — a homepage for Kwirth

A styled landing page for [Kwirth](https://kwirthmagnify.dev): abyss black, blood-red accents, bone text
and condensed bold typography, with **one card per connected cluster** drawn with ASCII metric bars.

## What it shows

- A card per connected cluster, with its metrics as ASCII bars when the metrics provider is available.
- A *STRANGELOVE* launch that opens the **Magnify** channel already pointed at that cluster.

## Installing it in Kwirth

**☰ → Manage extensions → Homepages**, find **Depeche Mode** in the marketplace and install it. Then pick
it as the homepage in **Settings**.

To develop against it instead, point `kwirth-dev.json` at your build:

```json
{
  "homepages": {
    "depeche-mode": "../homepages/depeche-mode/dist"
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
