import fs from 'fs'
import os from 'os'
import path from 'path'
import { KubeConfig } from '@kubernetes/client-node'
import { EClusterType, EExecutionEnvironment } from '@kwirthmagnify/kwirth-common'

/*
    WHERE configuration and secrets are stored.

    There are three and not two because docker mode has always written plain JSON (DockerSecrets) while
    the rest of the file storage encrypts the secrets with MASTERKEY (NodeSecrets). Unifying them would
    change the file format for anybody who already has a Kwirth on docker, so the old format stays where
    it is and is not used for anything new: ECS and any future environment go to FILE.
*/
enum EStoreKind {
    KUBERNETES = 'kubernetes',  // the namespace's Secrets and ConfigMaps
    FILE = 'file',              // files, with the secrets encrypted with MASTERKEY (NodeSecrets)
    FILE_PLAIN = 'file-plain'   // plain JSON files (DockerSecrets), docker mode's historical format
}

/*
    WHAT this Kwirth has at hand. It is the only thing that decides behaviour: the execution environment
    says where we are running, but it is not enough on its own, because a container or an ECS task may
    bring a kubeconfig or may not, and that changes whether there is a cluster to observe.

    'reasons' is not decoration: startup prints it as it is. Whoever deploys this somewhere they cannot
    look into — an ECS task, for instance — has only the log to understand why Kwirth believes what it
    believes, and a capability with no explanation is a capability diagnosed blind.
*/
interface IEnvironmentCapabilities {
    kubernetes: boolean         // there is a Kubernetes API: events, metrics, resources, SA token
    store: EStoreKind
    storePath: string|undefined // with store FILE or FILE_PLAIN; undefined = each backend's default
    reasons: string[]
}

/*
    The check that looks at the machine, injectable. By default it is the real one; a test replaces it and
    can then ask 'what happens on Fargate with no kubeconfig' without being on Fargate.
*/
interface IEnvironmentProbes {
    kubeconfig: (context:string|undefined) => boolean
}

const isDesktopRuntime = (): boolean => {
    const versions = process.versions as Record<string, string|undefined>
    const tauri = (globalThis as { __TAURI__?: unknown }).__TAURI__
    return versions.electron !== undefined || tauri !== undefined
}

/*
    The ECS agent injects this variable on BOTH launch types (EC2 since agent version 1.39, Fargate since
    platform 1.4), so it is the canonical signal and there is no need to guess which of the two it is.
*/
const isEcsRuntime = (): boolean => process.env.ECS_CONTAINER_METADATA_URI_V4 !== undefined || process.env.ECS_CONTAINER_METADATA_URI !== undefined

/*
    Cloud Run's container runtime contract always sets K_SERVICE (the service name), so it is as canonical
    a signal as the ECS metadata variable.
*/
const isCloudRunRuntime = (): boolean => process.env.K_SERVICE !== undefined

/*
    Azure Container Instances sets NO variable of its own, so the only signal is to ask Azure: the managed
    identity token endpoint on 169.254.169.254. Two answers mean Azure:
      - 200 with a token: there is a managed identity (S2 takes the installation identity from it);
      - an Azure JSON error ('invalid_request' / 'Identity not found'): Azure, but no identity assigned.
    That IP is ALSO the metadata service of AWS EC2 and of GCP, and neither is mistaken for Azure: EC2 answers
    that path with a 404 page, and GCP refuses any request without its own 'Metadata-Flavor' header.
    One second at most, and only reached when no cheap signal matched (see detectExecutionEnvironment).
*/
const AZURE_IDENTITY_URL = 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F'
const AZURE_PROBE_TIMEOUT_MS = 1000

// 'url' and 'timeoutMs' are only overridden by tests (a local server playing Azure, EC2 or nobody).
const probeAzureIdentityEndpoint = async (url: string = AZURE_IDENTITY_URL, timeoutMs: number = AZURE_PROBE_TIMEOUT_MS): Promise<boolean> => {
    try {
        const res = await fetch(url, { headers: { Metadata: 'true' }, signal: AbortSignal.timeout(timeoutMs) })
        if (res.ok) return true
        if (res.status !== 400) return false
        const body = await res.json().catch(() => undefined) as { error?: string } | undefined
        return typeof body?.error === 'string'
    }
    catch {
        return false   // nothing listening there, or too slow: not Azure
    }
}

