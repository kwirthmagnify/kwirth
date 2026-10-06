import { randomUUID } from 'crypto'
import { EExecutionEnvironment, EInstallationIdSource, IInstallationIdentity } from '@kwirthmagnify/kwirth-common'

/*
    WHO this Kwirth is when there is no Kubernetes to ask.

    Inside a cluster the installation identity is the uid of the kube-system namespace (index.ts reads it).
    Without one, extensions would persist, stamp and federate everything under an EMPTY id, and two
    installations sharing a database would silently overwrite each other. So the identity is taken from what
    the platform itself already offers — nothing has to be configured — in this order:

      ECS        aws:ecs:<account>:<region>:<cluster>:<family>    task metadata endpoint
      Cloud Run  gcp:run:<project>:<region>:<service>             GCP metadata server + K_SERVICE
      ACI        azure:aci:<subscription>:<group>:<container group>   managed identity token claims
      anything   uuid:<uuid>                                      generated once, kept in Kwirth's store

    Every part is STABLE across task recycles, new instances and new revisions: no task ARN, no instance id,
    no revision. And "account + region" alone is not enough — two Kwirths in the same account and region
    would collide.

    A platform source that fails (no permission, metadata not reachable) does NOT stop startup: it falls back
    to the generated id and says why.
*/

// What the resolution needs from the outside world, injectable so a test can play each platform.
interface IIdentityProbes {
    env: NodeJS.ProcessEnv
    getJson: (url: string, headers: Record<string, string>) => Promise<unknown | undefined>
    getText: (url: string, headers: Record<string, string>) => Promise<string | undefined>
    readStored: () => Promise<string | undefined>
    writeStored: (id: string) => Promise<void>
    log: (message: string) => void
}

const METADATA_TIMEOUT_MS = 2000
const GCP_METADATA = 'http://metadata.google.internal/computeMetadata/v1'
const AZURE_TOKEN_URL = 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fmanagement.azure.com%2F'

const httpGet = async (url: string, headers: Record<string, string>): Promise<Response | undefined> => {
    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) })
        return res.ok ? res : undefined
    }
    catch {
        return undefined
    }
}

const defaultProbes = (readStored: () => Promise<string | undefined>, writeStored: (id: string) => Promise<void>, log: (message: string) => void): IIdentityProbes => ({
    env: process.env,
    getJson: async (url, headers) => (await httpGet(url, headers))?.json().catch(() => undefined),
    getText: async (url, headers) => (await httpGet(url, headers))?.text().catch(() => undefined),
    readStored,
    writeStored,
    log
})

// ── ECS ──────────────────────────────────────────────────────────────────────────────────────────────

interface IEcsTaskMetadata {
    Cluster?: string        // full ARN on current agents; a bare name on some older ones
    TaskARN?: string        // arn:aws:ecs:<region>:<account>:task/<cluster>/<id>
    Family?: string
}

/** 'arn:aws:ecs:<region>:<account>:<resource>' → [_, region, account, resource], or null. */
const parseArn = (arn: string | undefined): RegExpExecArray | null => /^arn:aws[\w-]*:ecs:([^:]+):(\d+):(.+)$/.exec(arn ?? '')

const fromEcs = async (p: IIdentityProbes): Promise<IInstallationIdentity | string> => {
    const base = p.env.ECS_CONTAINER_METADATA_URI_V4 ?? p.env.ECS_CONTAINER_METADATA_URI
    if (!base) return 'no ECS metadata variable'
    const task = await p.getJson(`${base}/task`, {}) as IEcsTaskMetadata | undefined
    if (!task) return `the task metadata endpoint did not answer (${base}/task)`
    // The account and region come from whichever ARN is there; the cluster NAME from the cluster field.
    const arn = parseArn(task.Cluster) ?? parseArn(task.TaskARN)
    const cluster = (task.Cluster ?? '').split('/').pop() || ''
    if (!arn || !cluster || !task.Family) return `incomplete task metadata (Cluster='${task.Cluster}', Family='${task.Family}')`
    const [, region, account] = arn
    return {
        id: `aws:ecs:${account}:${region}:${cluster}:${task.Family}`,
        name: `ecs/${cluster}/${task.Family}`,
        source: EInstallationIdSource.ECS
    }
}

// ── Cloud Run ────────────────────────────────────────────────────────────────────────────────────────

