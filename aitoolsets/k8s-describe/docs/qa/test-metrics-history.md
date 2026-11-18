# k8s-describe (AI toolset) — test metrics history

> **Incremental** record of the toolset's suite, one row per **release**. A row is **added** on top at each release;
> nothing is overwritten. It starts at 0.2.1: earlier versions had no history.
>
> The two PNGs next to this file are regenerated from it: coverage over time (`test-metrics-coverage.png`) and suite
> size (`test-metrics-tests.png`).
>
> **How each figure is obtained:**
> - **Harness** = the tests `npm test` (`node --test`) reports in `aitoolsets/k8s-describe/`, against the built `dist`
>   and with FAKE Kubernetes clients (no cluster). Build before measuring.
> - **Coverage** = **c8** over `dist/back.js` (`npx c8 node --test tests/*.test.mjs`). Never Node's own coverage.
> - **e2e** = `0 / 0`: the toolset has no UI; its consumers' QA exercises it against a real cluster.

| Date | Version / tag | Harness | Coverage (lines / branches / funcs) | e2e (specs / cases) | Notes |
|---|---|---|---|---|---|
| 2026-11-18 | `aitoolset/k8s-describe@0.2.1` | **21** (+1) | 86.63% / 69.46% / 78.78% (c8, `dist/back.js`) | 0 / 0 | **`get_rollout_history` says which code each revision ran**: its `source` (repo + revision) from the standard OCI annotations of the revision's pod template (`org.opencontainers.image.source` / `.revision`, backed by `kwirth.io/source-repo` / `source-ref`), the same `describe_pod` reads from the running pod — now one shared helper. Before, a regression that came in with a deploy had no previous commit to compare against: only the source of the pod running now. +1 test (OCI keys, the kwirth.io fallback, no annotations = no source). Validated in a consumer's QA against a real cluster: the bot compared the two revisions of a deployment and named the commit that broke it |