/*
    'azureProbe' is injectable so a test can say 'this is Azure' or 'nothing answers' without being there.
*/
const detectExecutionEnvironment = async (azureProbe: () => Promise<boolean> = () => probeAzureIdentityEndpoint()): Promise<EExecutionEnvironment|undefined> => {
    switch (process.env.FORCE) {
        case 'desktop':
            return EExecutionEnvironment.DESKTOP
        case 'docker':
            return EExecutionEnvironment.DOCKER
        /*
            The one environment that is never detected, only asked for. Everything else here overrides
            a detection that would have worked anyway; this one names a case detection CANNOT reach —
            a container on a platform Kwirth is not asked to recognise, and above all a pod deployed
            with no Kubernetes permissions at all, where the kubelet's own KUBERNETES_SERVICE_HOST
            would otherwise identify a workload that then refuses to start without an API it is not
            allowed to reach.
        */
        case 'container':
            return EExecutionEnvironment.CONTAINER
        case 'k8s':
            return EExecutionEnvironment.KUBERNETES
        case 'ecs':
            return EExecutionEnvironment.ECS
        case 'cloudrun':
            return EExecutionEnvironment.CLOUD_RUN
        case 'aci':
            return EExecutionEnvironment.ACI
    }

    if (isDesktopRuntime()) return EExecutionEnvironment.DESKTOP
    if (process.env.KUBERNETES_SERVICE_HOST) return EExecutionEnvironment.KUBERNETES

    /*
        ECS goes BEFORE docker on purpose: on the EC2 launch type the containers are started by Docker's
        daemon, so '/.dockerenv' exists and would take the detection. On Fargate it does not exist — it is
        containerd — which is why until now a Fargate task was no known environment at all and the process
        closed on startup. Cloud Run goes before docker for the same reason.
    */
    if (isEcsRuntime()) return EExecutionEnvironment.ECS
    if (isCloudRunRuntime()) return EExecutionEnvironment.CLOUD_RUN
    if (fs.existsSync('/.dockerenv')) return EExecutionEnvironment.DOCKER

    // The only check that costs time goes LAST, so a local container or a cluster never pays for it.
    if (await azureProbe()) return EExecutionEnvironment.ACI

    return undefined
}

/*
    Where a Kubernetes configuration can come from. It is asked BEFORE loading anything, and that is the
    whole point.

    loadFromDefault() does NOT end up without a cluster when it finds no kubeconfig: it invents one
    pointing at http://localhost:8080 — kubectl's old default — with a context called 'loaded-context'. So
    asking it afterwards whether there is a cluster selected answers YES inside a bare container, and
    startup goes chasing a server that does not exist. That was exactly the symptom that left Kwirth with
    no instance on docker: 'request to http://localhost:8080/api/v1/namespaces/kube-system failed'.

    'existe' is injected so this can be tested without depending on the machine the tests run on.
*/
const hasKubeconfigSource = (existe: (ruta:string) => boolean = fs.existsSync): boolean => {
    // KUBECONFIG admits several paths; one existing is enough.
    const kubeconfig = process.env.KUBECONFIG
    if (kubeconfig) return kubeconfig.split(path.delimiter).some(ruta => ruta.length > 0 && existe(ruta))

    if (existe(path.join(os.homedir(), '.kube', 'config'))) return true

    // Inside a pod the kubelet itself mounts the credential, and there is no kubeconfig file.
    if (existe('/var/run/secrets/kubernetes.io/serviceaccount/token')) return true

    return false
}

/*
    A PASSIVE check: there is a kubeconfig source and a cluster comes out of it. The server is not asked.

    That is deliberate. Asking would be more honest, but it puts a network timeout into startup and, above
    all, it turns a cluster that is slow to answer into a Kwirth degraded to 'no Kubernetes' — which is a
    far worse diagnosis than a clear error on first use. If there is a kubeconfig, it is tried; if the
    cluster does not answer, that shows and is reported as the failure it is.
*/
const hasUsableKubeconfig = (context:string|undefined): boolean => {
    try {
        if (!hasKubeconfigSource()) return false

        const kubeConfig = new KubeConfig()
        kubeConfig.loadFromDefault()
        if (context) kubeConfig.setCurrentContext(context)
        return kubeConfig.getCurrentCluster() !== null
    }
    catch (err) {
        return false
    }
}

