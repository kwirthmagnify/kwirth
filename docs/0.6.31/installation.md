# Installation
Follow these simple steps to get your kwirth running in 2 to 3 minutes.

Starting with kwirth version 0.4.63 it is available (finally!!) a 
Helm chart, so there exist currently two mechanisms:
  - Helm chart.
  - Kubernetes manifests.

## Kubernetes: deploy kwirth using HELM CHART
Using Helm is simple and very advantageous due to its simplicity for configuring and deploying Kubernetes software. These are some simple steps to deploy kwirth using Helm:

  1. Add kwirth repo to your local local Helm:
     ```
     helm repo add kwirth https://github.com/kwirthmagnify/kwirth/tree/master/deploy/helm
     ```
  2. Install kwirth on your cluster:
     ```
     helm install kwirth kwirth/kwirth -n kwirth --create-namespace
     ```
     This command installs kwirth on namespace 'kwirth' (and creates it if needed) using default kwirth options.

Now you can publish your kwirth to outside your cluster by adding an Ingress as we explain below.

Installation can be tailored by changing some kwirth installation options:

| Option             | Description | Type | Value  |Default value |
| -                  | -           | -    |-       |-             |
| channelMetrics     | Enables/Disables Metrics channel | string | true/false  | true  |
| channelMagnify     | Enables/Disables Magnify channel | string | true/false  | true  |
| rootpath           | It's the path where kwirth will be served | string | any URL Path | /kwirth  |
| masterkey          | It's the key used to sign the access keys sent to clients | string | any string | Kwirth4Ever  |
| image              | A full image reference | string | A valid reference | kwirthmagnify/kwirth:latest |
| resources          | Pod resources in Kubernetes-like format | object | {}  | { limits: { cpu:1, memory:2Gi }, requests: {cpu:0, memory:256Mi } }|
| ingress.enabled    | Set to true if you want to deploy an Ingress | boolean | true/false  | false |
| ingress.controller | Specify what Ingress ctroller you are using | string | nginx / agic  | nginx |
| agic.privateip     | Associate AGIC listener to private frontend IP | boolean | true/false | false |
| nginx.tls          | States that TLS should be used in ingress | boolean | true/false | false |
| nginx.secret       | Name of the secret holding the CRT and the KEY | string | - | - |
| ingress.hostname   | Name of the host in ithe Ingress | string | - | - |
| store              | Storage backend: `etcd` (K8s Secrets/ConfigMaps) or a filesystem path | string | `etcd` / `/mnt/data` | etcd |

?> Log, Ops, Trivy, Fileman, Echo and other observability capabilities are now loaded as **plugins**. Use the plugin management UI or `kwirth-dev.json` to install them — no Helm option is needed.


A sample 'values.yaml' file could be:

```yaml
kwirth:
  config:
    channelMetrics: "true"
    channelMagnify: "true"
    rootpath: /kwirth
  image: kwirthmagnify/kwirth:0.6.31
```

That could be installed like this:
```
helm repo install kwirth kwirth/kwirth -n kwirth --create-namespace -f values.yaml
```

## Kubernetes: deploy kwirth using MANIFESTS
If you want an express setup of kwirth, do not loose your time, just type-in this kubectl in your console:

```yaml
kubectl apply -f https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/test/kwirth.yaml
```

If you need to change default kwirth configuration you may need to edit the YAML files in order to customize the deployment.

### Least-privilege manifests

