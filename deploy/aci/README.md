# Kwirth on Azure Container Instances

Deploy Kwirth as an ACI container group with the same image you would use anywhere else:
`kwirthmagnify/kwirth`. There is no ACI-specific build.

> ⚠️ **Not yet validated on a real Azure subscription.** Startup detection and the installation identity are
> covered by the core's tests and by a local boot test that plays ACI; this folder's files have been checked
> against the container group specification but not deployed. If something here does not work, it is a bug
> in this example — please report it.

| file | what it is |
|---|---|
| [`container-group.yaml`](container-group.yaml) | the container group: a system-assigned managed identity, the store on Azure Files, the master key as a secure variable, a public address and a health check on `/healthz` |

## The managed identity is not optional

ACI, unlike ECS or Cloud Run, sets no environment variable that says where the container runs. Kwirth
recognises ACI by asking Azure's managed-identity endpoint at startup (at most one second). With a managed
identity assigned, Azure answers with a token and Kwirth knows where it is — and builds its **installation
identity** from it: `azure:aci:<subscription>:<resource group>:<container group>`.

**Without a managed identity, Kwirth may not recognise ACI and refuse to start** (`Unsupported execution
environment`). Whether Azure's endpoint answers at all without an identity is still to be confirmed on a
real subscription; until then, keep the identity. It is granted no role: Kwirth only reads its own token.

## What you need first

Kwirth keeps its configuration (users, API keys, installed extensions) in files under `KWIRTH_STORE`.
A container group's disk dies with it, so that path must be an **Azure Files share**:

```bash
RG=kwirth
REGION=westeurope
STORAGE=kwirthstore$RANDOM          # must be globally unique, lowercase letters and digits

az group create --name $RG --location $REGION
az storage account create --resource-group $RG --name $STORAGE --location $REGION --sku Standard_LRS
az storage share-rm create --resource-group $RG --storage-account $STORAGE --name kwirth-store --quota 5
az storage account keys list --resource-group $RG --account-name $STORAGE --query '[0].value' -o tsv
```

And a master key. **Keep a copy**: losing it makes the stored secrets unreadable, and changing it later has
the same effect — there is no migration.

```bash
openssl rand -base64 32
```

## Deploy

Edit [`container-group.yaml`](container-group.yaml): `<REGION>`, `<MASTERKEY>`, `<DNS_LABEL>` (the first
part of the public name, unique in the region), `<STORAGE_ACCOUNT>` and `<STORAGE_ACCOUNT_KEY>`. Then:

```bash
az container create --resource-group $RG --file deploy/aci/container-group.yaml
az container show --resource-group $RG --name kwirth --query ipAddress.fqdn -o tsv
```

Kwirth is at `http://<fqdn>:3883/front`; the first login is `admin` / `password` — change it. ACI gives no
TLS: for anything beyond a test, put it behind an Application Gateway or Front Door.

## What to expect in the log

```bash
az container logs --resource-group $RG --name kwirth
```

```
Execution environment: 'aci'
Execution environment capabilities — Kubernetes API: no (no usable kubeconfig), ... · Store: encrypted files at '/data/kwirth' (KWIRTH_STORE)
Installation identity: 'azure:aci:<subscription>:<resource group>:kwirth' (name 'aci/kwirth', from azure-mi)
```

The **installation identity** stays the same while the container group exists, through restarts. Extensions
use it to keep their data apart; a container group with a different name, or in another resource group, is
a new installation for them. Resource ids are case-insensitive in Azure, so Kwirth lower-cases them.

## What Kwirth observes from here

Nothing by default, and that is a complete configuration: the front, users, autonomous channels and
ingestion providers all work, and the cluster type is reported as `none`. To observe a Kubernetes cluster
(AKS or any other), mount a kubeconfig and point `KUBECONFIG` at it — note that an AKS kubeconfig that uses
Entra ID calls `kubelogin`, which is not in the image.

## The same profile, where detection cannot work

ACI, Cloud Run and ECS share one profile — a container with a mounted volume, an encrypted file store
at `KWIRTH_STORE`, and a cluster only if a kubeconfig is mounted — and differ only in **how Kwirth
recognises them**. Each has its own signal: the Azure identity endpoint here, `K_SERVICE` on Cloud Run,
the agent's metadata variable on ECS.

Where there is no such signal, ask for the profile by name with `FORCE=container`. The case that forced
it into existence is a **pod with no Kubernetes permissions at all**: the kubelet injects
`KUBERNETES_SERVICE_HOST` into every container, so taking the permissions away does not stop Kwirth
being identified as a Kubernetes workload — and inside a cluster the API is deliberately not optional,
because a failure there is an error and not a degradation. See
[`deploy/kubernetes/manifests/kwirth-zero.yaml`](../kubernetes/manifests/kwirth-zero.yaml).

You do not need it here: this container group is detected on its own.