const resolveStore = (executionEnvironment:EExecutionEnvironment, kubernetes:boolean, reasons:string[]): { store:EStoreKind, storePath:string|undefined } => {
    const kwirthStore = process.env.KWIRTH_STORE

    switch (executionEnvironment) {
        case EExecutionEnvironment.DESKTOP:
            reasons.push('Store: encrypted files (desktop always keeps its data locally)')
            return { store: EStoreKind.FILE, storePath: kwirthStore }

        case EExecutionEnvironment.DOCKER:
            reasons.push('Store: plain files (legacy docker format, set by CONFIGMAPPATH and SECRETPATH)')
            return { store: EStoreKind.FILE_PLAIN, storePath: undefined }

        /*
            The container platforms store alike: encrypted files, and only a mounted volume (EFS on ECS,
            Cloud Storage/NFS on Cloud Run, Azure Files on ACI, a PersistentVolumeClaim in a pod)
            survives a recycle.

            That they already shared this case is what made CONTAINER worth adding rather than faking:
            the four are ONE profile, and the three named ones differ from it only in being detectable.
        */
        case EExecutionEnvironment.ECS:
        case EExecutionEnvironment.CLOUD_RUN:
        case EExecutionEnvironment.ACI:
        case EExecutionEnvironment.CONTAINER:
            if (kwirthStore) {
                reasons.push(`Store: encrypted files at '${kwirthStore}' (KWIRTH_STORE)`)
            }
            else {
                reasons.push('Store: encrypted files at the default path. WARNING: no KWIRTH_STORE set, so nothing will survive a task recycle unless that path is a mounted volume')
            }
            return { store: EStoreKind.FILE, storePath: kwirthStore }

        case EExecutionEnvironment.KUBERNETES:
            /*
                'etcd' is accepted for compatibility: it is how the cluster's own storage was explicitly
                asked for before KWIRTH_STORE accepted a path.
            */
            if (kwirthStore && kwirthStore !== 'etcd') {
                reasons.push(`Store: encrypted files at '${kwirthStore}' (KWIRTH_STORE)`)
                return { store: EStoreKind.FILE, storePath: kwirthStore }
            }
            if (!kubernetes) {
                reasons.push('Store: encrypted files, because there is no Kubernetes API to hold Secrets and ConfigMaps')
                return { store: EStoreKind.FILE, storePath: undefined }
            }
            reasons.push('Store: cluster Secrets and ConfigMaps')
            return { store: EStoreKind.KUBERNETES, storePath: undefined }
    }
}

/*
    EVERYTHING startup needs to decide comes out of here. Whoever wants to know whether there are
    Kubernetes events, whether there are metrics or where things are persisted asks this object and does
    not go looking at the environment on its own account: it is precisely the scattering of those
    conditions that made adding a new environment a risky job.
*/
const resolveEnvironmentCapabilities = async (executionEnvironment:EExecutionEnvironment, context:string|undefined, probes:IEnvironmentProbes = { kubeconfig: hasUsableKubeconfig }): Promise<IEnvironmentCapabilities> => {
    const reasons:string[] = []

    let kubernetes:boolean
    if (executionEnvironment === EExecutionEnvironment.KUBERNETES) {
        // Inside the cluster (or pointing at one) Kubernetes is not optional: a failure is an error and
        // not a degradation, and making it optional here would only serve to hide it.
        kubernetes = true
        reasons.push('Kubernetes API: yes (running as a Kubernetes workload)')
    }
    else {
        kubernetes = probes.kubeconfig(context)
        if (kubernetes)
            reasons.push('Kubernetes API: yes (a kubeconfig with a selected cluster was found)')
        else
            reasons.push('Kubernetes API: no (no usable kubeconfig), so cluster events, metrics and resources are not available')
    }

    const { store, storePath } = resolveStore(executionEnvironment, kubernetes, reasons)

    return { kubernetes, store, storePath, reasons }
}

/*
    Where the resources will come from. There are only two answers: the cluster, or nowhere.

    A Kwirth with no cluster is NOT left without a job — it serves the front end, it carries channels that
    do not look at the infrastructure, and from it one can federate against another Kwirth or point at a
    cluster by mounting a kubeconfig. What it does not do is manage containers on its own account: 'docker
    compose' as a thing to observe is a route that was abandoned on purpose.
*/
const resolveClusterType = (capabilities:IEnvironmentCapabilities): EClusterType => {
    if (capabilities.kubernetes) return EClusterType.KUBERNETES
    return EClusterType.NONE
}

export { EStoreKind, IEnvironmentCapabilities, IEnvironmentProbes, detectExecutionEnvironment, probeAzureIdentityEndpoint, resolveEnvironmentCapabilities, resolveClusterType, hasKubeconfigSource, hasUsableKubeconfig }
