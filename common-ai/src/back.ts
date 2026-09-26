import { ILlm, ILlmModel, ILlmProvider, ECapability, EToolEffect, EToolSensitivity, IAiToolInfo, IAiToolsetInfo, IToolsetConfig, parseToolRef, toolRef } from './index'
// TYPES ONLY: the compiler erases them, so common-ai does not drag the Kubernetes client (~6.6 MB) into
// any bundle. That is why @kubernetes/client-node is an optional peer and not a dependency.
import type { AppsV1Api, CoreV1Api, NetworkingV1Api } from '@kubernetes/client-node'

interface ILogChannel {
    logInfo?: (msg: string) => void
    logWarning?: (msg: string) => void
    logError?: (msg: string) => void
}
import { LanguageModel, tool, Tool, ToolSet, generateText, Output } from 'ai'
import { z } from 'zod'
import { AsyncLocalStorage } from 'async_hooks'

import { createOpenAI } from '@ai-sdk/openai'
import { createGroq } from '@ai-sdk/groq'
import { createMistral } from '@ai-sdk/mistral'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createAnthropic } from '@ai-sdk/anthropic'

export const buildModel = (llm: ILlm, providers: ILlmProvider[]): LanguageModel | null => {
    const prov = providers.find(p => p.name === llm.provider)
    const key = llm.useProviderKey ? prov?.key : llm.key
    if (!key) {
        console.log('Could not find a key')
        return null
    }
    const type = prov?.type ?? prov?.name ?? llm.provider
    switch (type) {
        case 'openai': return createOpenAI({ apiKey: key })(llm.model)
        case 'groq': return createGroq({ apiKey: key })(llm.model)
        case 'mistral': return createMistral({ apiKey: key })(llm.model)
        case 'google': return createGoogleGenerativeAI({ apiKey: key })(llm.model)
        case 'deepseek': return createDeepSeek({ apiKey: key })(llm.model)
        case 'openrouter': return createOpenRouter({ apiKey: key })(llm.model)
        case 'anthropic': return createAnthropic({ apiKey: key })(llm.model)
        case 'openai-compat': {
            // baseURL must end in /v1 (the SDK appends the path). And we use .chat() → Chat Completions API
            // (/v1/chat/completions): OpenAI-compatible endpoints (Huawei MaaS and the like) do NOT expose the
            // Responses API (/v1/responses) → otherwise, 404 APIG.0101.
            const b = (prov?.endpoint ?? '').replace(/\/+$/, '')
            return createOpenAI({ apiKey: key, baseURL: b.endsWith('/v1') ? b : `${b}/v1` }).chat(llm.model)
        }
        default:
            console.log('Invalid provider type', type)
            return null
    }
}

export interface IVisionResult<T> {
    object: T | null       // structured output validated by the schema (null when the model did not produce it)
    text: string           // raw model text (in case it needs inspecting or logging)
    usage?: unknown        // tokens spent (cost)
    error?: string         // message when the call failed
}

type TJsonValue = string | number | boolean | null | TJsonValue[] | { [k: string]: TJsonValue }

export interface IVisionOptions<T> {
    model: LanguageModel
    image: string                                          // data URL, raw base64 or http(s) URL of the image
    prompt: string                                         // user instruction (what to extract)
    schema: z.ZodType<T>                                   // structured output contract (Output.object)
    system?: string
    temperature?: number
    providerOptions?: Record<string, Record<string, TJsonValue>>   // e.g. { google: { structuredOutputs: true } }
    mediaType?: string                                     // e.g. 'image/png' (optional; inferred from a data URL)
}

