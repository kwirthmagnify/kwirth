# Trivy Provider

A Kwirth **provider** that watches the Kubernetes CRDs written by
[Trivy Operator](https://github.com/aquasecurity/trivy-operator) and streams each security report to
the channels that asked for it.

It reports facts and nothing else: no severity policy, no thresholds, no alerting. What a finding
*means* belongs to whatever subscribes.

Part of [Kwirth](https://kwirthmagnify.dev) — real-time Kubernetes observability.

## Requirements

**Trivy Operator must already be installed in the cluster.** This provider does not scan anything
and does not install it: it reads the reports Trivy Operator produces. Without it there is simply
nothing to watch.

It also expects the standard installation layout to read the Trivy version — namespace
`trivy-system`, configmap `trivy-operator-trivy-config`, deployment `trivy-operator`. A
non-standard install still delivers reports; only the version metadata goes missing.

## Install

From the Kwirth extension manager, or directly:

```
https://registry.npmjs.org/@kwirthmagnify/kwirth-provider-trivy/-/kwirth-provider-trivy-<version>.tgz
```

It exposes no HTTP router and needs no core restart.

## What it watches

Every report type Trivy Operator produces, in `aquasecurity.github.io/v1alpha1`:

| Plural | What it carries |
|---|---|
| `vulnerabilityreports` | CVEs found in a container image |
| `configauditreports` | workload misconfiguration checks |
| `sbomreports` | the image's bill of materials |
| `exposedsecretreports` | secrets found inside an image |
| `rbacassessmentreports` | RBAC findings on Roles / RoleBindings (namespaced) |
| `clusterrbacassessmentreports` | the same for ClusterRoles / ClusterRoleBindings |

## How a channel subscribes

The only provider-level filter is **which report types you want**:

```ts
{
  reportTypes: ['vulnerabilityreports', 'exposedsecretreports']
}
```

The provider then forwards **every** report of those types, from the whole cluster. Narrowing down
to a given pod or container is the subscriber's job, deliberately: this provider is neither cluster-
nor resource-scoped, and filtering here would hide from one channel what another one needs.

## What a subscriber receives

Two kinds of event. A **report** event carries no `eventKind` — it is the default:

```ts
{
  namespace: 'shop',
  podName: 'api-5f2',
  containerName: 'api',
  plural: 'vulnerabilityreports',
  event: 'add',          // add | update | delete
  report: { ... }        // the CRD object as Trivy wrote it
}
```

A **meta** event (`eventKind: 'meta'`) carries the cluster's Trivy version — the scanner tag and the
operator version. It matters more than it looks: the scanner tag governs which checks exist, so two
clusters on different versions are not reporting the same catalogue, and a consumer comparing them
without knowing that is comparing two different things.

On subscription the provider replays the current reports as `add` events, so a channel that starts
late still sees the existing state instead of waiting for the next change.

## Development

```
npm install
npm run build      # writes dist/
npm test
```

The build produces `dist/`, which is what gets published.
