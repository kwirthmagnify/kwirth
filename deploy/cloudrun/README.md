# Kwirth on Google Cloud Run

Deploy Kwirth as a Cloud Run service with the same image you would use anywhere else:
`kwirthmagnify/kwirth`. There is no Cloud Run-specific build, and nothing to declare for Kwirth to know
where it is: it recognises Cloud Run by `K_SERVICE` and listens on the port Cloud Run gives it in `PORT`.

> ⚠️ **Not yet validated on a real Cloud Run project.** Startup detection and the installation identity are
> covered by the core's tests and by a local boot test that plays Cloud Run; this folder's files have been
> checked against Cloud Run's specification but not deployed. If something here does not work, it is a bug
> in this example — please report it.

| file | what it is |
|---|---|
| [`service.yaml`](service.yaml) | the service: one instance, CPU always on, the store in a Cloud Storage bucket, the master key from Secret Manager, health checks on `/healthz` |

## What you need first

Kwirth keeps its configuration (users, API keys, installed extensions) in files under `KWIRTH_STORE`.
On Cloud Run the container's disk dies with the instance, so that path must be a **mounted bucket**:

```bash
PROJECT=<PROJECT_ID>
REGION=europe-west1

# 1. A bucket for Kwirth's store
gcloud storage buckets create gs://$PROJECT-kwirth-store --location=$REGION --uniform-bucket-level-access

# 2. The master key, in Secret Manager. Keep a copy: losing it makes the stored secrets unreadable,
#    and changing it later has the same effect — there is no migration.
openssl rand -base64 32 | gcloud secrets create kwirth-masterkey --data-file=-

# 3. A service account for the service, allowed to use both
gcloud iam service-accounts create kwirth
SA=kwirth@$PROJECT.iam.gserviceaccount.com
gcloud storage buckets add-iam-policy-binding gs://$PROJECT-kwirth-store --member=serviceAccount:$SA --role=roles/storage.objectUser
gcloud secrets add-iam-policy-binding kwirth-masterkey --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
```

## Deploy

Edit [`service.yaml`](service.yaml): set `<SERVICE_ACCOUNT>` (here `kwirth`), `<PROJECT_ID>` and
`<BUCKET_NAME>` (here `<PROJECT_ID>-kwirth-store`). Then:

```bash
gcloud run services replace deploy/cloudrun/service.yaml --region $REGION
# public access (or front it with IAP instead):
gcloud run services add-iam-policy-binding kwirth --region $REGION --member=allUsers --role=roles/run.invoker
```

The URL is in the output of `gcloud run services describe kwirth --region $REGION --format='value(status.url)'`.
Kwirth's front is at `<URL>/front`; the first login is `admin` / `password` — change it.

## What to expect in the log

```
Execution environment: 'cloudrun'
Execution environment capabilities — Kubernetes API: no (no usable kubeconfig), ... · Store: encrypted files at '/data/kwirth' (KWIRTH_STORE)
Installation identity: 'gcp:run:<project>:<region>:kwirth' (name 'run/kwirth', from cloudrun)
Server is listening on port 8080
```

The **installation identity** is taken from the GCP metadata server and the service name, so it does not
change when a new revision is deployed. Extensions use it to keep their data apart; renaming the service
makes it a new installation for them.

## Why the service is configured this way

- **One instance (`minScale` = `maxScale` = 1).** The store is a set of files, and two Kwirths writing the
  same files would corrupt them. `minScale` 1 also avoids a cold start on every first visit.
- **CPU always allocated.** Kwirth works between requests — providers, timers, websockets. With CPU only
  during requests, that work would freeze.
- **`timeoutSeconds: 3600`.** On Cloud Run a websocket is a request, and 60 minutes is the maximum; the front
  reconnects by itself when it is cut.
- **A Cloud Storage bucket for the store** (second-generation runtime). It holds small JSON files well. If you
  prefer a real file system, a Filestore (NFS) volume works the same way: mount it at `/data`.

## What Kwirth observes from here

Nothing by default, and that is a complete configuration: the front, users, autonomous channels and
ingestion providers all work, and the cluster type is reported as `none`. To observe a Kubernetes cluster
(GKE or any other), mount a kubeconfig and point `KUBECONFIG` at it — note that a GKE kubeconfig usually
calls `gke-gcloud-auth-plugin`, which is not in the image.
