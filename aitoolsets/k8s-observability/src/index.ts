import { IAiToolset, IClusterEvent, IToolHost, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { ECapability, EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset `k8s-observability` — what has happened in the cluster and what the container said
    (plan: plans/ai-tools/PLAN.md, S3).

    The third package of the 43's split, and the first to use `ECapability.EVENTS`: two of its three tools
    do not call the cluster, they read the event buffer the core already keeps. That is precisely what
    makes the capability mean something — a toolset that only needs events does not get a cluster.

    The copies in `common-ai` stay FROZEN until the plugins are wired up: a fix goes here only (see the
    plan, "When the 43 get deleted").
*/

// Capabilities are asked for, not assumed: when the host does not provision them, the tool says so
// instead of blowing up inside with a 'cannot read property of undefined'.
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

/** A failure is returned as data, not as an exception: the model has to be able to read it and decide. */
const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })

/*
    An item of the buffer is of one of two kinds, and they are summarised differently:
      · a kube Event (kind: 'Event'): what matters is the reason, the message and who it points at
      · a lifecycle change of any object: what matters is what changed and whose it is
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

/** The namespace of a buffer entry, whether it comes as an object of its own or pointed at by an Event. */
const namespaceOf = (e: IClusterEvent): string | undefined =>
    e?.obj?.metadata?.namespace ?? e?.obj?.involvedObject?.namespace

/** Ceiling on the log sent to the model. More than this adds nothing and eats the context window. */
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

                // The LAST ones are returned: in an event buffer the old stuff is hardly ever what is wanted.
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
                    // Two ways for an event to talk about an object: BEING the object, or pointing at it.
                    // Looking at only one leaves out precisely the interesting half — Warnings point with
                    // involvedObject.
                    const isObj = o.metadata?.namespace === namespace && o.metadata?.name === name
                    const isInvolved = o.involvedObject?.namespace === namespace && o.involvedObject?.name === name
                    return isObj || isInvolved
                })
                return { count: evs.length, events: evs.map(summarize) }
            }
        },
        {
            name: 'get_pod_logs',
            // ⚠️ READ but INTERNAL, and not out of excessive zeal: a log is where tokens, emails and
            // customer data end up. It changes nothing in the cluster and can show more than many write tools.
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
                    // It is trimmed from the END: the last thing the container said before dying is what
                    // explains the death; the startup hardly ever does.
                    return { namespace, name, container: container ?? null, previous, truncated, logs: truncated ? text.slice(-LOG_LIMIT) : text }
                }
                catch (err) { return failed(err) }
            }
        }
    ]
}

export default k8sObservability
