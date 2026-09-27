import { IAiToolset, IToolHost, defineTool, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { ECapability, EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'
import * as tls from 'tls'

/*
    Toolset `k8s-secrets` — the configuration a workload really consumes
    (plan: plans/ai-tools/PLAN.md, S3).

    It exists as a separate package even though its three tools are read-only: it is the case that
    justifies `sensitivity` being an axis independent of `effect`. Separating it allows giving it to one
    plugin and denying it to another without touching anything else.

    ⚠️ SENSITIVITY HERE IS THE OTHER WAY ROUND FROM WHAT IT LOOKS LIKE, and it is worth knowing:

      · `get_secret` **does not return the values**. It returns the KEYS, the type and when it changed.
        That is deliberate and comes from the original 43: one can know that a Secret changed without
        being able to read it.
      · `get_configmap` **does return the raw data**. And a ConfigMap is exactly where the passwords of
        whoever did not want the bother end up — hence it being the most sensitive of the three.

    The toolset's name says "secrets" for the subject, not because it returns secrets.
*/

const k8s = (host: IToolHost, toolName: string, args: Record<string, unknown> = {}) => {
    host.trace(toolName, args)
    if (!host.k8s) throw new Error(`[k8s-secrets] '${toolName}' needs cluster access and the host did not provide it`)
    return host.k8s
}

const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })

interface IObjectMetaTimes {
    managedFields?: { time?: Date | string }[]
    creationTimestamp?: Date | string
}

// ⚠️ `managedFields[].time` arrives as a Date with the typed client. It is normalised to ISO BEFORE
// sorting: sorting Dates with the default sort compares them as text ('Apr' < 'Aug' < 'Dec') and gives
// the wrong date — which here would mean saying a Secret changed when it did not, or the other way round.
const iso = (t: Date | string | undefined): string | undefined => {
    if (!t) return undefined
    const d = t instanceof Date ? t : new Date(t)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** When it was last touched: the most recent `managedFields`, or the creation date. */
const lastModifiedOf = (meta: IObjectMetaTimes | undefined): string | undefined => {
    const times = (meta?.managedFields ?? []).map(f => iso(f.time)).filter((t): t is string => Boolean(t))
    return times.length ? times.sort()[times.length - 1] : iso(meta?.creationTimestamp)
}

const TLS_TIMEOUT_MS = 5000
const DEFAULT_TLS_PORT = 443
const MS_PER_DAY = 86400000

const k8sSecrets: IAiToolset = {
    id: 'k8s-secrets',
    version: '0.1.0',
    displayName: 'K8s Config & Secrets',
    description: 'The configuration a workload actually consumes: ConfigMap data, Secret keys (values never returned) and TLS certificate details',
    requires: [ECapability.K8S],
    tools: [
        defineTool({
            name: 'get_configmap',
            description: 'Returns a ConfigMap data (key → value) plus metadata (resourceVersion, lastModified). Use to inspect the ACTUAL config a workload consumes and to check whether it changed recently — a ConfigMap value change (same env var, different value) does NOT create a Deployment revision, so it is invisible to get_rollout_history.',
            effect: EToolEffect.READ,
            // The most sensitive of the three, odd as it sounds: it returns the values RAW, and a ConfigMap
            // is where the passwords of whoever did not want to use a Secret end up.
            sensitivity: EToolSensitivity.SECRET,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the ConfigMap'),
                name: z.string().describe('Name of the ConfigMap')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'get_configmap', { namespace, name })
                try {
                    const cm = await c.coreApi.readNamespacedConfigMap({ name, namespace })
                    return {
                        name, namespace,
                        resourceVersion: cm.metadata?.resourceVersion,
                        lastModified: lastModifiedOf(cm.metadata),
                        data: cm.data ?? {},
                        // Of binary data, only the keys: its content is of no use to the model and would
                        // eat the context window.
                        binaryDataKeys: Object.keys(cm.binaryData ?? {})
                    }
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_secret',
            description: 'Returns a Secret KEYS, type and metadata (resourceVersion, lastModified) — VALUES ARE REDACTED (never returned). Use to check whether a Secret a workload consumes changed recently (a value change does NOT create a Deployment revision) and which keys it holds. You cannot read the secret values.',
            effect: EToolEffect.READ,
            // INTERNAL, not SECRET: the values do not leave here. What is exposed are key names and when
            // it changed — enough to diagnose, not enough to leak anything.
            sensitivity: EToolSensitivity.INTERNAL,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the Secret'),
                name: z.string().describe('Name of the Secret')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'get_secret', { namespace, name })
                try {
                    const s = await c.coreApi.readNamespacedSecret({ name, namespace })
                    return {
                        name, namespace,
                        type: s.type,
                        resourceVersion: s.metadata?.resourceVersion,
                        lastModified: lastModifiedOf(s.metadata),
                        keys: Object.keys(s.data ?? {})
                        // ⚠️ `data` is NOT returned, and that is no oversight: it is this tool's contract.
                    }
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_certificate_info',
            description: 'Connects to a hostname via HTTPS and returns TLS certificate details: subject, issuer, validity dates, SANs, fingerprint and whether it is currently valid.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,   // un certificado servidor es publico por definicion
            inputSchema: z.object({
                hostname: z.string().describe('DNS name or IP to connect to'),
                port: z.number().optional().describe('Port to connect to (default: 443)')
            }),
            execute: async ({ hostname, port }, host) => {
                // It needs no cluster: it opens a socket. It is traced all the same, which is what makes it
                // possible to see where the model has connected to.
                host.trace('get_certificate_info', { hostname, port })
                const targetPort = port ?? DEFAULT_TLS_PORT

                return new Promise(resolve => {
                    // rejectUnauthorized: false on purpose — the certificate is INSPECTED, including an
                    // expired or self-signed one. Rejecting it would prevent diagnosing the interesting case.
                    const socket = tls.connect({ host: hostname, port: targetPort, servername: hostname, rejectUnauthorized: false }, () => {
                        try {
                            const cert = socket.getPeerCertificate(false)
                            socket.end()
                            if (!cert || !Object.keys(cert).length) return resolve({ error: 'No certificate returned' })

                            const now = Date.now()
                            const validFrom = new Date(cert.valid_from)
                            const validTo = new Date(cert.valid_to)
                            resolve({
                                subject: cert.subject, issuer: cert.issuer,
                                validFrom: cert.valid_from, validTo: cert.valid_to,
                                daysUntilExpiry: Math.floor((validTo.getTime() - now) / MS_PER_DAY),
                                isCurrentlyValid: now >= validFrom.getTime() && now <= validTo.getTime(),
                                subjectAltNames: cert.subjectaltname ?? null,
                                fingerprint: cert.fingerprint, serialNumber: cert.serialNumber,
                                protocol: socket.getProtocol()
                            })
                        }
                        catch (err) { socket.end(); resolve(failed(err)) }
                    })
                    // A host that does not answer would hang the whole conversation: it is cut off and reported.
                    socket.setTimeout(TLS_TIMEOUT_MS, () => { socket.destroy(); resolve({ error: 'Connection timed out' }) })
                    socket.on('error', err => resolve({ error: err.message }))
                })
            }
        })
    ]
}

export default k8sSecrets
