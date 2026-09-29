# Kwirth on AWS ECS

Deploy Kwirth as an ECS task, on **Fargate** or on **EC2**, with the same image you would use anywhere
else: `kwirthmagnify/kwirth`. There is no ECS-specific build.

What is in this folder:

| file | what it is |
|---|---|
| [`task-definition-minimal.json`](task-definition-minimal.json) | the smallest thing that runs. Nothing persists. Start here to see it come up |
| [`task-definition-fargate.json`](task-definition-fargate.json) | the real one: EFS for storage, Secrets Manager for the master key, behind a load balancer |
| [`task-definition-ec2.json`](task-definition-ec2.json) | the same on the EC2 launch type, and with a **kubeconfig mounted** so Kwirth observes a cluster |
| [`cloudformation.yaml`](cloudformation.yaml) | everything around the task: EFS, security groups, target group, IAM roles |
| [`firelens-sidecar.json`](firelens-sidecar.json) | how **another** task ships its log into this Kwirth |

## Choosing which Kwirth you run

Every example here says `kwirthmagnify/kwirth:latest`. That is the right thing for a first try and the
wrong thing for anything you keep:

| tag | what it is | when |
|---|---|---|
| `0.5.228` (any released version) | that exact build, forever | **production.** You decide when to move |
| `latest` | whatever was released last | trying it out, demos |
| `develop` | the development build | testing something unreleased. Do not run it for real |

The tag lives in `image` inside the container definition:

```json
"image": "kwirthmagnify/kwirth:0.5.228"
```

In [`cloudformation.yaml`](cloudformation.yaml) it is the `ImageTag` parameter instead, so you move
versions by updating the stack rather than by editing the template.

**Pin it.** A task definition is a versioned, immutable object — that is most of its value. Leaving
`latest` in it throws that away: two tasks from the same revision can end up running different builds
depending on when each one pulled, and a rollback to the previous revision does not roll back the image.

> ECS does not re-pull on its own either: with `latest` a task keeps whatever the host cached until
> something forces a new pull. Pinning makes the deployment say out loud what it runs.

## What Kwirth observes when it runs here

ECS is where Kwirth *runs*. What it *observes* is a separate question, and the answer depends only on
what you give it:

- **Mount a kubeconfig** and Kwirth observes that Kubernetes cluster. Channels behave exactly as they do
  for an in-cluster Kwirth — the connection is the same Kubernetes API, using the kubeconfig
  credentials, and that is transparent to them.
- **Mount nothing** and Kwirth observes no infrastructure. This is a complete configuration, not a
  half-started one: the front is served, users log in, autonomous channels work, ingestion providers
  receive data, and you can federate against another Kwirth from the cluster list.

