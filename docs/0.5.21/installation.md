# Installation
Follow these simple steps to get your Kwirth running in 2 to 3 minutes.

Starting with Kwirth version 0.4.63 it is available (finally!!) a 
Helm chart, so there exist currently two mechanisms:
  - Helm chart.
  - Kubernetes manifests.

## Kubernetes: deploy Kwirth using HELM CHART
Using Helm is simple and very advantageous due to its simplicity for configuring and deploying Kubernetes software. These are some simple steps to deploy Kwirth using Helm:

  1. Add Kwirth repo to your local local Helm:
     ```
     helm repo add kwirth https://github.com/jfvilas/kwirth/tree/master/deploy/helm
     ```
  2. Install Kwirth on your cluster:
     ```
     helm install kwirth kwirth/kwirth -n kwirth --create-namespace
     ```
     This command installs Kwirth on namespace 'kwirth' (and creates it if needed) using default Kwirth options.

Now you can publish your Kwirth to outside thyour cluster by adding an Ingress as we explain below.

Installation can be tailored by changing some Kwirth installation options:

| Option             | Description | Type | Value  |Default value |
| -                  | -           | -    |-       |-             |
| channelAlert       | Enables/Disables Alert channel | string | true/false  | true |
| channelEcho        | Enables/Disables Echo channel | string | true/false  | true  |
| channelFileman     | Enables/Disables Fileman channel | string | true/false  | true  |
| channelLog         | Enables/Disables Log channel | string | true/false  | true  |
| channelMetrics     | Enables/Disables Metrics channel | string | true/false  | true  |
| channelOps         | Enables/Disables Ops channel | string | true/false  | true  |
| channelTrivy       | Enables/Disables Trivy channel | string | true/false  | true  |
| rootpath           | It's the path where Kwirth will be served | string | any URL Path | /kwirth  |
| masterkey          | It's the key used to sign the access keys sent to clients | string | any string | Kwirth4Ever  |
| image              | A full image reference | string | A valid reference | kwirthmagnify/kwirth:latest |
| resources          | Pod resources in Kubernetes-like format | object | {}  | { limits: { cpu:1, memory:2Gi }, requests: {cpu:0, memory:256Mi } }|
| ingress.enabled    | Set to true if you want to deploy an Ingress | boolean | true/false  | false |
| ingress.controller | Specify what Ingress ctroller you are using | string | nginx / agic  | nginx |
| agic.privateip     | Associate AGIC listner to private fronetend IP | boolean | true/false | false |
| nginx.tls          | States that TLS should be used in ingress | boolean | true/false | false |
| nginx.secret       | Name of the secret holding the CRT and the KEY | string | - | - |
| ingress.hostname   | Name of the host in ithe Ingress | string | - | - |


A sample 'values.yaml' file could be:

```yaml
kwirth:
  config:
    channelAlert: "true"
    channelEcho: "false"
    channelFileman: "true"
    channelLog: "true"
    channelMetrics: "true"
    channelOps: "true"
    channelTrivy: "false"
    rootpath: /kwirth
  image: kwirthmagnify/kwirth:0.4.34
```

That could be installed like this:
```
helm repo install kwirth kwirth/kwirth -n kwirth --create-namespace -f values.yaml
```

## Kubernetes: deploy Kwirth using MANIFESTS
If you want an express setup of Kwirth, do not loose your time, just type-in this kubectl in your console:

```yaml
kubectl apply -f https://raw.githubusercontent.com/jfvilas/kwirth/master/test/kwirth.yaml
```

If you need to change default Kwirth configuration you may need to edit the YAML files in order to customize the deployment.

## Docker: Kwirth in your local docker environment
To run Kwirth as a Docker container, you can use the following command, ensuring you mount your kubeconfig file so Kwirth can interact with your cluster:

```bash
docker run -d -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config \
  --name kwirth kwirthmagnify/kwirth:latest
```

## External: launch Kwirth locally (without docker)
First install Kwirth:
```sh
$ npm i -g @kwirthmagnify/kwirth-external
```

Once installed (globally with '-g' optin) just launch it to check if everything is OK:
```sh
$ kwirth-external --version
```

