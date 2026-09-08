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
  image: kwirthmagnify/kwirth:0.5.287
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

## Storage configuration

By default, kwirth running in Kubernetes stores all its configuration data (users, API keys, plugin settings, AI providers, etc.) in **Kubernetes Secrets and ConfigMaps** inside the same namespace. This is the recommended approach for most clusters.

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
To run kwirth as a Docker container, you can use the following command, ensuring you mount your kubeconfig file so kwirth can interact with your cluster:

```bash
docker run -d -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config \
  --name kwirth kwirthmagnify/kwirth:latest
```

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

## Docker & External
Accessing Docker and External installations is very similar to accessing a Kubernetes deployed kwirth, with the slight difference of not to access via a ingress controller. Instead, you just access kwirth at the port and path you have configured when you started the kwirth server:

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
