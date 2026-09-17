import { IAiToolset, IClusterEvent, IToolHost, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { ECapability, EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset `k8s-observability` — qué ha pasado en el cluster y qué dijo el contenedor
    (plan: plans/ai-tools/PLAN.md, S3).

    Tercer paquete del reparto de las 43, y el primero que estrena `ECapability.EVENTS`: dos de sus tres
    tools no llaman al cluster, leen el buffer de eventos que el core ya mantiene. Eso es justo lo que
    hace que la capability signifique algo — un toolset que solo necesita eventos no recibe cluster.

    Las copias de `common-ai` quedan CONGELADAS hasta que los plugins estén cableados: un arreglo va solo
    aquí (ver el plan, "Cuándo se borran las 43").
*/

// Las capabilities se piden, no se asumen: si el host no las provisiona, la tool lo dice en vez de
// reventar por dentro con un 'cannot read property of undefined'.
const events = (host: IToolHost, toolName: string, args: Record<string, unknown> = {}): IClusterEvent[] => {
    host.trace(toolName, args)
    if (!host.events) throw new Error(`[k8s-observability] '${toolName}' needs the cluster event buffer and the host did not provide it`)
    return host.events.recent
}

const k8s = (host: IToolHost, toolName: string, args: Record<string, unknown> = {}) => {
    host.trace(toolName, args)
    if (!host.k8s) throw new Error(`[k8s-observability] '${toolName}' needs cluster access and the host did not provide it`)
    return host.k8s
}

/** Un fallo se devuelve como dato, no como excepción: el modelo tiene que poder leerlo y decidir. */
const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })

/*
    Un elemento del buffer es de una de dos clases, y se resumen distinto:
      · un Event de kube (kind: 'Event'): lo interesante es el motivo, el mensaje y a quién señala
      · un cambio de ciclo de vida de cualquier objeto: lo interesante es qué cambió y de quién
*/
const summarize = (e: IClusterEvent): Record<string, unknown> => {
    const o = e?.obj ?? {}
    if (o.kind === 'Event') {
        return {
            kind: 'Event',
            eventType: o.type,          // Normal | Warning
            reason: o.reason,
            message: o.message,
            involved: o.involvedObject
                ? { kind: o.involvedObject.kind, name: o.involvedObject.name, namespace: o.involvedObject.namespace }
                : undefined,
            count: o.count,
            lastTimestamp: o.lastTimestamp ?? o.eventTime
        }
    }
    return {
        changeType: e?.type,            // ADDED | MODIFIED | DELETED
        kind: o.kind,
        name: o.metadata?.name,
        namespace: o.metadata?.namespace
    }
}

/** El namespace de un elemento del buffer, venga como objeto propio o señalado por un Event. */
const namespaceOf = (e: IClusterEvent): string | undefined =>
    e?.obj?.metadata?.namespace ?? e?.obj?.involvedObject?.namespace

/** Tope de log que se le manda al modelo. Más que esto no aporta y se come la ventana de contexto. */
const LOG_LIMIT = 15000

const k8sObservability: IAiToolset = {
    id: 'k8s-observability',
    version: '0.1.0',
    displayName: 'K8s Observability',
    description: 'Recent cluster events and container logs: what happened and what the pod said',
    requires: [ECapability.K8S, ECapability.EVENTS],
    tools: [
        {
            name: 'get_cluster_events',
            description: 'Returns recent Kubernetes events buffered for this cluster: kube Events (warnings like crashloops/OOM/failed scheduling) and object lifecycle changes. Optionally filter to warnings only or by namespace.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                warningsOnly: z.boolean().optional().describe('Only Warning-type kube Events'),
                namespace: z.string().optional().describe('Filter by namespace'),
                limit: z.number().optional().describe('Max events to return (default 50)')
            }),
            execute: async (args, host) => {
                const warningsOnly = Boolean(args.warningsOnly)
                const namespace = typeof args.namespace === 'string' ? args.namespace : undefined
                const limit = typeof args.limit === 'number' ? args.limit : 50

                let evs = events(host, 'get_cluster_events', { warningsOnly, namespace: namespace ?? '*', limit })
                if (warningsOnly) evs = evs.filter(e => e?.obj?.kind === 'Event' && e.obj.type === 'Warning')
                if (namespace) evs = evs.filter(e => namespaceOf(e) === namespace)

                // Se devuelven los ULTIMOS: en un buffer de eventos lo viejo casi nunca es lo que se busca.
                return { count: evs.length, events: evs.slice(-limit).map(summarize) }
            }
        },
        {
            name: 'get_object_events',
            description: 'Returns recent events for a specific Kubernetes object (by namespace and name): its lifecycle changes and related kube Events (via involvedObject).',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the object'),
                name: z.string().describe('Name of the object')
            }),
            execute: async (args, host) => {
                const namespace = String(args.namespace)
                const name = String(args.name)
                const evs = events(host, 'get_object_events', { namespace, name }).filter(e => {
                    const o = e?.obj ?? {}
                    // Dos formas de que un evento hable de un objeto: SER el objeto, o señalarlo. Mirar solo
                    // una deja fuera justo la mitad interesante — los Warning apuntan con involvedObject.
                    const isObj = o.metadata?.namespace === namespace && o.metadata?.name === name
                    const isInvolved = o.involvedObject?.namespace === namespace && o.involvedObject?.name === name
                    return isObj || isInvolved
                })
                return { count: evs.length, events: evs.map(summarize) }
            }
        },
        {
            name: 'get_pod_logs',
            // ⚠️ READ pero INTERNAL, y no por exceso de celo: un log es donde acaban tokens, correos y datos
            // de cliente. No cambia nada del cluster y puede enseñar más que muchas tools de escritura.
            description: 'Returns recent container logs for a pod (equivalent to kubectl logs). For a crashing pod (CrashLoopBackOff) pass previous:true to read the CRASHED container instance logs — that is where the root cause usually is: the events only say it is restarting, not why.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.INTERNAL,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the pod'),
                name: z.string().describe('Name of the pod'),
                container: z.string().optional().describe('Container name (omit to use the pod default / first container)'),
                previous: z.boolean().optional().describe('Read the previous (crashed/restarted) container instance logs — key for CrashLoopBackOff'),
                tailLines: z.number().optional().describe('How many trailing lines to return (default 200)')
            }),
            execute: async (args, host) => {
                const namespace = String(args.namespace)
                const name = String(args.name)
                const container = typeof args.container === 'string' ? args.container : undefined
                const previous = Boolean(args.previous)
                const tailLines = typeof args.tailLines === 'number' ? args.tailLines : 200

                const c = k8s(host, 'get_pod_logs', { namespace, name, container: container ?? '(default)', previous, tailLines })
                try {
                    const raw: unknown = await c.coreApi.readNamespacedPodLog({ name, namespace, container, previous, tailLines })
                    const text = typeof raw === 'string' ? raw : ((raw as { body?: string })?.body ?? JSON.stringify(raw))
                    const truncated = text.length > LOG_LIMIT
                    // Se recorta por el FINAL: lo último que dijo el contenedor antes de morir es lo que
                    // explica la muerte; el arranque casi nunca.
                    return { namespace, name, container: container ?? null, previous, truncated, logs: truncated ? text.slice(-LOG_LIMIT) : text }
                }
                catch (err) { return failed(err) }
            }
        }
    ]
}

export default k8sObservability
