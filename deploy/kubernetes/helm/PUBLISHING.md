# Kwirth Helm chart: source, versioning and publishing

**This page is for releasing the chart.** To *use* it — installing, the three modes and every value —
see [README.md](README.md), which is also what is packaged inside the tgz.

This folder is the **source** of the chart. What users install comes from the repository at
`https://kwirthmagnify.dev/helm-charts`, which is nothing more than the `docs/helm-charts` folder of this
repo served by GitHub Pages (`docs/` is the website root, `CNAME` = `kwirthmagnify.dev`).

```
deploy/kubernetes/helm/
├── README.md           the user-facing reference; publish-chart.mjs COPIES it into the chart
├── PUBLISHING.md       this page
├── kwirth/             the chart (ONE source; the version lives in Chart.yaml)
│   ├── Chart.yaml
│   ├── values.yaml
│   ├── README.md       the copy that travels inside the tgz — do not edit, edit the one above
│   └── templates/
├── tests/
│   ├── chart.test.mjs  unit tests: helm template + assertions (no cluster needed)
│   └── run-e2e.mjs     e2e against the current kube context: install, upgrade, uninstall, and the migration from 0.1.5
└── publish-chart.mjs   lint + tests + package + index, into docs/helm-charts
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
`appVersion`s. **The `0.1.0`…`0.1.5` folders it left behind were deleted on 2026-10-20**, once it was clear
nothing read them.

**Where a published version's source is**, now that there are no per-version folders:

```bash
git show chart/kwirth@0.2.0:deploy/kubernetes/helm/kwirth/values.yaml   # one file
git checkout chart/kwirth@0.3.0 -- deploy/kubernetes/helm/kwirth        # the whole chart as it shipped
tar -xzf docs/helm-charts/kwirth-0.3.0.tgz                              # or straight from what was published
```

⚠️ **Two gaps, and they are worth knowing before you go looking.** Nothing before `0.2.0` is tagged — for
those versions the record is the published tgz and the deletion commit. And `0.3.1` and `0.3.2` were never
published: `0.3.1` is only a bump inside a commit, `0.3.2` never had a commit of its own, so there is no tag
and no tgz for either. Their changes went out with `0.3.3`.

## Publishing

```
node deploy/kubernetes/helm/publish-chart.mjs
```

It lints, runs the unit tests, packages into `docs/helm-charts` and regenerates `index.yaml` from every tgz
present there, all with the website URL. Then the closing checklist as usual: commit `docs/helm-charts`
(the new tgz and the index), tag `chart/kwirth@<version>` and push. Pages publishes it with the commit.

## Testing

```
node --test deploy/kubernetes/helm/tests/chart.test.mjs   # unit: needs helm, no cluster
node deploy/kubernetes/helm/tests/run-e2e.mjs             # e2e: needs a cluster (current kube context), creates and deletes its own namespace
```

The unit tests render the chart with `helm template` and assert on values. What they cannot see is the
behaviour that depends on `lookup` (the users Secret is re-rendered from the live one on upgrade so that
passwords survive), and that is precisely what the e2e checks, together with the upgrade from chart 0.1.5.