// Generic MULTIMODAL call: sends an image plus a prompt to an LLM and returns STRUCTURED output validated by
// a Zod schema (the Output.object pattern). Reusable across the whole platform (Iter uses it to extract a map
// from a diagram). It never throws: errors come back in `error`.
export const generateVision = async <T>(opts: IVisionOptions<T>): Promise<IVisionResult<T>> => {
    try {
        const imagePart = opts.mediaType
            ? { type: 'image' as const, image: opts.image, mediaType: opts.mediaType }
            : { type: 'image' as const, image: opts.image }
        console.log('[generateVision] request', {
            modelId: (opts.model as any)?.modelId ?? (opts.model as any)?.model ?? '(unknown)',
            provider: (opts.model as any)?.provider ?? (opts.model as any)?.config?.provider ?? '(unknown)',
            mediaType: opts.mediaType, imageBytes: (opts.image ?? '').length,
            systemLen: (opts.system ?? '').length, providerOptions: opts.providerOptions,
        })
        const { output, text, usage } = await generateText({
            model: opts.model,
            temperature: opts.temperature ?? 0,
            system: opts.system,
            messages: [{
                role: 'user',
                content: [{ type: 'text' as const, text: opts.prompt }, imagePart],
            }],
            output: Output.object({ schema: opts.schema }),
            ...(opts.providerOptions ? { providerOptions: opts.providerOptions } : {}),
        })
        console.log('[generateVision] ok', { hasOutput: output != null, textLen: (text ?? '').length, usage })
        return { object: (output as T | undefined) ?? null, text: text ?? '', usage }
    }
    catch (err) {
        const e = err as any
        const body = typeof e?.responseBody === 'string' ? e.responseBody : (e?.responseBody ? JSON.stringify(e.responseBody) : undefined)
        // Serializes the body that was SENT, truncating long strings (the image base64), so the STRUCTURE
        // of content[] (which fields each part carries) is visible without dumping megabytes.
        const trunc = (o: unknown): string => {
            try { return JSON.stringify(o, (_k, v) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 60)}…[${v.length} chars]` : v)).slice(0, 4000) }
            catch { return String(o) }
        }
        // FULL TRACE of the failed LLM call (URL, status, response body, cause, request).
        console.error('[generateVision] FAILED', {
            name: e?.name, message: e?.message, statusCode: e?.statusCode, url: e?.url,
            responseBody: body, cause: e?.cause?.message ?? e?.cause,
            requestBody: trunc(e?.requestBodyValues),
        })
        const parts = [e?.statusCode, e?.message, e?.url, body].filter(Boolean).map((x: unknown) => String(x))
        return { object: null, text: '', error: parts.join(' | ') || String(err) }
    }
}

export const loadModels = async (providers: ILlmProvider[], log: ILogChannel) => {
    log.logInfo?.('Loading AI models...')
    for (const provider of providers) {
        try {
            const type = provider.type ?? provider.name
            switch (type) {
                case 'deepseek': {
                    const resp = await fetch('https://api.deepseek.com/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'google': {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${provider.key}`)
                    const data = await resp.json() as any
                    provider.models = data.models.map((m: { name: string; displayName: string; description: string }) => ({
                        id: m.name.startsWith('models/') ? m.name.substring(7) : m.name,
                        name: m.displayName,
                        description: m.description,
                        type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'groq': {
                    const resp = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string; active: boolean }) => m.object === 'model' && m.active).map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'openai': {
                    const resp = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'openrouter': {
                    const resp = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.map((m: { id: string; name: string; description: string }) => ({
                        id: m.id, name: m.name, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'mistral': {
                    const resp = await fetch('https://api.mistral.ai/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string; capabilities?: { completion_chat?: boolean } }) => ({
                        id: m.id, name: m.id, description: m.description,
                        type: m.capabilities?.completion_chat === true ? 'text' : 'other'
                    } satisfies ILlmModel))
                    break
                }
                case 'anthropic': {
                    const resp = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': provider.key, 'anthropic-version': '2023-06-01' } })
                    const data = await resp.json() as any
                    provider.models = (data.data ?? []).map((m: { id: string; display_name: string }) => ({
                        id: m.id, name: m.display_name ?? m.id, description: '', type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'openai-compat': {
                    if (!provider.endpoint) {
                        log.logWarning?.(`Provider 'openai-compat' has no endpoint configured — skipping model load`)
                        provider.models = []
                        break
                    }
                    const base = provider.endpoint.replace(/\/+$/, '')
                    const modelsUrl = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`
                    try {
                        const resp = await fetch(modelsUrl, { headers: { Authorization: 'Bearer ' + provider.key } })
                        if (!resp.ok) {
                            log.logWarning?.(`Provider 'openai-compat' /models returned ${resp.status} — models list will be empty`)
                            provider.models = []
                            break
                        }
                        const data = await resp.json() as any
                        provider.models = (data.data ?? data.models ?? []).map((m: { id: string; name?: string; description?: string }) => ({
                            id: m.id, name: m.name ?? m.id, description: m.description ?? '', type: 'text'
                        } satisfies ILlmModel))
                    }
                    catch (err) {
                        log.logWarning?.(`Provider 'openai-compat' failed to load models: ${err} — models list will be empty`)
                        provider.models = []
                    }
                    break
                }
                case 'kwirth':
                    provider.models = [
                        { id: 'alberto-1-flash-gordon-lite', name: 'Alberto model quick response', description: 'Albert #1 model', type: 'text' },
                        { id: 'alberto-1.5-python-forever', name: 'Alberto model legacy frameworks', description: 'Albert Pythoneer', type: 'text' }
                    ]
                    break
                default:
                    log.logWarning?.(`Provider '${provider.name}' has unknown type '${type}', will not be available.`)
            }
            log.logInfo?.(`Provider '${provider.name}' loaded ${provider.models.length} models`)
        }
        catch (err) {
            log.logError?.(`Error loading models from provider '${provider.name}': ${err}`)
        }
    }
}

const inferZod = (value: unknown): z.ZodTypeAny => {
    if (Array.isArray(value))
        return value.length > 0 ? z.array(inferZod(value[0])) : z.array(z.unknown())
    if (typeof value === 'string')  return z.string()
    if (typeof value === 'number')  return z.number()
    if (typeof value === 'boolean') return z.boolean()
    if (value !== null && typeof value === 'object')
        return zodFromExample(value as Record<string, unknown>)
    return z.unknown()
}

// Re-export AI SDK symbols so plugins can use them without bundling the SDK
// The TYPES needed by anyone writing a helper around generateText are re-exported too: without
// LanguageModel and ToolSet a plugin cannot type its own functions and ends up with 'any'.
export { generateText, Output, stepCountIs, tool } from 'ai'
export type { LanguageModel, ToolSet } from 'ai'
export { z } from 'zod'

export const zodFromExample = (example: Record<string, unknown>): z.ZodObject<Record<string, z.ZodTypeAny>> => {
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, value] of Object.entries(example)) {
        shape[key] = inferZod(value)
    }
    return z.object(shape)
}

// ── TOOL SYSTEM ──────────────────────────────────────────────────────────────

// Git host credentials for source investigation (get_source_file). The consumer provisions these (Agora keeps
// them in its own per-channel config); consumers that leave sourceRepos empty can only reach public repos.
export interface ISourceRepoCred {
    host: string                       // e.g. 'github.com', 'gitlab.com', 'gitlab.mycompany.com'
    type: 'github' | 'gitlab'
    token: string
    apiBaseUrl?: string                // on-prem API override (e.g. 'https://gitlab.mycompany.com/api/v4')
}

export interface IToolContext {
    origin: string
    nodes: Map<string, any>
    clusterInfo: any
    clusterMetrics: any[]
    clusterEvents?: any[]   // recent k8s events buffer ({type, obj}), optional for backward compat
    sourceRepos?: ISourceRepoCred[]   // git credentials for get_source_file (optional; Agora provisions them)
    trace: (toolName: string, args: Record<string, unknown>) => void
}

// Parse a repo reference (full URL or 'owner/name'; bare form assumes github.com). Owner keeps GitLab subgroups.
const parseRepoRef = (repo: string): { host: string; projectPath: string } => {
    let host = 'github.com'
    let pathPart = repo.trim()
    const m = pathPart.match(/^(?:git@|https?:\/\/)?([^/:]+)[/:](.+)$/)
    if (m && m[1].includes('.')) { host = m[1]; pathPart = m[2] }
    const projectPath = pathPart.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
    return { host, projectPath }
}

// Fetch one file's raw content at a ref from GitHub or GitLab (cloud or on-prem), using the matching cred.
const fetchSourceFile = async (cred: ISourceRepoCred, projectPath: string, ref: string, path: string): Promise<string> => {
    const cleanPath = path.replace(/^\/+/, '')
    if (cred.type === 'github') {
        const base = cred.apiBaseUrl ?? 'https://api.github.com'
        const url = `${base}/repos/${projectPath}/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${cred.token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'kwirth-agora' } })
        if (!resp.ok) throw new Error(`GitHub ${resp.status} for ${projectPath}/${cleanPath}@${ref}`)
        return await resp.text()
    }
    const base = cred.apiBaseUrl ?? `https://${cred.host}/api/v4`
    const url = `${base}/projects/${encodeURIComponent(projectPath)}/repository/files/${encodeURIComponent(cleanPath)}/raw?ref=${encodeURIComponent(ref)}`
    const resp = await fetch(url, { headers: { 'PRIVATE-TOKEN': cred.token, 'User-Agent': 'kwirth-agora' } })
    if (!resp.ok) throw new Error(`GitLab ${resp.status} for ${projectPath}/${cleanPath}@${ref}`)
    return await resp.text()
}

// EToolEffect now lives in the isomorphic contract (./index): the front end also needs to know what a tool
// does in order to flag it in the selector, and until now it never got there. It is re-exported so that
// whoever imports it from here keeps working.
export { EToolEffect } from './index'

const toolContextStorage = new AsyncLocalStorage<IToolContext>()

export const runWithToolContext = <T>(context: IToolContext, fn: () => Promise<T>): Promise<T> =>
    toolContextStorage.run(context, fn)

const ctx = (): IToolContext => {
    const store = toolContextStorage.getStore()
    if (!store) throw new Error('[common-ai] Tool executed outside runWithToolContext')
    return store
}

function mapToJson(data: any): any {
    if (data instanceof Map) {
        const obj: Record<string, any> = {}
        for (const [key, value] of data.entries()) obj[String(key)] = mapToJson(value)
        return obj
    }
    if (Array.isArray(data)) return data.map(mapToJson)
    if (data !== null && typeof data === 'object') {
        const obj: Record<string, any> = {}
        for (const key of Object.keys(data)) obj[key] = mapToJson(data[key])
        return obj
    }
    return data
}

// Compact, LLM-friendly view of one buffered event ({type, obj}): a CoreV1Event (kind='Event') or an
// object lifecycle change.
const summarizeClusterEvent = (e: any): Record<string, unknown> => {
    const o = e?.obj ?? {}
    if (o.kind === 'Event') {
        return {
            kind: 'Event',
            eventType: o.type,          // Normal | Warning
            reason: o.reason,
            message: o.message,
            involved: o.involvedObject ? { kind: o.involvedObject.kind, name: o.involvedObject.name, namespace: o.involvedObject.namespace } : undefined,
            count: o.count,
            lastTimestamp: o.lastTimestamp ?? o.eventTime
        }
    }
    return {
        changeType: e?.type,            // ADDED | MODIFIED
        kind: o.kind,
        name: o.metadata?.name,
        namespace: o.metadata?.namespace
    }
}

// Best-effort "last modified" of a k8s object: the newest managedFields time (each apply stamps one),
// falling back to creationTimestamp. k8s keeps no explicit lastModified, so this is the closest signal to
// "when did this ConfigMap/Secret last change" — used to correlate a config edit with a crash.
const lastModifiedOf = (meta: any): string | undefined => {
    const times: string[] = (meta?.managedFields ?? []).map((f: any) => f.time).filter(Boolean)
    return times.length ? times.sort()[times.length - 1] : meta?.creationTimestamp
}

// The ConfigMap/Secret references a pod template consumes: envFrom, env.valueFrom, and volumes.
const configRefsOfPodSpec = (spec: any): { kind: 'ConfigMap' | 'Secret'; name: string; via: string }[] => {
    const refs: { kind: 'ConfigMap' | 'Secret'; name: string; via: string }[] = []
    const add = (kind: 'ConfigMap' | 'Secret', name: string | undefined, via: string) => { if (name) refs.push({ kind, name, via }) }
    for (const ct of [...(spec?.containers ?? []), ...(spec?.initContainers ?? [])]) {
        for (const ef of ct.envFrom ?? []) {
            add('ConfigMap', ef.configMapRef?.name, `envFrom(${ct.name})`)
            add('Secret', ef.secretRef?.name, `envFrom(${ct.name})`)
        }
        for (const e of ct.env ?? []) {
            add('ConfigMap', e.valueFrom?.configMapKeyRef?.name, `env ${e.name}`)
            add('Secret', e.valueFrom?.secretKeyRef?.name, `env ${e.name}`)
        }
    }
    for (const v of spec?.volumes ?? []) {
        add('ConfigMap', v.configMap?.name, `volume ${v.name}`)
        add('Secret', v.secret?.secretName, `volume ${v.name}`)
    }
    return refs
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Toolset registry (plan: plans/ai-tools/PLAN.md, S1)
//
// ONE SINGLE DOOR, on purpose: built-in and installed toolsets come in through the SAME function. Had the
// built-in ones taken a privileged path — an import and a push into an array — the day the extension type
// arrived the whole registry would have to be redone, and that is exactly the rework this order avoids.
//
// AND NOTHING REGISTERS ITSELF: a toolset module only EXPORTS its definition, and the host is what registers
// it. Registering on import would turn it into a side effect — load order would start to matter, a foreign
// module could register whatever it liked, and the manager would not know what it holds, so uninstalling
// would be guesswork. This way whoever owns the lifecycle is whoever opens the door.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

// ── What the host lends to a tool ────────────────────────────────────────────────────────────────────
//
// A packaged tool can NOT read the AsyncLocalStorage from here: `ctx()` is private on purpose, and
// exporting it would hand out the entire bag (service account token, senders, webhooks, docker...) to any
// third-party package. Instead the host passes it an `IToolHost` built from what the toolset DECLARED in
// `requires`: whoever does not ask for the cluster does not get the cluster.
//
// ⚠️ This is a FACADE, not Kwirth's insides: what is lent, and under which name, is a choice. `ClusterInfo`
// holds more than twenty API clients besides credentials; what is lent here is three clients and the
// cluster identity. Widening it is a deliberate decision; handing over the whole object would not be.

/** A cluster node, as a tool sees it. Compatible with the core's `INodeInfo`. */
export interface IK8sNodeInfo {
    name: string
    ip: string
    maxPods: number
}

/** Access to Kubernetes (`ECapability.K8S`). */
export interface IK8sCapability {
    /** Cluster name, as Kwirth knows it. */
    name: string
    /** Detected flavour: aks, eks, gke, k3s, k3d… */
    flavour: string
    vcpus: number
    /** Total cluster memory, in bytes. */
    memory: number
    nodes: Map<string, IK8sNodeInfo>
    coreApi: CoreV1Api
    appsApi: AppsV1Api
    networkApi: NetworkingV1Api
}

// A metrics sample, as a tool sees it. This is a FACADE over the core model
// (back/src/providers/metrics/IMetricsModel.ts), not a copy: only the fields that are lent get typed.
// The real model also carries swap, filesystem, network interfaces, processes and the raw metric maps;
// widening this is a deliberate decision, just as with the cluster.

export interface IMetricsPodSample {
    podRef?: { name?: string, namespace?: string }
    cpu?: { usageNanoCores?: number }
    memory?: { workingSetBytes?: number }
}

export interface IMetricsNodeSample {
    name?: string
    timestamp?: number
    summary?: {
        cpu?: { usageNanoCores?: number }
        memory?: { workingSetBytes?: number }
        network?: { rxBytes?: number, txBytes?: number }
        pods?: IMetricsPodSample[]
    }
}

export interface IMetricsSample {
    /** Seconds between readings. Without it, a series of numbers says nothing about how fast time passes. */
    metricsInterval?: number
    cluster: {
        vcpus: number
        memory: number
        /** Percentages, 0-100. */
        cpuUsage: number
        memoryUsage: number
        txmbps: number
        rxmbps: number
    }
    nodes: IMetricsNodeSample[]
}

/** Cluster metrics (`ECapability.METRICS`). */
export interface IMetricsCapability {
    /** Samples the core keeps in memory. The most recent one last. */
    samples: IMetricsSample[]
}

/**
 * One entry of the core's event buffer: the kind of change and the object exactly as it came from the API.
 * `obj` is left generic on purpose — kube Events and objects of any kind fit in there — but typed as an
 * object rather than as `any`: whoever reads it must check `kind` before believing anything.
 */
export interface IClusterEvent {
    /** ADDED | MODIFIED | DELETED for object changes; kube Events travel through here too. */
    type?: string
    obj?: Record<string, any>
}

/** Recent cluster events (`ECapability.EVENTS`). */
export interface IEventsCapability {
    /** Buffer the core keeps accumulating. The most recent one last. */
    recent: IClusterEvent[]
}

/** Source repository credentials (`ECapability.REPOS`). */
export interface IReposCapability {
    creds: ISourceRepoCred[]
}

/**
 * What a tool receives when it runs. Only the capabilities its toolset declared come filled in:
 * a `requires: []` receives nothing but `trace`.
 */
export interface IToolHost {
    /** Records the invocation. NOT a capability: it is always lent, and never declared. */
    trace: (toolName: string, args: Record<string, unknown>) => void
    k8s?: IK8sCapability
    metrics?: IMetricsCapability
    events?: IEventsCapability
    repos?: IReposCapability
}

/** An executable tool: what travels to the front end (IAiToolInfo) plus what it takes to invoke it. */
export interface IAiTool extends IAiToolInfo {
    inputSchema: z.ZodTypeAny
    execute: (args: Record<string, unknown>, host: IToolHost) => Promise<unknown>
}

/** An executable toolset: its descriptor (IAiToolsetInfo) with the real tools inside. */
export interface IAiToolset extends Omit<IAiToolsetInfo, 'tools'> {
    tools: IAiTool[]
}

/**
 * Declares a tool, inferring the type of its arguments FROM its own `inputSchema`.
 *
 * Without this, `execute` receives `Record<string, unknown>` and every tool fills up with
 * `String(args.namespace)` and loose casts: thirty tools like that are thirty places to go wrong in
 * silence, with no help from the compiler. With this, the schema is the single source of truth and `args`
 * arrives typed.
 *
 * The registry still stores the loose type (`IAiTool`): whoever invokes it does not know the schema, and
 * there the check is done by zod at run time, as it should be.
 */
export const defineTool = <S extends z.ZodTypeAny>(definition: {
    name: string
    description: string
    effect: EToolEffect
    sensitivity: EToolSensitivity
    inputSchema: S
    execute: (args: z.infer<S>, host: IToolHost) => Promise<unknown>
}): IAiTool => definition as unknown as IAiTool

const toolsetRegistry = new Map<string, IAiToolset>()

// The ids of the core's built-in toolsets are RESERVED: a third-party `aitoolset` cannot take them.
// Without this rule, installing a foreign toolset called 'k8s-inventory' would force renaming the built-in
// one, and with it would break every grant and every agent configured against it.
const builtInToolsetIds = new Set<string>()

/*
    Who may use each toolset (plan: "The grant in two phases", phase 1).

    ⚠️ The grant lives HERE, in the registry, and not at the call site. If each plugin assembled its own list
    of toolsets it could ask for ones it was never granted: the filter has to sit on the side the plugin does
    not control. The registry is populated by the core, and a third-party package cannot touch it.

    And by default nobody uses it (user's decision, 2026-09-17): installing a toolset leaves it available,
    not granted. Installing `k8s-ops` must not give anyone write access by accident.
*/
const toolsetGrants = new Map<string, Set<string>>()   // toolsetId → invited plugins

export const isBuiltInToolsetId = (id: string): boolean => builtInToolsetIds.has(id)

/** Grants a toolset to a list of plugins. Replaces the previous grant; `[]` takes it away from everyone. */
export const setToolsetGrants = (toolsetId: string, pluginIds: string[]): void => {
    toolsetGrants.set(toolsetId, new Set(pluginIds))
}

/** Who a toolset is granted to. Empty = nobody, which is the default state. */
export const getToolsetGrants = (toolsetId: string): string[] => [...(toolsetGrants.get(toolsetId) ?? [])]

/** Whether THAT plugin may use THAT toolset. */
export const isToolsetGrantedTo = (toolsetId: string, pluginId: string): boolean =>
    toolsetGrants.get(toolsetId)?.has(pluginId) ?? false

/**
 * Registers a toolset. `builtIn` is only used by the core for its own: it marks the id as reserved.
 * Throws if the id is already taken — registering the same id twice is a packaging error, not something
 * to be resolved silently by overwriting the first one.
 */
export const registerToolset = (toolset: IAiToolset, builtIn = false): void => {
    // The reserved id is checked BEFORE the duplicate, and the order matters: a built-in is always
    // registered, so clashing with one ALWAYS yields a duplicate as well. The other way round, whoever
    // installs a foreign toolset would read 'already registered' — which sounds like they installed it
    // twice — instead of learning that the id belongs to the core and cannot be taken.
    if (!builtIn && builtInToolsetIds.has(toolset.id)) throw new Error(`[common-ai] toolset id '${toolset.id}' is reserved by a built-in toolset`)
    if (toolsetRegistry.has(toolset.id)) throw new Error(`[common-ai] toolset '${toolset.id}' already registered`)
    toolsetRegistry.set(toolset.id, toolset)
    if (builtIn) builtInToolsetIds.add(toolset.id)
}

/** Removes a toolset from the registry (uninstall). Built-in ones are never removed. */
export const unregisterToolset = (id: string): boolean => {
    if (builtInToolsetIds.has(id)) return false
    // The grant goes with the toolset: leaving it orphaned would make reinstalling resurrect permissions
    // nobody has granted again.
    toolsetGrants.delete(id)
    return toolsetRegistry.delete(id)
}

export const getToolset = (id: string): IAiToolset | undefined => toolsetRegistry.get(id)

export const listToolsets = (): IAiToolset[] => [...toolsetRegistry.values()]

/** What is sent to the front end: the descriptors, without inputSchema or execute. */
export const listToolsetInfos = (): IAiToolsetInfo[] =>
    listToolsets().map(t => ({
        id: t.id,
        version: t.version,
        displayName: t.displayName,
        description: t.description,
        requires: t.requires,
        tools: t.tools.map(x => ({ name: x.name, description: x.description, effect: x.effect, sensitivity: x.sensitivity }))
    }))

/**
 * Builds a toolset's host from the core context, provisioning ONLY what was declared.
 *
 * Doing the handing-out here and not at each call site is what makes the `ECapability` promise keepable:
 * if every site assembled its own object, one of them being too generous would be enough for the
 * declaration to stop meaning anything.
 */
export const buildToolHost = (requires: ECapability[], context: IToolContext): IToolHost => {
    const host: IToolHost = { trace: context.trace }
    const ci = context.clusterInfo
    // No cluster means no cluster capability, even when declared: better that the tool receives
    // 'undefined' and says so, than handing it a half-built facade that fails from the inside.
    if (requires.includes(ECapability.K8S) && ci) {
        host.k8s = {
            name: ci.name,
            flavour: ci.flavour,
            vcpus: ci.vcpus,
            memory: ci.memory,
            nodes: context.nodes as Map<string, IK8sNodeInfo>,
            coreApi: ci.coreApi,
            appsApi: ci.appsApi,
            networkApi: ci.networkApi
        }
    }
    if (requires.includes(ECapability.METRICS)) host.metrics = { samples: (context.clusterMetrics ?? []) as IMetricsSample[] }
    if (requires.includes(ECapability.EVENTS)) host.events = { recent: (context.clusterEvents ?? []) as IClusterEvent[] }
    if (requires.includes(ECapability.REPOS)) host.repos = { creds: context.sourceRepos ?? [] }
    return host
}

/**
 * Invokes a tool by its qualified reference. A single invocation path for built-in and installed alike,
 * with the host built according to the `requires` of ITS toolset.
 */
export const invokeToolRef = async (ref: string, args: Record<string, unknown>, context: IToolContext): Promise<unknown> => {
    const resolved = resolveToolRef(ref)
    if (!resolved) throw new Error(`[common-ai] unknown tool '${ref}'`)
    return resolved.tool.execute(args, buildToolHost(resolved.toolset.requires, context))
}

/** Resolves a qualified reference '<toolset>/<tool>' against the registry. */
export const resolveToolRef = (ref: string): { toolset: IAiToolset, tool: IAiTool } | undefined => {
    const parsed = parseToolRef(ref)
    if (!parsed) return undefined
    const toolset = toolsetRegistry.get(parsed.toolsetId)
    const tool = toolset?.tools.find(t => t.name === parsed.toolName)
    return toolset && tool ? { toolset, tool } : undefined
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Resolving tools for a client (plan: plans/ai-tools/PLAN.md, S2)
//
// From "these toolsets, in this order" to "these tools, ready for the LLM". A single path, with its two
// hooks: authorise before and observe after. Permissive for now — S4 and S6 fill them in — but the place
// already exists, which is what stops each plugin from inventing its own.
//
// ⚠️ PRECEDENCE (user's decision, 2026-09-17). Two toolsets may carry a tool with the same name and
// NEITHER gets renamed: the order of `activeToolsets` decides. The name the model sees is always the short
// one, because providers only accept [a-zA-Z0-9_-] and a qualified reference ('toolset/tool') would not
// pass that filter.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A tool that IS offered to the model. */
export interface IEffectiveTool {
    /** The short name: what travels to the LLM. */
    name: string
    /** The qualified reference: what gets persisted. */
    ref: string
    toolsetId: string
    tool: IAiTool
}

/** A tool that exists but is NOT offered, because a toolset with higher precedence carries that name. */
export interface IShadowedTool {
    name: string
    ref: string
    toolsetId: string
    /** Who shadows it. The editor must say so: otherwise turning this one off looks like it does something. */
    shadowedBy: string
}

export interface IToolResolution {
    effective: IEffectiveTool[]
    shadowed: IShadowedTool[]
    /** Assigned toolsets that are not registered (uninstalled, or never installed). */
    missing: string[]
    /**
     * Toolsets that ARE installed but have not been granted to this plugin.
     *
     * Reported apart from `missing` on purpose: "it is not installed" the admin fixes by installing it, and
     * "it has not been granted to you" the admin fixes by granting it. Lumping them together sends the admin
     * looking in the wrong place.
     */
    notGranted: string[]
}

/**
 * Applies a client's ceiling over the registry. Pure: it neither executes nor touches the context, so the
 * editor can call it to DRAW exactly what is going to run.
 *
 * A disabled tool does not shadow: what gets disabled is a concrete reference ('ts1/td'), not a name, so if
 * `ts1/td` is off and `ts2` carries another `td`, the one from `ts2` surfaces.
 */
export const resolveTools = (config: IToolsetConfig, requesterId?: string): IToolResolution => {
    const disabled = new Set(config.disabledTools)
    const effective: IEffectiveTool[] = []
    const shadowed: IShadowedTool[] = []
    const missing: string[] = []
    const notGranted: string[] = []
    const taken = new Map<string, string>()   // short name → toolset serving it

    for (const toolsetId of config.activeToolsets) {
        const toolset = toolsetRegistry.get(toolsetId)
        if (!toolset) {
            // It does not stay quiet: a ceiling naming something that is not installed is a broken config,
            // and without this the symptom would be "the agent answers worse" with nobody knowing why.
            missing.push(toolsetId)
            continue
        }
        // The grant is checked HERE and not supplied by the caller: a plugin cannot grant itself what the
        // admin never gave it. Without `requesterId` nothing is filtered — that is the core resolving in
        // order to DRAW (the editor), not to execute.
        if (requesterId !== undefined && !isToolsetGrantedTo(toolsetId, requesterId)) {
            notGranted.push(toolsetId)
            continue
        }
        for (const tool of toolset.tools) {
            const ref = toolRef(toolsetId, tool.name)
            if (disabled.has(ref)) continue
            const owner = taken.get(tool.name)
            if (owner) {
                shadowed.push({ name: tool.name, ref, toolsetId, shadowedBy: owner })
                continue
            }
            taken.set(tool.name, toolsetId)
            effective.push({ name: tool.name, ref, toolsetId, tool })
        }
    }
    return { effective, shadowed, missing, notGranted }
}

/** One concrete invocation, as the two hooks see it. */
export interface IToolInvocation {
    ref: string
    toolsetId: string
    toolName: string
    args: Record<string, unknown>
}

export interface IToolAuthorization {
    allowed: boolean
    /** Why not. It travels to the model, so it is written so the model can decide otherwise. */
    reason?: string
}

/** How an invocation ended. `ms` included: a slow tool is a problem even when it returns correctly. */
export interface IToolOutcome {
    ok: boolean
    result?: unknown
    error?: string
    ms: number
    /** Whether it never ran at all, because of the authorisation hook. */
    denied?: boolean
}

export interface IAgentToolHooks {
    /** BEFORE running. With no hook, everything is allowed: today the ceiling is the selection (S4 fills it). */
    authorize?: (invocation: IToolInvocation, tool: IAiTool) => IToolAuthorization | Promise<IToolAuthorization>
    /** AFTER, whatever happened. It cannot break the invocation (S6 fills it). */
    observe?: (invocation: IToolInvocation, outcome: IToolOutcome) => void
}

/**
 * The tools ready to hand to the AI SDK, already resolved by precedence and with both hooks in place.
 * The object key is the SHORT name, which is the only thing the provider accepts.
 */
export const buildAgentTools = (
    config: IToolsetConfig,
    context: IToolContext,
    hooks: IAgentToolHooks = {},
    /**
     * Who is asking for the tools. Without it nothing is filtered by grant, so a plugin MUST pass its id:
     * that is what stops it from serving itself a toolset it was never granted.
     */
    requesterId?: string
): ToolSet => {
    const { effective } = resolveTools(config, requesterId)
    const entries = effective.map(e => {
        const invocationOf = (args: Record<string, unknown>): IToolInvocation =>
            ({ ref: e.ref, toolsetId: e.toolsetId, toolName: e.name, args })

        // ⚠️ A PLAIN object, not `dynamicTool`. It looks equivalent and it is not:
        //     tool(t)        => t                            (types only, touches nothing)
        //     dynamicTool(t) => { ...t, type: 'dynamic' }     (marks the tool at RUNTIME)
        // A tool marked as dynamic is handled by the SDK through another path, and with `Output.object` the
        // run ends in AI_NoOutputGeneratedError: the tool executes, returns, and the structured response is
        // never generated. `dynamicTool` was used to dodge a typing friction — the `tool()` helper infers
        // `never` with a generic ZodTypeAny — and the price was a change in behaviour. The cast is the
        // honest way: what the SDK needs is exactly this object.
        return [e.name, {
            description: e.tool.description,
            inputSchema: e.tool.inputSchema,
            execute: async (rawArgs: unknown) => {
                const args = (rawArgs ?? {}) as Record<string, unknown>
                const invocation = invocationOf(args)
                const started = Date.now()

                const verdict = hooks.authorize ? await hooks.authorize(invocation, e.tool) : { allowed: true }
                if (!verdict.allowed) {
                    // Returned as DATA, not as an exception: an exception cuts the conversation short, and
                    // what we want is for the model to learn that route is closed and try another.
                    const denial = { error: `tool '${e.name}' not allowed${verdict.reason ? `: ${verdict.reason}` : ''}` }
                    hooks.observe?.(invocation, { ok: false, error: denial.error, ms: Date.now() - started, denied: true })
                    return denial
                }

                const host = buildToolHost(getToolset(e.toolsetId)?.requires ?? [], context)
                try {
                    // runWithToolContext also wraps the tools written against the OLD contract (the ones
                    // that read ctx()). That is what lets the 43 be migrated package by package in S3,
                    // instead of having to rewrite them all before this path can be used at all.
                    const result = await runWithToolContext(context, () => e.tool.execute(args, host))
                    hooks.observe?.(invocation, { ok: true, result, ms: Date.now() - started })
                    return result
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err)
                    hooks.observe?.(invocation, { ok: false, error: message, ms: Date.now() - started })
                    return { error: message }
                }
            }
        } as unknown as Tool] as const
    })
    return Object.fromEntries(entries)
}

// ── AGENT ENGINE ─────────────────────────────────────────────────────────────
//
// The 43 tools used to live here, compiled into the core, together with their catalogue
// (`toolInfoList`), the `selectAgentToolNames` filter and the `runAgent` engine. They were removed on
// 2026-09-26: tools are now `aitoolset` extensions that are installed and granted, and the equivalent
// engine is `buildAgentTools` + `resolveTools`, a few hundred lines above.
//
// All that survives of that path is the SHAPE of the result, which does have consumers.

export interface IAgentRunResult {
    text: string
    inputTokens: number
    outputTokens: number
    steps: number
    toolCalls: string[]
}