const fromCloudRun = async (p: IIdentityProbes): Promise<IInstallationIdentity | string> => {
    const service = p.env.K_SERVICE
    if (!service) return 'no K_SERVICE'
    const headers = { 'Metadata-Flavor': 'Google' }
    const project = (await p.getText(`${GCP_METADATA}/project/project-id`, headers))?.trim()
    // The region comes as 'projects/<number>/regions/<region>'.
    const region = (await p.getText(`${GCP_METADATA}/instance/region`, headers))?.trim().split('/').pop()
    if (!project || !region) return `the GCP metadata server did not answer (project='${project}', region='${region}')`
    return {
        id: `gcp:run:${project}:${region}:${service}`,
        name: `run/${service}`,
        source: EInstallationIdSource.CLOUD_RUN
    }
}

// ── ACI ──────────────────────────────────────────────────────────────────────────────────────────────

interface IAzureTokenResponse {
    access_token?: string
}

interface IAzureTokenClaims {
    xms_mirid?: string      // system-assigned: the source resource. user-assigned: the identity itself
    xms_az_rid?: string     // only with a user-assigned identity: the source resource
}

/** The claims of a JWT, WITHOUT verifying it: it is only read to learn who we are, never to trust anyone. */
const jwtClaims = (token: string): IAzureTokenClaims | undefined => {
    try {
        const payload = token.split('.')[1]
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as IAzureTokenClaims
    }
    catch {
        return undefined
    }
}

const fromAzureManagedIdentity = async (p: IIdentityProbes): Promise<IInstallationIdentity | string> => {
    const res = await p.getJson(AZURE_TOKEN_URL, { Metadata: 'true' }) as IAzureTokenResponse | undefined
    if (!res?.access_token) return 'no managed identity token (the container group has no managed identity assigned)'
    const claims = jwtClaims(res.access_token)
    // With a user-assigned identity, xms_mirid is the IDENTITY (it can be shared by many container groups);
    // the resource the token was issued to is xms_az_rid. With a system-assigned one, only xms_mirid exists.
    const rid = claims?.xms_az_rid ?? claims?.xms_mirid
    const m = /^\/subscriptions\/([^/]+)\/resourcegroups\/([^/]+)\/providers\/[^/]+\/[^/]+\/([^/]+)$/i.exec(rid ?? '')
    if (!m) return `the token carries no usable resource id ('${rid}')`
    // Azure resource ids are case-insensitive: lower-cased, so the same group is always the same id.
    const [subscription, group, name] = [m[1], m[2], m[3]].map(s => s.toLowerCase())
    return {
        id: `azure:aci:${subscription}:${group}:${name}`,
        name: `aci/${name}`,
        source: EInstallationIdSource.AZURE_MANAGED_IDENTITY
    }
}

// ── generated ────────────────────────────────────────────────────────────────────────────────────────

const generated = async (p: IIdentityProbes, storeIsPersistent: boolean): Promise<IInstallationIdentity> => {
    let id = await p.readStored()
    if (!id || !id.startsWith('uuid:')) {
        id = `uuid:${randomUUID()}`
        await p.writeStored(id)
        p.log(`Installation identity: generated '${id}' and kept it in Kwirth's store`)
    }
    if (!storeIsPersistent) {
        p.log(`WARNING: the installation identity '${id}' was generated and lives in a store that is not a mounted volume (no KWIRTH_STORE): a new instance will get a NEW identity, and data kept under the old one will be orphaned`)
    }
    return { id, name: `kwirth-${id.slice('uuid:'.length, 'uuid:'.length + 8)}`, source: EInstallationIdSource.GENERATED }
}

/*
    Resolves the identity of an installation WITHOUT Kubernetes. Never throws: whatever fails, the answer is
    at worst a generated id, and the log says why the platform one could not be used.
*/
const resolveInstallationIdentity = async (executionEnvironment: EExecutionEnvironment, storeIsPersistent: boolean, probes: IIdentityProbes): Promise<IInstallationIdentity> => {
    let platform: Promise<IInstallationIdentity | string> | undefined
    switch (executionEnvironment) {
        case EExecutionEnvironment.ECS:
            platform = fromEcs(probes)
            break
        case EExecutionEnvironment.CLOUD_RUN:
            platform = fromCloudRun(probes)
            break
        case EExecutionEnvironment.ACI:
            platform = fromAzureManagedIdentity(probes)
            break
    }
    if (platform) {
        const result = await platform.catch(err => `error: ${err instanceof Error ? err.message : String(err)}`)
        if (typeof result !== 'string') return result
        probes.log(`Installation identity: the ${executionEnvironment} platform gave none (${result}); falling back to a generated one`)
    }
    return generated(probes, storeIsPersistent)
}

export { IIdentityProbes, resolveInstallationIdentity, defaultProbes, jwtClaims }