The express manifest above gives kwirth broad permissions on the cluster, because it is meant to get you running in two minutes with every feature working. If your cluster has a security review, or you only want kwirth for observing and never for acting, there are two alternatives in [`deploy/kubernetes/manifests`](https://github.com/kwirthmagnify/kwirth/tree/master/deploy/kubernetes/manifests). Each is a single file you apply exactly like the one above.

| Manifest | Cluster permission | Writes | Metrics |
| - | - | - | - |
| `kwirth.yaml` | `resources: ['*']`, `verbs: ['*']` on 12 API groups | everything | yes |
| `kwirth-readonly.yaml` | `get`, `list`, `watch` on everything | one: a token for its own ServiceAccount | yes |
| `kwirth-full-ro.yaml` | `get`, `list`, `watch` on everything | none at all | no |

```
kubectl apply -f https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/deploy/kubernetes/manifests/kwirth-readonly.yaml
```

**What they give up.** Both drop every verb that changes the cluster, so the Magnify channel's commands — restart, scale, cordon, drain, evict, apply, delete — and the `ops` and `fileman` plugins stop working: the button is still in the UI and the API server answers 403. If you do not want buttons that cannot work, do not install those two plugins.

**They keep their configuration on a PersistentVolumeClaim**, not in Secrets and ConfigMaps, which is what removes the write permission. That is the `KWIRTH_STORE` mechanism described in the next section, already wired in both files. Two consequences worth knowing before you apply them:

- `MASTERKEY` becomes the key your configuration is encrypted with. Set it once, before the first boot, and never change it — see the warning in the next section.
- The first boot creates the admin user as `admin` / `password`, in the volume. Change it immediately.

**Which of the two.** `kwirth-readonly.yaml` can mint a token for its own ServiceAccount, scoped by name so it cannot mint one for anything else, and that token is how the metrics provider reaches each node's kubelet. `kwirth-full-ro.yaml` removes that one permission, and with it the kubelet metrics: the metrics channel, and the alert, pinocchio, spectrum and agora plugins, lose their feed, and kwirth says so at startup instead of failing. The PodMetrics and NodeMetrics entries of the Magnify tree still work in both, because those come from metrics-server through the API server and need no token.

**One thing they do allow: reading Secrets.** Both grant read on every resource, Secrets included. Kubernetes RBAC has no deny rules and no way to express "every group except this one", so a role cannot both cover the CustomResourceDefinitions kwirth watches — which differ from cluster to cluster and cannot be known in advance — and leave Secrets out. If your requirement is that Secrets stay unreadable, each file carries an enumerated alternative, commented in its header, that you can paste over the single rule; its cost is that events from CustomResourceDefinitions will not arrive.

## Storage configuration

By default, kwirth running in Kubernetes stores all its configuration data (users, API keys, plugin settings, AI providers, etc.) in **Kubernetes Secrets and ConfigMaps** inside the same namespace. This is the recommended approach for most clusters.

> This section covers **configuration** storage, which every kwirth needs. Extensions that accumulate *data* — histories, findings, audit trails — use a relational database instead, which is a separate and optional piece. The [Persistence](persistence) page explains both models side by side, and how to deploy and configure the database.

However, some environments restrict Secret/ConfigMap write access, or you may prefer to keep all kwirth data in a mounted volume (e.g. a PersistentVolumeClaim). In that case you can switch the storage backend using the `KWIRTH_STORE` environment variable.

| Value | Behaviour |
| - | - |
| unset or `etcd` | Default. Uses Kubernetes Secrets and ConfigMaps (etcd-backed). |
| any filesystem path | Uses the local filesystem under the given path. Secrets go to `<path>/secrets/`, ConfigMaps to `<path>/configmaps/`. |

> **Note**: this setting only affects Kubernetes mode. Desktop mode always uses `~/.kwirth/`, and Docker mode uses its own volume mounts.

> **Security**: when kwirth uses filesystem storage (desktop or `KWIRTH_STORE` path), sensitive data (secrets) is encrypted at rest with AES-256-GCM using a key derived from `MASTERKEY`. Non-sensitive data (config maps) is stored as plain JSON. If you change `MASTERKEY` after first run, existing secret files will become unreadable.

### Example: store kwirth data in a PersistentVolumeClaim

1. Create a PVC (or use an existing one):

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: kwirth-data
  namespace: kwirth
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

2. Mount the PVC in the kwirth Deployment and set `KWIRTH_STORE`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kwirth
  namespace: kwirth
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kwirth
  template:
    metadata:
      labels:
        app: kwirth
    spec:
      serviceAccount: kwirth-sa
      containers:
        - name: kwirth
          image: kwirthmagnify/kwirth:latest
          env:
            - name: KWIRTH_STORE
              value: /mnt/kwirth-data
          volumeMounts:
            - name: kwirth-data
              mountPath: /mnt/kwirth-data
          ports:
            - containerPort: 3883
      volumes:
        - name: kwirth-data
          persistentVolumeClaim:
            claimName: kwirth-data
```

With this setup, all kwirth configuration is persisted in the PVC and survives pod restarts without needing permissions to write Secrets or ConfigMaps in the cluster.

> **Helm**: pass `--set store=/mnt/kwirth-data` together with the appropriate `volumes`/`volumeMounts` values, or configure them in your `values.yaml`.

## Docker: kwirth in your local docker environment
To run kwirth as a Docker container, mount your kubeconfig so kwirth can reach your cluster, **and mount
a directory for its store** — without it, everything kwirth remembers dies with the container:

```bash
docker run -d -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v ~/.kwirth:/data \
  -e CONFIGMAPPATH=/data \
  -e SECRETPATH=/data \
  --name kwirth kwirthmagnify/kwirth:latest
```

`CONFIGMAPPATH` and `SECRETPATH` both default to `.`, which inside the image is the container's own
writable layer. It works perfectly until you `docker rm` the container, and then your users, API keys and
installed extensions are gone. Note also that **in Docker mode secrets are written as plain JSON**, so
whatever directory you mount for `SECRETPATH` holds passwords and tokens in the clear — see
[Persistence](persistence).

The kubeconfig is optional. Without it kwirth still starts and serves the front, reporting its cluster
type as `none`: autonomous channels run, ingestion providers receive, and you can federate against
another kwirth. A kubeconfig pointing at `127.0.0.1` will not work as is, because inside the container
that address is the container itself.

More detail, including the Windows form of the command and what each script in the repository does, is in
the [`docker/` folder](https://github.com/kwirthmagnify/kwirth/tree/master/docker).

## ECS: kwirth as an AWS task

kwirth runs as an ECS task on **Fargate** or **EC2**, with the same image — there is no ECS-specific
build. It recognises ECS by the metadata variable the ECS agent injects in both launch types, so nothing
has to be declared for the environment to be detected.

What changes is not the image, it is what the platform stops giving you. Kubernetes hands kwirth a
namespace to keep its state in and an identity; ECS hands neither, so both are configuration:

- **`KWIRTH_STORE` pointing at an EFS mount.** Without it kwirth starts and warns, but its store lives on
  a disk that dies with the task — users, API keys and installed extensions included.
- **`MASTERKEY` through `secrets[]`**, not `environment[]`. It derives the encryption key for secrets at
  rest, and **changing it later makes everything already written unreadable**; there is no migration.
- **A health check on `/healthz`.** kwirth answers it in every environment. A target group checking
  something else recycles the task forever without saying why.

If some of your extensions persist to SQL, that is a separate and **optional** decision — see
[Persistence](persistence). On ECS it means RDS or Aurora, and the two things that catch people out are
that the user needs `CREATEDB` (kwirth creates a database per extension, it does not take one you hand
it) and that the RDS security group must allow the **task's** security group, not a CIDR: on Fargate the
task address changes on every deployment.

What kwirth **observes** there is a separate question, and it depends only on what you mount:

- **With a kubeconfig** (`KUBECONFIG`), it observes that cluster, and the channels behave exactly as they
  do in-cluster — the connection is the same API with the kubeconfig credentials. Note that an EKS
  kubeconfig usually shells out to `aws eks get-token`, and the AWS CLI is not in the image.
- **With nothing**, it observes no infrastructure, and that is a complete configuration: the front is
  served, users log in, autonomous channels run, ingestion providers receive, and you can federate
  against another kwirth. It reports itself as cluster type `none`, which is the honest answer rather
  than claiming a Kubernetes that is not there.

kwirth prints what it found at startup, and that log is the first thing to read when a deployment does
not behave:

```
Execution environment: 'ecs'
Execution environment capabilities:
  Kubernetes API: no (no usable kubeconfig), so cluster events, metrics and resources are not available
  Store: encrypted files at '/data/kwirth' (KWIRTH_STORE)
```

Ready-to-use task definitions, a CloudFormation template for the surrounding resources (EFS, security
groups, target group, IAM roles) and a FireLens example live in the
[`deploy/ecs/` folder](https://github.com/kwirthmagnify/kwirth/tree/master/deploy/ecs) of the repository.

> kwirth does **not** manage ECS tasks or containers as if they were a cluster. To get the log of your
> other tasks, ship it in through an ingestion provider.

## Cloud Run and Azure Container Instances

The same image also runs on **Google Cloud Run** and on **Azure Container Instances (ACI)**, again with
nothing declared for the environment to be detected:

- **Cloud Run** is recognised by `K_SERVICE`, which Cloud Run always sets. kwirth listens on the port in
  `PORT`, so it answers wherever Cloud Run sends the traffic (8080 by default) without configuring it.
- **ACI** sets no variable of its own, so kwirth asks Azure: at startup it calls the managed-identity
  endpoint (`169.254.169.254`, at most one second, and only when nothing cheaper matched). An answer from
  Azure — a token, or Azure's own "no identity assigned" error — means ACI.

Everything said above for ECS about what the platform does **not** give you applies to both: point
`KWIRTH_STORE` at a mounted volume (Cloud Storage or NFS on Cloud Run, **Azure Files** on ACI) or the
store dies with the instance; pass `MASTERKEY` as a secret; and health-check `/healthz`. Both report the
cluster type as `none` unless you mount a kubeconfig. The startup log says which one was found:

```
Execution environment: 'cloudrun'        (or 'aci')
```

Two things are particular to each:

- **Cloud Run must run a single instance** (`minScale` and `maxScale` 1) with **CPU always allocated**: the
  store is a set of files that two Kwirths must not write at once, and Kwirth works between requests.
- **ACI needs a managed identity** on the container group. It is how Kwirth recognises ACI at startup — and
  where its installation identity comes from. Without one, Kwirth may not recognise the environment and
  refuse to start.

Ready-to-use files, with the commands to create what they need (bucket and secret, storage account and
file share), live in [`deploy/cloudrun/`](https://github.com/kwirthmagnify/kwirth/tree/master/deploy/cloudrun)
and [`deploy/aci/`](https://github.com/kwirthmagnify/kwirth/tree/master/deploy/aci). They have not yet been
deployed on a real project or subscription: if something there does not work, it is a bug in the example.

### Installation identity without Kubernetes

Inside a cluster, kwirth identifies itself by the uid of the `kube-system` namespace, and extensions use
that id to keep their data apart ("per cluster"). Without Kubernetes there is no such namespace, so on ECS,
Cloud Run, ACI or a bare container kwirth builds the id from what the platform already knows — **nothing to
configure**:

| Where | Installation id | Taken from |
|---|---|---|
| ECS | `aws:ecs:<account>:<region>:<cluster>:<task family>` | the task metadata endpoint |
| Cloud Run | `gcp:run:<project>:<region>:<service>` | the GCP metadata server |
| ACI | `azure:aci:<subscription>:<resource group>:<container group>` | the container group's **managed identity** |
| anywhere else | `uuid:<uuid>` | generated once and kept in kwirth's store |

Each part stays the same when the task is recycled, an instance is replaced or a new revision is deployed,
so the id is stable for the life of the deployment. The startup log prints it, with a readable name that is
also the title of the front:

```
Installation identity: 'aws:ecs:123456789012:eu-west-1:prod:kwirth' (name 'ecs/prod/kwirth', from ecs)
```

Things worth knowing:

- **Renaming changes the id.** A new ECS cluster or task family name, a renamed Cloud Run service or a new
  container group is a new installation as far as extensions are concerned: what they stored under the old
  id stays there.
- **ACI needs a managed identity** for its id (and, as said above, to be recognised at all). Should kwirth
  start without one, it falls back to a generated `uuid:` id.
- **A generated `uuid:` id lives in the store.** If `KWIRTH_STORE` is not a mounted volume, every new
  instance gets a new id; kwirth warns about it at startup.
- If a platform source cannot be read, kwirth does not stop: it uses a generated id and logs why.

## External: launch kwirth locally (without docker)
First install kwirth:
```sh
$ npm i -g @kwirthmagnify/kwirth-external
```

Once installed (globally with '-g' option) just launch it to check if everything is OK:
```sh
$ kwirth-external --version
```

### Command Line options
If you enter 'kwirth-external --help' you should see an explanation with all the options of kwirth External:

```sh
$ kwirth-external --help 
Usage:
  $ kwirth-external

Commands:
  start   Start server
  apikey  Create an API Key

For more info, run any command with the `--help` flag:
  $ kwirth-external start --help
  $ kwirth-external --help
  $ kwirth-external apikey --help

Options:
  -c, --context <string>          Context to load (default: )
  -k, --apiKey                    Context to load (default: false)
  -p, --port <number>             Server port (default: 3883)
  -r, --rootpath <string>         Root path (default: )
  -k, --masterkey <string>        Master key (default: Kwirth4Ever)
  -t, --front                     Enable front SPA serving (default: false)
  -f, --forward                   FORWARD feature (default: false)
  -i, --metricsinterval <number>  Seconds between metrics (default: 15)
  -cl, --channellog               Channel LOG (default: true)
  -cm, --channelmetrics           Channel METRICS (default: true)
  -ca, --channelalert             Channel ALERT (default: true)
  -ce, --channelecho              Channel ECHO (default: true)
  -co, --channelops               Channel OPS (default: true)
  -ct, --channeltrivy             Channel TRIVY (default: true)
  -cy, --channelmagnify           Channel MAGNIFY (default: true)
  -cp, --channelpinocchio         Channel PINOCCHIO (default: true)
  -v, --version                   Display version number
  -h, --help                      Display this message
```

### Actions

#### Start (start)
Just start the server.

#### API Key (apikey)
Create a 1-day API Key and exit (acts like a normal command: creates teh API key, show it, end exit)


## Desktop: end-user experience
Get the Desktop experience of kwirth is simple, quick and straightforward. Just got to the [Releases page at our GitHub project](https://github.com/kwirthmagnify/kwirth/releases) and download & install the edition that best suit your needs. There are three flavours:

  - Windows application, with two options: direct download and installable setup.
  - Linux, and AppImage compatible with FUSE.
  - Mac.

# Access kwirth

## Kubernetes
The default installation of kwirth publishes kwirth access via 'http://your.dns.name/kwirth'. But you can change this behavior by publishing kwirth at any other path. Let's see a sample deploy creating (if needed) an ingress controller and creating an ingress resource.

### 1. Deploy an Ingress controller (not needed if you already have one)
There are lots of options for doing this job. You can use a managed ingress controller if you are using a managed Kubernetes cluster (like EKS, AKS, GKE...), or you can deploy your own ingress controller (even if you are using a CaaS approach for deploying your Kubernetes cluster).

We have provided detailed installation on how to install and configure different types of ingress controllers in our [**Oberkorn**](https://jfvilas.github.io/oberkorn/#/README) project.

In the [**installation section**](https://jfvilas.github.io/oberkorn/#/ingins) you can get detailed info on the simplest way to deploy:
  - Ingress Nginx
  - NGINX Ingress
  - Traefik

### 2. Create an Ingress
Once you have deployed an Ingress controller (Ingress Nginx or whatever you like), next step is to create a simple Ingress resource. This YAML code shows how to create an ingress for accessing your kwirth in this path: '/quirz'.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress-kwirth
  namespace: default
spec:
  ingressClassName: nginx
  rules:
  - host: localhost
    http:
      paths:
        - path: /quirz
          pathType: Prefix
          backend:
            service:
              name: kwirth-svc
              port:
                number: 3883
```

Now kwirth would be accessible at http://localhost/quirz (the ingress redirects requests to the kwirth service at port 3883).

### 3. Configure kwirth to be accessible
For kwirth to be served properly in the path you selected (/quirz), the kwirth pod must be aware of this situation, so you need to modify the kwirth installation to indicate which is the path. The way you can do this is by modifying an environment variable at pod deployment.

The deployment should look like this:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kwirth
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kwirth
  template:
    metadata:
      name: kwirth
      labels:
        app: kwirth
    spec:
      serviceAccount: kwirth-sa
      containers:
        - name: kwirth
          image: kwirthmagnify/kwirth:latest
          env:
            - name: ROOTPATH
              value: '/quirz'
          ports:
            - name: kwirth
              containerPort: 3883
              protocol: TCP
          resources:
            limits:
              cpu: '1'
              memory: 2Gi
            requests:
              cpu: 500m
              memory: 1Gi
```

Pay attention to the 'env' var named **ROOTPATH**. This is the only thing you need to do.

### 4. Access kwirth
So, finally, you should be able to access kwirth at: http://your.dns.name/quirz. For example, if your are working with Minikube, microK8s, k3s or any kind of local Kubernetes, you would access kwirth at:

```bash
http://localhost/quirz
```

## Docker, ECS & External
Accessing Docker, ECS and External installations is very similar to accessing a Kubernetes deployed kwirth, with the slight difference of not to access via a ingress controller. Instead, you just access kwirth at the port and path you have configured when you started the kwirth server — on ECS that means through whatever load balancer fronts the task, with `ROOTPATH` set if it routes by path.

### Docker
If your start command was something similar to:

```bash
docker run -d -p 8080:3883 \
  -v ~/.kube/config:/root/.kube/config \
  --name kwirth kwirthmagnify/kwirth:latest \
  --port 3883 \
  --rootpath /fantastic/tony
```

You just will access kwirth at `http://localhost:8080/fantastic/tony`

### External
Very similar to Docker, if you just started a kwirth External with a command like this:
```sh
kwirth-external start --front --port 8080 --rootpath /kwith/lovers
```

You should be able to access your kwirth External at `http://localhost:8080/kwirth/lovers`

## Desktop
Kwirth Desktop is the easiest to access because it has been designed with a specific interface for Desktop users (no matter they come from Windows, Linux or Mac).

When you launch kwirth Magnify, just after showing the splash screen, you will see a 'context selector' dialog where you can decide which cluster to connect to. All context will be shown, and you can filter for viewing just active ones (the ones you can connect now). Active context will refresh automatically as clusters are becoming available or unavailable (by connecting VPN's, or just changing kube API server state). The 'LOCAL' refers to all the contexts available in your local `kubeconfig` file, and REMOTE refers to clusters that can be reached through a kwirth server (no matter it be External, Docker or Kubernetes).

![local cluster selection](./_media/context-selection-local.png ':class=imageclass40')

If you want to connect to a cluster using any other type of kwirth installation (like Docker, External or Kubernetes), you can add as many clusters as you want in the 'Remote cluster' selection.

![remote cluster selection](./_media/context-selection-remote.png ':class=imageclass40')
