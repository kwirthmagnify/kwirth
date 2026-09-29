# Kwirth Helm chart: source, versioning and publishing

This folder is the **source** of the chart. What users install comes from the repository at
`https://kwirthmagnify.dev/helm-charts`, which is nothing more than the `docs/helm-charts` folder of this
repo served by GitHub Pages (`docs/` is the website root, `CNAME` = `kwirthmagnify.dev`).

```
deploy/helm/
├── kwirth/             the chart (ONE source; the version lives in Chart.yaml)
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── README.md       the user-facing reference, packaged inside the tgz
│   └── templates/
├── tests/
│   ├── chart.test.mjs  unit tests: helm template + assertions (no cluster needed)
│   └── run-e2e.mjs     e2e against the current kube context: install, upgrade, uninstall, and the migration from 0.1.5
├── publish-chart.mjs   lint + tests + package + index, into docs/helm-charts
└── 0.1.0 … 0.1.5       the old layout (a full copy per version). Kept for the record, no longer packaged.
```

## Versioning

Two numbers, two meanings:

| field | meaning | when it moves |
|---|---|---|
| `version` | the chart itself (templates, values) | every change to this folder; SemVer: patch for a fix, minor for new values or resources, major for a breaking change in values |
| `appVersion` | the Kwirth image the chart was tested with, and the default image tag | every time the chart is re-tested against a new Kwirth release |

A published chart is **immutable**: `publish-chart.mjs` refuses to package a version whose tgz is already in
the repository. To ship a change, bump `version`.

The old layout (one folder per version, all re-packaged on every publish) is gone: it re-generated the old
tgz files every time, which is how the same `0.1.5` ended up twice in `index.yaml` with two different
`appVersion`s. Git history is the record of what each version contained.

## Publishing

```
node deploy/helm/publish-chart.mjs
```

It lints, runs the unit tests, packages into `docs/helm-charts` and regenerates `index.yaml` from every tgz
present there, all with the website URL. Then the closing checklist as usual: commit `docs/helm-charts`
(the new tgz and the index), tag `chart/kwirth@<version>` and push. Pages publishes it with the commit.

## Testing

```
node --test deploy/helm/tests/chart.test.mjs   # unit: needs helm, no cluster
node deploy/helm/tests/run-e2e.mjs             # e2e: needs a cluster (current kube context), creates and deletes its own namespace
```

The unit tests render the chart with `helm template` and assert on values. What they cannot see is the
behaviour that depends on `lookup` (the users Secret is re-rendered from the live one on upgrade so that
passwords survive), and that is precisely what the e2e checks, together with the upgrade from chart 0.1.5.
