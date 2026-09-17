import { IAiToolset, IToolHost, defineTool, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { ECapability, EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'
import * as tls from 'tls'

/*
    Toolset `k8s-secrets` — la configuración que un workload consume de verdad
    (plan: plans/ai-tools/PLAN.md, S3).

    Existe como paquete aparte aunque sus tres tools sean de lectura: es el caso que justifica que
    `sensitivity` sea un eje independiente de `effect`. Separarlo permite dárselo a un plugin y negárselo
    a otro sin tocar nada más.

    ⚠️ LA SENSIBILIDAD AQUÍ ESTÁ AL REVÉS DE LO QUE PARECE, y conviene saberlo:

      · `get_secret` **no devuelve los valores**. Devuelve las CLAVES, el tipo y cuándo cambió. Eso es
        deliberado y viene de las 43 originales: se puede saber que un Secret cambió sin poder leerlo.
      · `get_configmap` **sí devuelve los datos en crudo**. Y un ConfigMap es exactamente donde acaban las
        contraseñas de quien no quiso complicarse — de ahí que sea el más sensible de los tres.

    El nombre del toolset dice "secrets" por el tema, no porque devuelva secretos.
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

// ⚠️ `managedFields[].time` llega como Date con el cliente tipado. Se normaliza a ISO ANTES de ordenar:
// ordenar Dates con el sort por defecto las compara como texto ('Apr' < 'Aug' < 'Dec') y da la fecha
// equivocada — que aquí sería decir que un Secret cambió cuando no, o al revés.
const iso = (t: Date | string | undefined): string | undefined => {
    if (!t) return undefined
    const d = t instanceof Date ? t : new Date(t)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Cuándo se tocó por última vez: el `managedFields` más reciente, o la fecha de creación. */
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
            // El más sensible de los tres, aunque suene raro: devuelve los valores EN CRUDO, y un ConfigMap
            // es donde acaban las contraseñas de quien no quiso usar un Secret.
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
                        // De lo binario solo las claves: su contenido no le sirve de nada al modelo y se
                        // comería la ventana de contexto.
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
            // INTERNAL, no SECRET: los valores no salen de aquí. Lo que se expone son nombres de clave y
            // cuándo cambió — suficiente para diagnosticar, insuficiente para filtrar nada.
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
                        // ⚠️ `data` NO se devuelve, y no es un descuido: es el contrato de esta tool.
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
                // No necesita cluster: abre un socket. Aun así se traza, que es lo que permite ver a dónde
                // se ha conectado el modelo.
                host.trace('get_certificate_info', { hostname, port })
                const targetPort = port ?? DEFAULT_TLS_PORT

                return new Promise(resolve => {
                    // rejectUnauthorized: false a propósito — se INSPECCIONA el certificado, incluido uno
                    // caducado o autofirmado. Rechazarlo impediría diagnosticar justo el caso interesante.
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
                    // Un host que no responde colgaria la conversacion entera: se corta y se informa.
                    socket.setTimeout(TLS_TIMEOUT_MS, () => { socket.destroy(); resolve({ error: 'Connection timed out' }) })
                    socket.on('error', err => resolve({ error: err.message }))
                })
            }
        })
    ]
}

export default k8sSecrets