> Kwirth does **not** manage ECS tasks or containers as if they were a cluster. If you want the log of
> your other ECS tasks, ship it in — see [FireLens](#shipping-log-from-other-tasks) below.

At startup Kwirth prints what it found, and that log is the first thing to read when something looks
wrong:

```
Execution environment: 'ecs'
Execution environment capabilities:
  Kubernetes API: no (no usable kubeconfig), so cluster events, metrics and resources are not available
  Store: encrypted files at '/data/kwirth' (KWIRTH_STORE)
```

## The part that actually matters: configuration

Kubernetes gives Kwirth a namespace to store things in and an identity. ECS gives neither, so you supply
both.

### Storage — the one that bites

Kwirth keeps users, API keys, settings and installed extensions in its store. Outside Kubernetes that
store is **files on disk**, and an ECS task's disk does not survive the task.

**Set `KWIRTH_STORE` to a path backed by an EFS volume.** Without it Kwirth still starts — and warns you
in the log — but everything is gone the next time the task is recycled: your users, your API keys, the
extensions you installed.

```
Store: encrypted files at the default path. WARNING: no KWIRTH_STORE set, so nothing will survive
a task recycle unless that path is a mounted volume
```

### MASTERKEY — set it, and never change it

Secrets in a file store are encrypted with AES-256-GCM using a key derived from `MASTERKEY`. Two
consequences:

1. Leave it at its default and your secrets are encrypted with a key everyone knows. Set it, and pass it
   through `secrets[]` from Secrets Manager or SSM — not through `environment[]`, which shows up in the
   console and in `describe-task-definition`.
2. **Changing it later makes every secret already written unreadable.** There is no migration. Decide it
   once, before the first run.

### Health check

Kwirth answers `GET /healthz` with `200`. A target group with no health check configured, or one
pointing somewhere else, will keep cycling the task without telling you why.

### Everything else

| variable | what it does | note for ECS |
|---|---|---|
| `KWIRTH_STORE` | where the store lives | **point it at the EFS mount** |
| `MASTERKEY` | derives the encryption key for secrets | via `secrets[]`, never `environment[]` |
| `KWIRTH_CLUSTER_NAME` | the name Kwirth shows for itself | otherwise it calls itself `inEcs` |
| `PORT` | listening port (default `3883`) | with `awsvpc` the host port is the same |
| `ROOTPATH` | path prefix, if Kwirth hangs off a subpath | needed when the load balancer routes by path |
| `KUBECONFIG` | path to the kubeconfig | only if you want it to observe a cluster |
| `FORCE` | override the environment detection | **not needed**: the ECS agent's own metadata variable is what identifies ECS, in both launch types |
| `BODYLIMIT` | max request body (default `8mb`) | raise it if a log collector batches large payloads |
| `KEEPALIVE` | idle connection timeout in ms (default `65000`) | lower than the load balancer's idle timeout causes resets |

## Observing a Kubernetes cluster from here

Put a kubeconfig where the task can read it and point `KUBECONFIG` at it. The EC2 example does exactly
that, reusing the same EFS volume:

```json
{ "name": "KUBECONFIG", "value": "/data/kwirth/kubeconfig/config" }
```

If the kubeconfig names a cluster, Kwirth uses it and says so at startup:

```
Kubernetes API: yes (a kubeconfig with a selected cluster was found)
```

From that point everything behaves as it does for an in-cluster Kwirth. Note that the check is
**passive**: Kwirth looks for a selected cluster in the kubeconfig, it does not call the API to prove it
answers. That is deliberate — probing would put a network timeout in the startup path and would downgrade
a slow cluster to "no Kubernetes", which is a far worse diagnosis than a clear error on first use.

An EKS kubeconfig usually shells out to `aws eks get-token`, and **the AWS CLI is not in the Kwirth
image**. Either write a kubeconfig with a long-lived token, or bake the CLI into your own image.

## Fargate or EC2

For Kwirth itself, **it makes no difference**. Neither launch type changes what it can observe, so pick
by the reasons you would pick for any other service: EC2 if you already run instances and want the
density, Fargate if you would rather not have instances at all.

The examples differ only in `requiresCompatibilities` and in where CPU and memory are declared — on
Fargate at task level, on EC2 at container level.

## Shipping log from other tasks

A Kwirth that observes no cluster is still a place to send things. The route in ECS is **FireLens**: add
a Fluent Bit sidecar to the task whose log you want, and point it at Kwirth's `fluentbit` ingestion
provider. See [`firelens-sidecar.json`](firelens-sidecar.json).

Two things to get right, and both are in the provider's own README:

- The ingestion route is mounted **without** an access key, so anyone who can reach it can inject log.
  **Set a credential** (`ingestToken` with bearer auth, or basic auth) — the provider warns at startup if
  you do not, but it will not stop you.
- Fluent Bit batches records, so a single POST can be large. If you see `413`, raise `BODYLIMIT`.

OTLP works the same way through the `otel` provider, with one caveat: it reads **JSON only**, and answers
`415` to protobuf.

## Getting in

The admin user is created on first start with a default password. **Change it before exposing the task**,
and remember that if you did not set `KWIRTH_STORE` that change disappears with the task.