### Command Line options
If you enter 'kwirth-external --help' you should see an explanatio with all the options of Kwirth External:

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
Get the Desktop experiencie of Kwirth is simple, quick and straightforward. Just got to the [Releases page at our GitHub project](https://github.com/jfvilas/kwirth/releases) and download & install the edition that best suit your needs. There are three flavours:

  - Windows application, with two options: direct download and installable setup.
  - Linux, and AppImage compatible with FUSE.
  - Mac.

# Access Kwirth

## Kubernetes
The default installation of Kwirth publishes Kwirth access via 'http://your.dns.name/kwirth'. But you can change this behaviour by publishing Kwirth at any other path. Let's see a sample deploy creating (if needed) an ingress controller and creating an ingress resource.

### 1. Deploy an Ingress controller (not needed if you already have one)
There are lots of options for doing this job. You can use a managed ingress controller if you are using a managed Kubernetes cluster (like EKS, AKS, GKE...), or you can deploy your own ingress controller (even if you are using a CaaS approach for deploying your Kubernetes cluster).

We have provided detailed installation on how to install and configure different types of ingress controllers in our [**Oberkorn**](https://jfvilas.github.io/oberkorn/#/README) project.

In the [**installation section**](https://jfvilas.github.io/oberkorn/#/ingins) you can get detailed info on the simplest way to deploy:
  - Ingress Nginx
  - NGINX Ingress
  - Traefik

### 2. Create an Ingress
Once you have deployed an Ingress controller (Ingress Nginx or whatever you like), next step is to create a simple Ingress resource. This YAML code shows how to create an ingress for accessing your Kwirth in this path: '/quirz'.

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

Now Kwirth would be accessible at http://localhost/quirz (the ingress redirects requests to the Kwirth service at port 3883).

### 3. Configure Kwirth to be accesible
For Kwirth to be served properly in the path you selected (/quirz), the Kwirth pod must be aware of this situation, so you need to modify the Kwirth installation to indicate which is the path. The way you can do this is by modifying an environment variable at pod deployment.

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

### 4. Access Kwirth
So, finally, you should be able to access Kwirth at: http://your.dns.name/quirz. For example, if your are working with Minikube, microK8s, k3s or any kind of local Kubernetes, you would access Kwirth at:

```bash
http://localhost/quirz
```

## Docker & External
Accessing Docker and External installations is very similar to accessing a Kubernetes deployed Kwirth, with the slight differnece of not to access via a ingress controller. Instead, you just access Kwirth at the port and path you have configured whne you started the Kwirth server:

### Docker
If your start comman dwas somethin similar to:

```bash
docker run -d -p 8080:3883 \
  -v ~/.kube/config:/root/.kube/config \
  --name kwirth kwirthmagnify/kwirth:latest \
  --port 3883 \
  --rootpath /fantastic/tony
```

You just will access Kwirth at `http://localhost:8080/fantastic/tony`

### External
Very similart to Docker, if you just started a Kwirth External with a command like this:
```sh
kwirth-external start --front --port 8080 --rootpath /kwith/lovers
```

You should be able to access your Kwirt External at `http://localhost:8080/kwirth/lovers`

## Desktop
Kwirth Desktop is the easiest to access beacause it has been designed with a specific interface for Desktop users (no matter they come from Windows, Linux or Mac).

When you launch Kwirth Magnify, just after showing the splash screen, you will see a 'context selector' dialog where you can decide which cluster to connect to. All context will be shown, and you can filter for viewing just active ones (the ones you can connect now). Active context will refresh automatically as clusters are becoming available or unavailable (by connecting VPN's, or just chaging kube API server state). The 'LOCAL' refers to all the contexts available in your local `kubeconfig` file, and REMOTE refers to clusters that can be reached through a Kwirth server (no matter it be External, Docker or Kubernetes).

![local cluster selection](https://raw.githubusercontent.com/jfvilas/kwirth/master/docs/0.5.21/_media/context-selection-local.png ':class=imageclass40')

If you want to connect to a cluster using any other type of Kwirth installation (like Docker, External or Kubernetes), you can add as many clusters as you want in the 'Remote cluster' selection.

![remote cluster selection](https://raw.githubusercontent.com/jfvilas/kwirth/master/docs/0.5.21/_media/context-selection-remote.png ':class=imageclass40')
