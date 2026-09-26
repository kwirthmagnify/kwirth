import { ILlm, ILlmModel, ILlmProvider, IAgent, ECapability, EToolEffect, EToolSensitivity, IAiToolInfo, IAiToolsetInfo, IToolsetConfig, parseToolRef, toolRef } from './index'
// TYPES ONLY: the compiler erases them, so common-ai does not drag the Kubernetes client (~6.6 MB) into
// any bundle. That is why @kubernetes/client-node is an optional peer and not a dependency.
import type { AppsV1Api, CoreV1Api, NetworkingV1Api } from '@kubernetes/client-node'

interface ILogChannel {
    logInfo?: (msg: string) => void
    logWarning?: (msg: string) => void
    logError?: (msg: string) => void
}
import { LanguageModel, tool, Tool, ToolSet, generateText, stepCountIs, Output } from 'ai'
import { z } from 'zod'
import { AsyncLocalStorage } from 'async_hooks'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as tls from 'tls'

const execAsync = promisify(exec)
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

export interface IToolInfo {
    name: string
    description: string
    effect: EToolEffect
}

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

export const tools = {

    // ── CLUSTER CONFIG ───────────────────────────────────────────────────────

    list_namespaces: tool({
        description: 'Lists all namespaces in the cluster with their status and labels.',
        inputSchema: z.object({}),
        execute: async () => {
            ctx().trace('list_namespaces', {})
            try {
                const resp = await ctx().clusterInfo.coreApi.listNamespace()
                return {
                    namespaces: resp.items.map((ns: any) => ({
                        name: ns.metadata?.name,
                        uid: ns.metadata?.uid,
                        status: ns.status?.phase,
                        labels: ns.metadata?.labels ?? {}
                    }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_node_data: tool({
        description: 'Returns configuration info about all Kubernetes nodes (name, IP). Configuration only — not workload or usage data.',
        inputSchema: z.object({}),
        execute: async () => { ctx().trace('get_node_data', {}); return mapToJson(ctx().nodes) }
    }),

    get_cluster_data: tool({
        description: 'Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status.',
        inputSchema: z.object({}),
        execute: async () => {
            ctx().trace('get_cluster_data', {})
            try {
                const resp = await ctx().clusterInfo.coreApi.listNode()
                return { name: ctx().clusterInfo.name, flavour: ctx().clusterInfo.flavour, vcpus: ctx().clusterInfo.vcpus, memoryGB: Math.round(ctx().clusterInfo.memory / 1024 / 1024 / 1024 * 100) / 100, nodeCount: resp.items.length, nodes: resp.items.map((n: any) => ({ name: n.metadata?.name, cpu: n.status?.capacity?.['cpu'], memoryKi: n.status?.capacity?.['memory'], ready: n.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True', unschedulable: n.spec?.unschedulable ?? false })) }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_workload_data: tool({
        description: 'Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace.',
        inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
        execute: async ({ namespace }) => {
            const ns = namespace && namespace !== '*' ? namespace : undefined
            ctx().trace('get_workload_data', { namespace: ns ?? '*' })
            try {
                const c = ctx().clusterInfo
                const [d, s, ds, p, svc] = await Promise.all([
                    ns ? c.appsApi.listNamespacedDeployment({ namespace: ns }) : c.appsApi.listDeploymentForAllNamespaces(),
                    ns ? c.appsApi.listNamespacedStatefulSet({ namespace: ns }) : c.appsApi.listStatefulSetForAllNamespaces(),
                    ns ? c.appsApi.listNamespacedDaemonSet({ namespace: ns }) : c.appsApi.listDaemonSetForAllNamespaces(),
                    ns ? c.coreApi.listNamespacedPod({ namespace: ns }) : c.coreApi.listPodForAllNamespaces(),
                    ns ? c.coreApi.listNamespacedService({ namespace: ns }) : c.coreApi.listServiceForAllNamespaces()
                ])
                return {
                    deployments: d.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0, availableReplicas: x.status?.availableReplicas ?? 0 })),
                    statefulSets: s.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0 })),
                    daemonSets: ds.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, desired: x.status?.desiredNumberScheduled, ready: x.status?.numberReady })),
                    pods: p.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, nodeName: x.spec?.nodeName, phase: x.status?.phase, ready: x.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' })),
                    services: svc.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, type: x.spec?.type, clusterIP: x.spec?.clusterIP }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_space_data: tool({
        description: 'Describes a Kubernetes namespace (equivalent to kubectl describe namespace + a rollup): its status and labels, ResourceQuota usage (used vs hard) and LimitRange defaults, plus the resources in it — pods (with restart count), deployments, services and configmap names.',
        inputSchema: z.object({ namespace: z.string().describe('Name of the namespace to retrieve data for') }),
        execute: async ({ namespace }) => {
            ctx().trace('get_space_data', { namespace })
            try {
                const c = ctx().clusterInfo
                // ns/quota/limits are best-effort: a missing RBAC for them must not hide the core namespace rollup.
                const [ns, p, d, s, cm, rq, lr] = await Promise.all([
                    c.coreApi.readNamespace({ name: namespace }).catch(() => null),
                    c.coreApi.listNamespacedPod({ namespace }),
                    c.appsApi.listNamespacedDeployment({ namespace }),
                    c.coreApi.listNamespacedService({ namespace }),
                    c.coreApi.listNamespacedConfigMap({ namespace }),
                    c.coreApi.listNamespacedResourceQuota({ namespace }).catch(() => ({ items: [] as any[] })),
                    c.coreApi.listNamespacedLimitRange({ namespace }).catch(() => ({ items: [] as any[] }))
                ])
                return {
                    namespace,
                    status: (ns as any)?.status?.phase,
                    labels: (ns as any)?.metadata?.labels ?? {},
                    resourceQuotas: (rq as any).items.map((q: any) => ({ name: q.metadata?.name, hard: q.status?.hard ?? q.spec?.hard ?? {}, used: q.status?.used ?? {} })),
                    limitRanges: (lr as any).items.map((l: any) => ({ name: l.metadata?.name, limits: l.spec?.limits ?? [] })),
                    pods: p.items.map((x: any) => ({ name: x.metadata?.name, phase: x.status?.phase, nodeName: x.spec?.nodeName, ready: x.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True', restartCount: x.status?.containerStatuses?.reduce((sum: number, cs: any) => sum + cs.restartCount, 0) ?? 0 })),
                    deployments: d.items.map((x: any) => ({ name: x.metadata?.name, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0, image: x.spec?.template?.spec?.containers?.[0]?.image })),
                    services: s.items.map((x: any) => ({ name: x.metadata?.name, type: x.spec?.type, clusterIP: x.spec?.clusterIP })),
                    configMaps: cm.items.map((x: any) => x.metadata?.name)
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_namespace_yaml: tool({
        description: 'Returns the full Kubernetes Namespace manifest (equivalent to kubectl get namespace -o yaml): complete metadata (uid, labels, annotations, creationTimestamp), spec (finalizers) and status. Use when you need a specific field the namespace summary doesn\'t include (e.g. its uid).',
        inputSchema: z.object({ name: z.string().describe('Name of the namespace') }),
        execute: async ({ name }) => {
            ctx().trace('get_namespace_yaml', { name })
            try { return await ctx().clusterInfo.coreApi.readNamespace({ name }) }
            catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    describe_service: tool({
        description: 'Diagnostic summary of a Service (equivalent to kubectl describe service): type, clusterIP, ports, selector, sessionAffinity, external/loadBalancer, AND its live Endpoints — the pod IPs currently backing it (ready vs not-ready). Best tool to see WHY traffic isn\'t reaching pods (empty/not-ready endpoints = selector mismatch or unready pods).',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the service'),
            name: z.string().describe('Name of the service')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('describe_service', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const svc: any = await c.coreApi.readNamespacedService({ name, namespace })
                const ep: any = await c.coreApi.readNamespacedEndpoints({ name, namespace }).catch(() => null)
                const endpoints = (ep?.subsets ?? []).flatMap((ss: any) => [
                    ...(ss.addresses ?? []).map((a: any) => ({ ip: a.ip, ready: true, targetRef: a.targetRef ? `${a.targetRef.kind}/${a.targetRef.name}` : undefined, ports: (ss.ports ?? []).map((p: any) => p.port) })),
                    ...(ss.notReadyAddresses ?? []).map((a: any) => ({ ip: a.ip, ready: false, targetRef: a.targetRef ? `${a.targetRef.kind}/${a.targetRef.name}` : undefined, ports: (ss.ports ?? []).map((p: any) => p.port) }))
                ])
                return {
                    name, namespace,
                    type: svc.spec?.type, clusterIP: svc.spec?.clusterIP, externalIPs: svc.spec?.externalIPs ?? [],
                    loadBalancer: svc.status?.loadBalancer?.ingress ?? [], sessionAffinity: svc.spec?.sessionAffinity,
                    selector: svc.spec?.selector ?? {},
                    ports: svc.spec?.ports?.map((p: any) => ({ name: p.name, port: p.port, targetPort: p.targetPort, nodePort: p.nodePort, protocol: p.protocol })) ?? [],
                    endpoints,   // the pods actually behind the service right now (empty = nothing serving)
                    endpointCount: endpoints.length
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    describe_ingress: tool({
        description: 'Diagnostic summary of an Ingress (equivalent to kubectl describe ingress): ingressClass, the routing rules (host → path → backend service:port), the default backend, TLS (hosts + secret), and the load-balancer address assigned by the controller. Use to see how external traffic is routed to services.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the ingress'),
            name: z.string().describe('Name of the ingress')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('describe_ingress', { namespace, name })
            try {
                const ing: any = await ctx().clusterInfo.networkApi.readNamespacedIngress({ name, namespace })
                const backend = (b: any) => b?.service ? `${b.service.name}:${b.service.port?.number ?? b.service.port?.name}` : (b?.resource ? `${b.resource.kind}/${b.resource.name}` : undefined)
                return {
                    name, namespace,
                    ingressClass: ing.spec?.ingressClassName,
                    defaultBackend: backend(ing.spec?.defaultBackend),
                    rules: (ing.spec?.rules ?? []).flatMap((r: any) => (r.http?.paths ?? []).map((p: any) => ({ host: r.host, path: p.path, pathType: p.pathType, backend: backend(p.backend) }))),
                    tls: (ing.spec?.tls ?? []).map((t: any) => ({ hosts: t.hosts, secretName: t.secretName })),
                    loadBalancer: ing.status?.loadBalancer?.ingress ?? []
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    describe_controller: tool({
        description: 'Diagnostic summary of a workload controller (equivalent to kubectl describe deployment/statefulset/daemonset/replicaset): replica counts (desired/ready/available/updated), rollout strategy, conditions (Available/Progressing + reason — why it is not fully rolled out), selector, and its pod template (image, resources, probes). Parametrised by kind, so one call covers any controller type.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the controller'),
            kind: z.enum(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet']).describe('Controller kind'),
            name: z.string().describe('Name of the controller')
        }),
        execute: async ({ namespace, kind, name }) => {
            ctx().trace('describe_controller', { namespace, kind, name })
            try {
                const a = ctx().clusterInfo.appsApi
                const obj: any = kind === 'StatefulSet' ? await a.readNamespacedStatefulSet({ name, namespace })
                    : kind === 'DaemonSet' ? await a.readNamespacedDaemonSet({ name, namespace })
                    : kind === 'ReplicaSet' ? await a.readNamespacedReplicaSet({ name, namespace })
                    : await a.readNamespacedDeployment({ name, namespace })
                const spec = obj.spec ?? {}, status = obj.status ?? {}
                const tpl = spec.template?.spec ?? {}
                const container = (ct: any) => ({ name: ct.name, image: ct.image, resources: ct.resources, livenessProbe: !!ct.livenessProbe, readinessProbe: !!ct.readinessProbe })
                // DaemonSet reports scheduling counts; the others report replica counts.
                const replicas = kind === 'DaemonSet'
                    ? { desired: status.desiredNumberScheduled, current: status.currentNumberScheduled, ready: status.numberReady, available: status.numberAvailable, updated: status.updatedNumberScheduled }
                    : { desired: spec.replicas, ready: status.readyReplicas ?? 0, available: status.availableReplicas ?? 0, updated: status.updatedReplicas ?? 0 }
                return {
                    kind, name, namespace,
                    replicas,
                    strategy: spec.strategy?.type ?? spec.updateStrategy?.type,
                    conditions: (status.conditions ?? []).map((c: any) => ({ type: c.type, status: c.status, reason: c.reason, message: c.message })),
                    selector: spec.selector?.matchLabels ?? {},
                    template: { containers: (tpl.containers ?? []).map(container), initContainers: (tpl.initContainers ?? []).map(container), serviceAccount: tpl.serviceAccountName }
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_service_yaml: tool({
        description: 'Returns the full Kubernetes Service manifest (equivalent to kubectl get service -o yaml) for a given namespace and service name.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace where the service lives'),
            name: z.string().describe('Name of the service')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_service_yaml', { namespace, name })
            try {
                const svc = await ctx().clusterInfo.coreApi.readNamespacedService({ name, namespace })
                return svc
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    list_services: tool({
        description: 'Lists all Services in the cluster with full details (type, clusterIP, ports, selector). Optionally filter by namespace.',
        inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
        execute: async ({ namespace }) => {
            const ns = namespace && namespace !== '*' ? namespace : undefined
            ctx().trace('list_services', { namespace: ns ?? '*' })
            try {
                const c = ctx().clusterInfo
                const resp = ns
                    ? await c.coreApi.listNamespacedService({ namespace: ns })
                    : await c.coreApi.listServiceForAllNamespaces()
                return {
                    services: resp.items.map((x: any) => ({
                        name: x.metadata?.name,
                        namespace: x.metadata?.namespace,
                        type: x.spec?.type,
                        clusterIP: x.spec?.clusterIP,
                        externalIPs: x.spec?.externalIPs ?? [],
                        ports: x.spec?.ports?.map((p: any) => ({ name: p.name, port: p.port, targetPort: p.targetPort, protocol: p.protocol })) ?? [],
                        selector: x.spec?.selector ?? {}
                    }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    list_ingresses: tool({
        description: 'Lists all Ingresses in the cluster (hosts, paths, TLS, backend services). Optionally filter by namespace.',
        inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
        execute: async ({ namespace }) => {
            const ns = namespace && namespace !== '*' ? namespace : undefined
            ctx().trace('list_ingresses', { namespace: ns ?? '*' })
            try {
                const c = ctx().clusterInfo
                const resp = ns
                    ? await c.networkApi.listNamespacedIngress({ namespace: ns })
                    : await c.networkApi.listIngressForAllNamespaces()
                return {
                    ingresses: resp.items.map((x: any) => ({
                        name: x.metadata?.name,
                        namespace: x.metadata?.namespace,
                        ingressClass: x.spec?.ingressClassName,
                        hosts: x.spec?.rules?.map((r: any) => r.host) ?? [],
                        paths: x.spec?.rules?.flatMap((r: any) =>
                            r.http?.paths?.map((p: any) => ({ host: r.host, path: p.path, pathType: p.pathType, service: p.backend?.service?.name, port: p.backend?.service?.port?.number })) ?? []
                        ) ?? [],
                        tls: x.spec?.tls?.map((t: any) => ({ secretName: t.secretName, hosts: t.hosts })) ?? [],
                        loadBalancer: x.status?.loadBalancer?.ingress ?? []
                    }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_ingress_yaml: tool({
        description: 'Returns the full Kubernetes Ingress manifest (equivalent to kubectl get ingress -o yaml) for a given namespace and ingress name.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace where the ingress lives'),
            name: z.string().describe('Name of the ingress')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_ingress_yaml', { namespace, name })
            try {
                const ing = await ctx().clusterInfo.networkApi.readNamespacedIngress({ name, namespace })
                return ing
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    // ── CURRENT USAGE ────────────────────────────────────────────────────────

    get_cluster_usage: tool({
        description: 'Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB.',
        inputSchema: z.object({}),
        execute: async () => {
            ctx().trace('get_cluster_usage', {})
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            const latest = ctx().clusterMetrics[ctx().clusterMetrics.length - 1]
            return { vcpus: latest.cluster.vcpus, memoryGB: Math.round(latest.cluster.memory / 1024 / 1024 / 1024 * 100) / 100, cpuUsagePercent: Math.round(latest.cluster.cpuUsage * 100) / 100, memoryUsagePercent: Math.round(latest.cluster.memoryUsage * 100) / 100, networkTxMbps: Math.round(latest.cluster.txmbps * 100) / 100, networkRxMbps: Math.round(latest.cluster.rxmbps * 100) / 100, metricsIntervalSeconds: latest.metricsInterval }
        }
    }),

    get_node_usage: tool({
        description: 'Returns current CPU and memory usage for one node or all nodes from the latest metrics reading.',
        inputSchema: z.object({ nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)') }),
        execute: async ({ nodeName }) => {
            ctx().trace('get_node_usage', { nodeName: nodeName ?? '*' })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            const latest = ctx().clusterMetrics[ctx().clusterMetrics.length - 1]
            const nodes = nodeName ? latest.nodes.filter((n: any) => n.name === nodeName) : latest.nodes
            return nodes.map((n: any) => ({ name: n.name, cpuMillicores: Math.round((n.summary?.cpu?.usageNanoCores ?? 0) / 1_000_000), memoryMB: Math.round((n.summary?.memory?.workingSetBytes ?? 0) / 1024 / 1024), networkRxMB: Math.round((n.summary?.network?.rxBytes ?? 0) / 1024 / 1024), networkTxMB: Math.round((n.summary?.network?.txBytes ?? 0) / 1024 / 1024), podCount: n.summary?.pods?.length ?? 0, timestamp: n.timestamp }))
        }
    }),

    get_deployment_usage: tool({
        description: 'Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_deployment_usage', { namespace, name })
            try {
                if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                const latest = ctx().clusterMetrics[ctx().clusterMetrics.length - 1]
                const c = ctx().clusterInfo
                const deployResp = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const labelSelector = Object.entries(deployResp.spec?.selector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
                const podsResp = await c.coreApi.listNamespacedPod({ namespace, labelSelector })
                const podNames = new Set(podsResp.items.map((p: any) => p.metadata?.name))
                let totalCpu = 0, totalMem = 0, podCount = 0
                for (const node of latest.nodes) for (const pod of (node.summary?.pods ?? [])) if (pod.podRef?.namespace === namespace && podNames.has(pod.podRef?.name)) { totalCpu += pod.cpu?.usageNanoCores ?? 0; totalMem += pod.memory?.workingSetBytes ?? 0; podCount++ }
                return { deployment: name, namespace, podCount, cpuMillicores: Math.round(totalCpu / 1_000_000), memoryMB: Math.round(totalMem / 1024 / 1024), timestamp: latest.nodes[0]?.timestamp }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    // ── HISTORICAL USAGE ─────────────────────────────────────────────────────

    get_prev_cluster_usage: tool({
        description: 'Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps).',
        inputSchema: z.object({ count: z.number().optional().describe('Number of historical readings to return (default: 5)') }),
        execute: async ({ count = 5 }) => {
            ctx().trace('get_prev_cluster_usage', { count })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            return ctx().clusterMetrics.slice(-count).map((r: any) => ({ vcpus: r.cluster.vcpus, memoryGB: Math.round(r.cluster.memory / 1024 / 1024 / 1024 * 100) / 100, cpuUsagePercent: Math.round(r.cluster.cpuUsage * 100) / 100, memoryUsagePercent: Math.round(r.cluster.memoryUsage * 100) / 100, networkTxMbps: Math.round(r.cluster.txmbps * 100) / 100, networkRxMbps: Math.round(r.cluster.rxmbps * 100) / 100 }))
        }
    }),

    get_prev_node_usage: tool({
        description: 'Returns historical CPU and memory usage for one or all nodes over the last N metrics readings.',
        inputSchema: z.object({ nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)'), count: z.number().optional().describe('Number of historical readings (default: 5)') }),
        execute: async ({ nodeName, count = 5 }) => {
            ctx().trace('get_prev_node_usage', { nodeName: nodeName ?? '*', count })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            return ctx().clusterMetrics.slice(-count).map((r: any) => ({ nodes: (nodeName ? r.nodes.filter((n: any) => n.name === nodeName) : r.nodes).map((n: any) => ({ name: n.name, cpuMillicores: Math.round((n.summary?.cpu?.usageNanoCores ?? 0) / 1_000_000), memoryMB: Math.round((n.summary?.memory?.workingSetBytes ?? 0) / 1024 / 1024), timestamp: n.timestamp })) }))
        }
    }),

    get_prev_deployment_usage: tool({
        description: 'Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment'), count: z.number().optional().describe('Number of historical readings (default: 5)') }),
        execute: async ({ namespace, name, count = 5 }) => {
            ctx().trace('get_prev_deployment_usage', { namespace, name, count })
            try {
                if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                const c = ctx().clusterInfo
                const deployResp = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const labelSelector = Object.entries(deployResp.spec?.selector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
                const podsResp = await c.coreApi.listNamespacedPod({ namespace, labelSelector })
                const podNames = new Set(podsResp.items.map((p: any) => p.metadata?.name))
                return ctx().clusterMetrics.slice(-count).map((r: any) => { let cpu = 0, mem = 0, pc = 0; for (const node of r.nodes) for (const pod of (node.summary?.pods ?? [])) if (pod.podRef?.namespace === namespace && podNames.has(pod.podRef?.name)) { cpu += pod.cpu?.usageNanoCores ?? 0; mem += pod.memory?.workingSetBytes ?? 0; pc++ } return { deployment: name, namespace, podCount: pc, cpuMillicores: Math.round(cpu / 1_000_000), memoryMB: Math.round(mem / 1024 / 1024), timestamp: r.nodes[0]?.timestamp } })
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_prev_space_data: tool({
        description: 'Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace name'), count: z.number().optional().describe('Number of historical readings (default: 5)') }),
        execute: async ({ namespace, count = 5 }) => {
            ctx().trace('get_prev_space_data', { namespace, count })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            return ctx().clusterMetrics.slice(-count).map((r: any) => { let cpu = 0, mem = 0, pc = 0; for (const node of r.nodes) for (const pod of (node.summary?.pods ?? [])) if (pod.podRef?.namespace === namespace) { cpu += pod.cpu?.usageNanoCores ?? 0; mem += pod.memory?.workingSetBytes ?? 0; pc++ } return { namespace, podCount: pc, cpuMillicores: Math.round(cpu / 1_000_000), memoryMB: Math.round(mem / 1024 / 1024), timestamp: r.nodes[0]?.timestamp } })
        }
    }),

    // ── CLUSTER ACTIONS ──────────────────────────────────────────────────────

    add_node: tool({
        description: 'Adds a new agent node to the cluster. For k3d uses `k3d node create`. Cloud providers not yet implemented.',
        inputSchema: z.object({ nodeName: z.string().optional().describe('Suffix for the new node name'), nodePoolName: z.string().optional().describe('Node pool name (cloud provider specific, ignored for k3d)') }),
        execute: async ({ nodeName, nodePoolName }) => {
            ctx().trace('add_node', { nodeName: nodeName ?? 'auto', nodePoolName: nodePoolName ?? 'default' })
            if (ctx().clusterInfo.flavour === 'k3d') {
                const suffix = nodeName ?? `agent-${Date.now()}`
                const clusterName = ctx().clusterInfo.name.replace(/^k3d-/, '')
                try { const { stdout, stderr } = await execAsync(`k3d node create ${suffix} --cluster ${clusterName} --role agent`, { timeout: 120000 }); return { success: true, message: `Node '${suffix}' added to cluster '${clusterName}'`, stdout, stderr } }
                catch (err: any) { return { success: false, error: err.message ?? String(err) } }
            }
            return { success: false, message: `add_node not yet implemented for flavour '${ctx().clusterInfo.flavour}'` }
        }
    }),

    remove_node: tool({
        description: 'Removes a node from the cluster (cordon + delete). For k3d uses `k3d node delete`. Cloud providers not yet implemented.',
        inputSchema: z.object({ nodeName: z.string().describe('Name of the Kubernetes node to remove'), nodePoolName: z.string().optional().describe('Node pool name (cloud provider specific, ignored for k3d)') }),
        execute: async ({ nodeName, nodePoolName }) => {
            ctx().trace('remove_node', { nodeName, nodePoolName: nodePoolName ?? 'default' })
            try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: true }] }) } catch (_) {}
            if (ctx().clusterInfo.flavour === 'k3d') {
                try { const { stdout, stderr } = await execAsync(`k3d node delete ${nodeName}`, { timeout: 60000 }); return { success: true, message: `Node '${nodeName}' removed`, stdout, stderr } }
                catch (err: any) { return { success: false, error: err.message ?? String(err) } }
            }
            return { success: false, message: `remove_node not yet implemented for flavour '${ctx().clusterInfo.flavour}'` }
        }
    }),

    stop_node: tool({
        description: 'Stops a running cluster node: cordons it then stops the container. For k3d uses `k3d node stop`.',
        inputSchema: z.object({ nodeName: z.string().describe('Name of the Kubernetes node to stop') }),
        execute: async ({ nodeName }) => {
            ctx().trace('stop_node', { nodeName })
            try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: true }] }) }
            catch (err: any) { return { success: false, error: `Failed to cordon node: ${err.message ?? String(err)}` } }
            if (ctx().clusterInfo.flavour !== 'k3d') return { success: false, message: `Node '${nodeName}' cordoned but stop only implemented for k3d` }
            try { const { stdout, stderr } = await execAsync(`k3d node stop ${nodeName}`, { timeout: 30000 }); return { success: true, message: `Node '${nodeName}' cordoned and stopped`, stdout, stderr } }
            catch (err: any) { return { success: false, error: `Node cordoned but stop failed: ${err.message ?? String(err)}` } }
        }
    }),

    start_node: tool({
        description: 'Starts a previously stopped cluster node and uncordons it. For k3d uses `k3d node start`.',
        inputSchema: z.object({ nodeName: z.string().describe('Name of the Kubernetes node to start') }),
        execute: async ({ nodeName }) => {
            ctx().trace('start_node', { nodeName })
            if (ctx().clusterInfo.flavour === 'k3d') {
                try {
                    const { stdout, stderr } = await execAsync(`k3d node start ${nodeName}`, { timeout: 30000 })
                    try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: false }] }) } catch (_) {}
                    return { success: true, message: `Node '${nodeName}' started and uncordoned`, stdout, stderr }
                } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
            }
            try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: false }] }); return { success: false, message: `Node '${nodeName}' uncordoned but start only implemented for k3d` } }
            catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    add_replica: tool({
        description: 'Scales up a deployment by adding one replica.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('add_replica', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const d = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const cur = d.spec?.replicas ?? 1
                await c.appsApi.patchNamespacedDeployment({ name, namespace, body: [{ op: 'replace', path: '/spec/replicas', value: cur + 1 }] })
                return { success: true, message: `Deployment ${namespace}/${name} scaled from ${cur} to ${cur + 1} replicas` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    remove_replica: tool({
        description: 'Scales down a deployment by removing one replica. Minimum of 1 replica is enforced.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('remove_replica', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const d = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const cur = d.spec?.replicas ?? 1
                if (cur <= 1) return { success: false, message: `Deployment ${namespace}/${name} already at minimum` }
                await c.appsApi.patchNamespacedDeployment({ name, namespace, body: [{ op: 'replace', path: '/spec/replicas', value: cur - 1 }] })
                return { success: true, message: `Deployment ${namespace}/${name} scaled from ${cur} to ${cur - 1} replicas` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    restart_deployment: tool({
        description: 'Rollout-restarts a deployment (equivalent to `kubectl rollout restart`): recreates its pods gracefully, respecting the rolling-update strategy, by stamping the kubectl.kubernetes.io/restartedAt annotation on the pod template. Restarts a workload WITHOUT changing its spec — recover stuck/crashing pods or pick up a changed ConfigMap/Secret. Preferred over delete_pod for a whole workload.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('restart_deployment', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const d = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const restartedAt = new Date().toISOString()
                // Merge (not replace) the existing template annotations, then `add` the whole map: `add` on an
                // existing path replaces it and on a missing path creates it, so it is safe whether or not the
                // pod template already had annotations.
                const annotations = { ...(d.spec?.template?.metadata?.annotations ?? {}), 'kubectl.kubernetes.io/restartedAt': restartedAt }
                await c.appsApi.patchNamespacedDeployment({ name, namespace, body: [{ op: 'add', path: '/spec/template/metadata/annotations', value: annotations }] })
                return { success: true, message: `Deployment ${namespace}/${name} rollout-restarted at ${restartedAt}` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    delete_pod: tool({
        description: 'Deletes a single pod (equivalent to `kubectl delete pod`). Its controller (Deployment/StatefulSet/DaemonSet) recreates it — a surgical way to restart ONE stuck or misbehaving pod. Does not respect a rolling update; for a whole workload prefer restart_deployment.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the pod'), name: z.string().describe('Name of the pod') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('delete_pod', { namespace, name })
            try {
                await ctx().clusterInfo.coreApi.deleteNamespacedPod({ name, namespace })
                return { success: true, message: `Pod ${namespace}/${name} deleted; its controller will recreate it` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    // ── MISC ─────────────────────────────────────────────────────────────────

    times_two: tool({
        description: 'Multiplies a number by two.',
        inputSchema: z.object({ data: z.number() }),
        execute: async ({ data }) => { ctx().trace('times_two', { data }); return data * 2 }
    }),

    father_of: tool({
        description: 'Returns the name of the father of a person.',
        inputSchema: z.object({ data: z.string().describe('The name of the person whose father you want to discover') }),
        execute: async ({ data }) => { ctx().trace('father_of', { data }); return 'Julio' }
    }),

    get_certificate_info: tool({
        description: 'Connects to a hostname via HTTPS and returns TLS certificate details: subject, issuer, validity dates, SANs, fingerprint and whether it is currently valid.',
        inputSchema: z.object({ hostname: z.string().describe('DNS name or IP to connect to'), port: z.number().optional().describe('Port to connect to (default: 443)') }),
        execute: async ({ hostname, port }) => {
            ctx().trace('get_certificate_info', { hostname, port })
            const targetPort = port ?? 443
            return new Promise((resolve) => {
                const socket = tls.connect({ host: hostname, port: targetPort, servername: hostname, rejectUnauthorized: false }, () => {
                    try {
                        const cert = socket.getPeerCertificate(false)
                        socket.end()
                        if (!cert || !Object.keys(cert).length) return resolve({ error: 'No certificate returned' })
                        const now = Date.now()
                        const validFrom = new Date(cert.valid_from)
                        const validTo = new Date(cert.valid_to)
                        resolve({ subject: cert.subject, issuer: cert.issuer, validFrom: cert.valid_from, validTo: cert.valid_to, daysUntilExpiry: Math.floor((validTo.getTime() - now) / 86400000), isCurrentlyValid: now >= validFrom.getTime() && now <= validTo.getTime(), subjectAltNames: cert.subjectaltname ?? null, fingerprint: cert.fingerprint, serialNumber: cert.serialNumber, protocol: socket.getProtocol() })
                    } catch (err: any) { socket.end(); resolve({ error: err.message ?? String(err) }) }
                })
                socket.setTimeout(5000, () => { socket.destroy(); resolve({ error: 'Connection timed out' }) })
                socket.on('error', (err) => resolve({ error: err.message }))
            })
        }
    }),

    // ── EVENTS (from the cluster events buffer in ctx().clusterEvents) ──────────

    get_cluster_events: tool({
        description: 'Returns recent Kubernetes events buffered for this cluster: kube Events (warnings like crashloops/OOM/failed scheduling) and object lifecycle changes. Optionally filter to warnings only or by namespace.',
        inputSchema: z.object({
            warningsOnly: z.boolean().optional().describe('Only Warning-type kube Events'),
            namespace: z.string().optional().describe('Filter by namespace'),
            limit: z.number().optional().describe('Max events to return (default 50)')
        }),
        execute: async ({ warningsOnly, namespace, limit = 50 }) => {
            ctx().trace('get_cluster_events', { warningsOnly: !!warningsOnly, namespace: namespace ?? '*', limit })
            let evs = ctx().clusterEvents ?? []
            if (warningsOnly) evs = evs.filter(e => e?.obj?.kind === 'Event' && e.obj.type === 'Warning')
            if (namespace) evs = evs.filter(e => (e?.obj?.metadata?.namespace ?? e?.obj?.involvedObject?.namespace) === namespace)
            return { count: evs.length, events: evs.slice(-limit).map(summarizeClusterEvent) }
        }
    }),

    get_object_events: tool({
        description: 'Returns recent events for a specific Kubernetes object (by namespace and name): its lifecycle changes and related kube Events (via involvedObject).',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the object'),
            name: z.string().describe('Name of the object')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_object_events', { namespace, name })
            const evs = (ctx().clusterEvents ?? []).filter(e => {
                const o = e?.obj ?? {}
                const isObj = o.metadata?.namespace === namespace && o.metadata?.name === name
                const isInvolved = o.involvedObject?.namespace === namespace && o.involvedObject?.name === name
                return isObj || isInvolved
            })
            return { count: evs.length, events: evs.map(summarizeClusterEvent) }
        }
    }),

    // ── POD DIAGNOSIS ────────────────────────────────────────────────────────

    get_pod_logs: tool({
        description: 'Returns recent container logs for a pod (equivalent to kubectl logs). For a crashing pod (CrashLoopBackOff) pass previous:true to read the CRASHED container instance logs — that is where the root cause usually is (the events only say it is restarting, not why).',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the pod'),
            name: z.string().describe('Name of the pod'),
            container: z.string().optional().describe('Container name (omit to use the pod default / first container)'),
            previous: z.boolean().optional().describe('Read the previous (crashed/restarted) container instance logs — key for CrashLoopBackOff'),
            tailLines: z.number().optional().describe('How many trailing lines to return (default 200)')
        }),
        execute: async ({ namespace, name, container, previous, tailLines = 200 }) => {
            ctx().trace('get_pod_logs', { namespace, name, container: container ?? '(default)', previous: !!previous, tailLines })
            try {
                const raw = await ctx().clusterInfo.coreApi.readNamespacedPodLog({ name, namespace, container, previous: !!previous, tailLines })
                const text: string = typeof raw === 'string' ? raw : (raw?.body ?? JSON.stringify(raw))
                const truncated = text.length > 15000
                return { namespace, name, container: container ?? null, previous: !!previous, truncated, logs: truncated ? text.slice(-15000) : text }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    describe_pod: tool({
        description: 'Returns a diagnostic summary of a pod (equivalent to kubectl describe pod): phase, conditions, and per-container status — waiting reason (CrashLoopBackOff/ImagePullBackOff…), last termination reason + exitCode (137=OOMKilled, 1=app error, 143=SIGTERM), restart count, image, resources and probes. Best first step to categorize a pod failure.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the pod'),
            name: z.string().describe('Name of the pod')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('describe_pod', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const pod: any = await c.coreApi.readNamespacedPod({ name, namespace })
                const spec = pod.spec ?? {}, status = pod.status ?? {}
                // image = the tag (spec); imageID = the resolved digest (catches a mutable tag repushed with a broken build).
                const containerStatus = (cs: any) => ({
                    name: cs.name, image: cs.image, imageID: cs.imageID, ready: cs.ready, restartCount: cs.restartCount,
                    state: cs.state?.waiting ? { waiting: { reason: cs.state.waiting.reason, message: cs.state.waiting.message } }
                        : cs.state?.terminated ? { terminated: { reason: cs.state.terminated.reason, exitCode: cs.state.terminated.exitCode } }
                        : cs.state?.running ? { running: { startedAt: cs.state.running.startedAt } } : cs.state,
                    lastTerminated: cs.lastState?.terminated ? { reason: cs.lastState.terminated.reason, exitCode: cs.lastState.terminated.exitCode, signal: cs.lastState.terminated.signal, finishedAt: cs.lastState.terminated.finishedAt } : undefined
                })
                const specContainer = (ct: any) => ({ name: ct.name, image: ct.image, resources: ct.resources, livenessProbe: !!ct.livenessProbe, readinessProbe: !!ct.readinessProbe, startupProbe: !!ct.startupProbe })
                // Resolve the owning controller (pod → ReplicaSet → Deployment) so the bot can call get_rollout_history directly.
                let controlledBy: any = undefined
                const podOwner = (pod.metadata?.ownerReferences ?? [])[0]
                if (podOwner?.kind === 'ReplicaSet') {
                    try {
                        const rs: any = await c.appsApi.readNamespacedReplicaSet({ name: podOwner.name, namespace })
                        const rsOwner = (rs.metadata?.ownerReferences ?? [])[0]
                        controlledBy = rsOwner ? { kind: rsOwner.kind, name: rsOwner.name } : { kind: 'ReplicaSet', name: podOwner.name }
                    } catch { controlledBy = { kind: 'ReplicaSet', name: podOwner.name } }
                }
                else if (podOwner) {
                    controlledBy = { kind: podOwner.kind, name: podOwner.name }   // StatefulSet/DaemonSet/Job own pods directly
                }
                // Source provenance: OCI standard annotations (org.opencontainers.image.*) with a kwirth.io fallback →
                // the repo + commit the image was built from, so the bot can read the actual source (get_source_file).
                const ann = pod.metadata?.annotations ?? {}
                const sourceRepo = ann['org.opencontainers.image.source'] ?? ann['kwirth.io/source-repo']
                const source = sourceRepo ? { repo: sourceRepo, revision: ann['org.opencontainers.image.revision'] ?? ann['kwirth.io/source-ref'] } : undefined
                return {
                    name, namespace, phase: status.phase, node: spec.nodeName, startTime: status.startTime, reason: status.reason, message: status.message,
                    controlledBy,   // e.g. { kind: 'Deployment', name: 'montag-agent' } → feed to get_rollout_history
                    source,         // { repo, revision } from image annotations → feed to get_source_file

                    conditions: (status.conditions ?? []).map((c: any) => ({ type: c.type, status: c.status, reason: c.reason })),
                    containers: (status.containerStatuses ?? []).map(containerStatus),
                    initContainers: (status.initContainerStatuses ?? []).map(containerStatus),
                    spec: { containers: (spec.containers ?? []).map(specContainer), restartPolicy: spec.restartPolicy }
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_pod_yaml: tool({
        description: 'Returns the full Kubernetes Pod manifest (equivalent to kubectl get pod -o yaml): complete spec (env, volumes, resources, probes) and status. Use for deeper misconfiguration analysis after describe_pod.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the pod'),
            name: z.string().describe('Name of the pod')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_pod_yaml', { namespace, name })
            try { return await ctx().clusterInfo.coreApi.readNamespacedPod({ name, namespace }) }
            catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_deployment_yaml: tool({
        description: 'Returns the full Kubernetes Deployment manifest (equivalent to kubectl get deployment -o yaml): the pod template (image, env, resources, probes) and strategy. Use to check if a pod problem comes from the owning workload spec.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the deployment'),
            name: z.string().describe('Name of the deployment')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_deployment_yaml', { namespace, name })
            try { return await ctx().clusterInfo.appsApi.readNamespacedDeployment({ name, namespace }) }
            catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_controller_yaml: tool({
        description: 'Returns the full manifest of a workload controller (equivalent to kubectl get <kind> -o yaml), for ANY kind — Deployment, StatefulSet, DaemonSet or ReplicaSet. Complete metadata (uid, labels, annotations), spec (pod template, strategy) and status. Use when you need a specific field the describe summary doesn\'t include.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the controller'),
            kind: z.enum(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet']).describe('Controller kind'),
            name: z.string().describe('Name of the controller')
        }),
        execute: async ({ namespace, kind, name }) => {
            ctx().trace('get_controller_yaml', { namespace, kind, name })
            try {
                const a = ctx().clusterInfo.appsApi
                return kind === 'StatefulSet' ? await a.readNamespacedStatefulSet({ name, namespace })
                    : kind === 'DaemonSet' ? await a.readNamespacedDaemonSet({ name, namespace })
                    : kind === 'ReplicaSet' ? await a.readNamespacedReplicaSet({ name, namespace })
                    : await a.readNamespacedDeployment({ name, namespace })
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_rollout_history: tool({
        description: 'Returns the rollout history (revisions) of a Deployment via its ReplicaSets: per revision the image(s), replicas and pod-template summary (env with inline VALUES and their configMap/secret source, resources, command). Use to see WHAT CHANGED recently — a new image tag, a changed inline env value, a resource/command change — that may have broken the pods. Compare the newest revision against the previous one. NOTE: a change to a ConfigMap/Secret VALUE does NOT create a revision — use get_workload_config_refs for that.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the deployment'),
            name: z.string().describe('Name of the Deployment (the owning workload, e.g. describe_pod.controlledBy.name — NOT the pod name)')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_rollout_history', { namespace, name })
            try {
                const rsList = await ctx().clusterInfo.appsApi.listNamespacedReplicaSet({ namespace })
                const owned = (rsList.items ?? []).filter((rs: any) =>
                    (rs.metadata?.ownerReferences ?? []).some((o: any) => o.kind === 'Deployment' && o.name === name))
                // env: inline value + where a valueFrom env is sourced (so the LLM can both diff inline values
                // across revisions AND know which vars come from a ConfigMap/Secret to check separately).
                const envSource = (e: any): string | undefined =>
                    e.valueFrom?.configMapKeyRef ? `configMap:${e.valueFrom.configMapKeyRef.name}/${e.valueFrom.configMapKeyRef.key}`
                        : e.valueFrom?.secretKeyRef ? `secret:${e.valueFrom.secretKeyRef.name}/${e.valueFrom.secretKeyRef.key}`
                            : e.valueFrom?.fieldRef ? `field:${e.valueFrom.fieldRef.fieldPath}`
                                : undefined
                const container = (ct: any) => ({ name: ct.name, image: ct.image, command: ct.command, args: ct.args, resources: ct.resources, env: (ct.env ?? []).map((e: any) => ({ name: e.name, value: e.value, from: envSource(e) })) })
                const revisions = owned.map((rs: any) => {
                    const tmpl = rs.spec?.template?.spec ?? {}
                    return {
                        revision: Number(rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? 0),
                        replicaSet: rs.metadata?.name,
                        createdAt: rs.metadata?.creationTimestamp,
                        replicas: rs.spec?.replicas ?? 0,
                        readyReplicas: rs.status?.readyReplicas ?? 0,
                        containers: (tmpl.containers ?? []).map(container),
                        serviceAccount: tmpl.serviceAccountName,
                        securityContext: tmpl.securityContext
                    }
                }).sort((a: any, b: any) => b.revision - a.revision)   // newest first
                return { deployment: name, namespace, revisionCount: revisions.length, revisions }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_configmap: tool({
        description: 'Returns a ConfigMap\'s data (key → value) plus metadata (resourceVersion, lastModified). Use to inspect the ACTUAL config a workload consumes and to check whether it changed recently — a ConfigMap value change (same env var, different value) does NOT create a Deployment revision, so it is invisible to get_rollout_history.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the ConfigMap'),
            name: z.string().describe('Name of the ConfigMap')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_configmap', { namespace, name })
            try {
                const cm: any = await ctx().clusterInfo.coreApi.readNamespacedConfigMap({ name, namespace })
                return { name, namespace, resourceVersion: cm.metadata?.resourceVersion, lastModified: lastModifiedOf(cm.metadata), data: cm.data ?? {}, binaryDataKeys: Object.keys(cm.binaryData ?? {}) }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_secret: tool({
        description: 'Returns a Secret\'s KEYS, type and metadata (resourceVersion, lastModified) — VALUES ARE REDACTED (never returned). Use to check whether a Secret a workload consumes changed recently (a value change does NOT create a Deployment revision) and which keys it holds. You cannot read the secret values.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the Secret'),
            name: z.string().describe('Name of the Secret')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_secret', { namespace, name })
            try {
                const s: any = await ctx().clusterInfo.coreApi.readNamespacedSecret({ name, namespace })
                return { name, namespace, type: s.type, resourceVersion: s.metadata?.resourceVersion, lastModified: lastModifiedOf(s.metadata), keys: Object.keys(s.data ?? {}) }   // values intentionally omitted
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_workload_config_refs: tool({
        description: 'Given a Deployment, lists the ConfigMaps and Secrets its pods consume (via envFrom, env valueFrom, and volumes), each with its lastModified time and resourceVersion. Use on a crash to find a config source that CHANGED WITHOUT A ROLLOUT: editing a ConfigMap/Secret value keeps the same env spec (no new revision) yet can break the pod — compare each ref\'s lastModified against when the pods started crashing, then read the changed one with get_configmap / get_secret.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the deployment'),
            name: z.string().describe('Name of the Deployment (e.g. describe_pod.controlledBy.name)')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_workload_config_refs', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const dep: any = await c.appsApi.readNamespacedDeployment({ name, namespace })
                // dedupe by kind+name, merging the reasons (an object may be referenced several ways)
                const byKey = new Map<string, { kind: string; name: string; via: string[] }>()
                for (const r of configRefsOfPodSpec(dep.spec?.template?.spec)) {
                    const cur = byKey.get(`${r.kind}/${r.name}`) ?? { kind: r.kind, name: r.name, via: [] }
                    if (!cur.via.includes(r.via)) cur.via.push(r.via)
                    byKey.set(`${r.kind}/${r.name}`, cur)
                }
                const refs = await Promise.all([...byKey.values()].map(async r => {
                    try {
                        const meta: any = (r.kind === 'ConfigMap'
                            ? await c.coreApi.readNamespacedConfigMap({ name: r.name, namespace })
                            : await c.coreApi.readNamespacedSecret({ name: r.name, namespace })).metadata
                        return { ...r, resourceVersion: meta?.resourceVersion, lastModified: lastModifiedOf(meta) }
                    } catch (err: any) { return { ...r, error: err.message ?? String(err) } }
                }))
                return { deployment: name, namespace, refs }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_source_file: tool({
        description: 'Fetches the contents of a single source file from a Git repository (GitHub or GitLab) at a specific ref. Use to inspect the actual source behind a crash: read the stack-trace file:line from the logs, then fetch that file at the image build revision (describe_pod.source). Call repeatedly to follow the trace across files until you find the bug.',
        inputSchema: z.object({
            repo: z.string().describe('Repository URL or owner/name (e.g. https://github.com/org/app or org/app) — from describe_pod.source.repo'),
            ref: z.string().describe('Commit SHA, branch or tag — use the build revision (describe_pod.source.revision) so you read the code actually running'),
            path: z.string().describe('File path within the repo (e.g. src/regex/loader.go)')
        }),
        execute: async ({ repo, ref, path }) => {
            ctx().trace('get_source_file', { repo, ref, path })
            try {
                const { host, projectPath } = parseRepoRef(repo)
                const cred = (ctx().sourceRepos ?? []).find(r => r.host === host)
                if (!cred) return { error: `No source-repo credentials configured for host '${host}'. Add it in Agora → Source repos.` }
                const text = await fetchSourceFile(cred, projectPath, ref, path)
                const truncated = text.length > 20000
                return { repo: projectPath, ref, path, truncated, content: truncated ? text.slice(0, 20000) : text }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

} as const

export const toolInfoList: IToolInfo[] = [
    { name: 'list_namespaces',           effect: EToolEffect.READ,  description: 'Lists all namespaces in the cluster with their status and labels.' },
    { name: 'get_node_data',             effect: EToolEffect.READ,  description: 'Returns configuration info about all Kubernetes nodes (name, IP). Configuration only — not workload or usage data.' },
    { name: 'get_cluster_data',          effect: EToolEffect.READ,  description: 'Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status.' },
    { name: 'get_workload_data',         effect: EToolEffect.READ,  description: 'Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace.' },
    { name: 'get_space_data',            effect: EToolEffect.READ,  description: 'Describes a namespace (kubectl describe namespace + rollup): status/labels, ResourceQuota (used vs hard), LimitRange, plus its pods (restart count), deployments, services and configmaps.' },
    { name: 'get_namespace_yaml',        effect: EToolEffect.READ,  description: 'Full Namespace manifest (kubectl get namespace -o yaml): complete metadata (uid, labels, annotations, creationTimestamp), spec and status — for any field the summary omits (e.g. its uid).' },
    { name: 'get_service_yaml',          effect: EToolEffect.READ,  description: 'Returns the full Kubernetes Service manifest (equivalent to kubectl get service -o yaml) for a given namespace and service name.' },
    { name: 'describe_service',          effect: EToolEffect.READ,  description: 'Diagnostic summary of a Service (kubectl describe service): type/clusterIP/ports/selector + its live Endpoints (the pod IPs backing it, ready vs not) — see why traffic isn\'t reaching pods.' },
    { name: 'list_services',             effect: EToolEffect.READ,  description: 'Lists all Services in the cluster with full details (type, clusterIP, ports, selector). Optionally filter by namespace.' },
    { name: 'list_ingresses',            effect: EToolEffect.READ,  description: 'Lists all Ingresses in the cluster (hosts, paths, TLS, backend services). Optionally filter by namespace.' },
    { name: 'get_ingress_yaml',          effect: EToolEffect.READ,  description: 'Returns the full Kubernetes Ingress manifest (equivalent to kubectl get ingress -o yaml) for a given namespace and ingress name.' },
    { name: 'describe_ingress',          effect: EToolEffect.READ,  description: 'Diagnostic summary of an Ingress (kubectl describe ingress): ingressClass, rules (host → path → backend service:port), default backend, TLS, and the load-balancer address.' },
    { name: 'get_cluster_usage',         effect: EToolEffect.READ,  description: 'Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB.' },
    { name: 'get_node_usage',            effect: EToolEffect.READ,  description: 'Returns current CPU and memory usage for one node or all nodes from the latest metrics reading.' },
    { name: 'get_deployment_usage',      effect: EToolEffect.READ,  description: 'Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment.' },
    { name: 'get_prev_cluster_usage',    effect: EToolEffect.READ,  description: 'Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps).' },
    { name: 'get_prev_node_usage',       effect: EToolEffect.READ,  description: 'Returns historical CPU and memory usage for one or all nodes over the last N metrics readings.' },
    { name: 'get_prev_deployment_usage', effect: EToolEffect.READ,  description: 'Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings.' },
    { name: 'get_prev_space_data',       effect: EToolEffect.READ,  description: 'Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings.' },
    { name: 'add_node',                  effect: EToolEffect.WRITE, description: 'Adds a new agent node to the cluster. For k3d uses `k3d node create`. Cloud providers not yet implemented.' },
    { name: 'remove_node',               effect: EToolEffect.WRITE, description: 'Removes a node from the cluster (cordon + delete). For k3d uses `k3d node delete`. Cloud providers not yet implemented.' },
    { name: 'stop_node',                 effect: EToolEffect.WRITE, description: 'Stops a running cluster node: cordons it then stops the container. For k3d uses `k3d node stop`.' },
    { name: 'start_node',                effect: EToolEffect.WRITE, description: 'Starts a previously stopped cluster node and uncordons it. For k3d uses `k3d node start`.' },
    { name: 'add_replica',               effect: EToolEffect.WRITE, description: 'Scales up a deployment by adding one replica.' },
    { name: 'remove_replica',            effect: EToolEffect.WRITE, description: 'Scales down a deployment by removing one replica. Minimum of 1 replica is enforced.' },
    { name: 'restart_deployment',        effect: EToolEffect.WRITE, description: 'Rollout-restarts a deployment (recreates its pods gracefully via the restartedAt annotation, respecting the rolling update) — restart a workload without changing its spec.' },
    { name: 'delete_pod',                effect: EToolEffect.WRITE, description: 'Deletes a single pod; its controller recreates it. Surgical restart of one stuck pod (no rolling update — prefer restart_deployment for a whole workload).' },
    { name: 'times_two',                 effect: EToolEffect.READ,  description: 'Multiplies a number by two.' },
    { name: 'father_of',                 effect: EToolEffect.READ,  description: 'Returns the name of the father of a person.' },
    { name: 'get_certificate_info',      effect: EToolEffect.READ,  description: 'Connects to a hostname via HTTPS and returns TLS certificate details: subject, issuer, validity dates, SANs, fingerprint and whether it is currently valid.' },
    { name: 'get_cluster_events',        effect: EToolEffect.READ,  description: 'Returns recent buffered Kubernetes events for this cluster (warnings + object lifecycle changes); filter by warnings only or namespace.' },
    { name: 'get_object_events',         effect: EToolEffect.READ,  description: 'Returns recent events for a specific Kubernetes object (namespace + name), including related kube Events.' },
    { name: 'get_pod_logs',              effect: EToolEffect.READ,  description: 'Returns container logs for a pod (kubectl logs); previous:true reads the crashed instance logs — the root cause of a CrashLoopBackOff.' },
    { name: 'describe_pod',              effect: EToolEffect.READ,  description: 'Diagnostic summary of a pod (kubectl describe pod): per-container waiting/terminated reason + exitCode (OOMKilled/CrashLoop…), restart count, probes.' },
    { name: 'get_pod_yaml',              effect: EToolEffect.READ,  description: 'Full Pod manifest (kubectl get pod -o yaml): spec (env, volumes, resources, probes) and status.' },
    { name: 'get_deployment_yaml',       effect: EToolEffect.READ,  description: 'Full Deployment manifest (kubectl get deployment -o yaml): pod template (image, env, resources, probes) and strategy.' },
    { name: 'describe_controller',       effect: EToolEffect.READ,  description: 'Diagnostic summary of a workload controller (kubectl describe deployment/statefulset/daemonset/replicaset): replica counts (desired/ready/available/updated), strategy, conditions (why not rolled out), selector, pod template. Parametrised by kind.' },
    { name: 'get_controller_yaml',       effect: EToolEffect.READ,  description: 'Full manifest of any workload controller (kubectl get <kind> -o yaml): Deployment/StatefulSet/DaemonSet/ReplicaSet — complete metadata (uid, annotations), spec and status. Parametrised by kind, for any field the describe omits.' },
    { name: 'get_rollout_history',       effect: EToolEffect.READ,  description: 'Rollout revisions of a Deployment (via ReplicaSets): image + template per revision (env with inline values + configMap/secret source), to see what changed (new image/env/resource) that may have broken the pods.' },
    { name: 'get_configmap',             effect: EToolEffect.READ,  description: 'A ConfigMap\'s data (key→value) + lastModified. A ConfigMap value change does NOT create a rollout revision, so check it for a crash with no deployment change.' },
    { name: 'get_secret',                effect: EToolEffect.READ,  description: 'A Secret\'s keys + type + lastModified (VALUES REDACTED). Check whether a consumed Secret changed recently (no rollout revision is created by a value change).' },
    { name: 'get_workload_config_refs',  effect: EToolEffect.READ,  description: 'The ConfigMaps/Secrets a Deployment consumes (envFrom/valueFrom/volumes) with each one\'s lastModified — find a config source that changed WITHOUT a rollout and broke the pods.' },
    { name: 'get_source_file',           effect: EToolEffect.READ,  description: 'Fetches a file from a Git repo (GitHub/GitLab) at a ref — inspect the source behind a crash by following the stack trace to the offending file:line.' },
]

// ── AGENT ENGINE ─────────────────────────────────────────────────────────────

export interface IAgentRunResult {
    text: string
    inputTokens: number
    outputTokens: number
    steps: number
    toolCalls: string[]
}

// Resolves the tool names an agent may use: autoTools = full catalog, otherwise its own list
// (intersected with the catalog); readOnly filters out WRITE-effect tools. Pure (no LLM) → unit-testable.
export const selectAgentToolNames = (agent: IAgent): string[] => {
    const writeNames = new Set(toolInfoList.filter(t => t.effect === EToolEffect.WRITE).map(t => t.name))
    const catalogNames = toolInfoList.map(t => t.name)
    const wanted = agent.autoTools ? catalogNames : agent.tools.filter(n => catalogNames.includes(n))
    return wanted.filter(n => !(agent.readOnly && writeNames.has(n)))
}

// Runs an IAgent: resolves its LLM, selects/filters its tools (readOnly drops WRITE-effect tools) and
// invokes the model within the k8s tool context. Wraps the existing engine (buildModel + generateText +
// runWithToolContext) — factors the pattern pinocchio does by hand, reusable by Agora/pinocchio/defender.
// No providerOptions here: pinocchio's are for structured output; a chat/tool agent returns free text.
export const runAgent = async (
    agent: IAgent,
    prompt: string,
    llms: ILlm[],
    providers: ILlmProvider[],
    context: IToolContext
): Promise<IAgentRunResult> => {
    const llm = llms.find(l => l.id === agent.llm)
    if (!llm) throw new Error(`[common-ai] runAgent: llm '${agent.llm}' not found`)
    const model = buildModel(llm, providers)
    if (!model) throw new Error(`[common-ai] runAgent: could not build model for llm '${agent.llm}'`)

    const allowed = new Set(selectAgentToolNames(agent))
    const selectedTools = Object.fromEntries(Object.entries(tools).filter(([n]) => allowed.has(n)))

    const result = await runWithToolContext(context, () => generateText({
        model,
        temperature: llm.temperature,
        stopWhen: stepCountIs(agent.steps || 15),
        tools: selectedTools,
        system: agent.system,
        prompt
    }))

    const toolCalls: string[] = []
    for (const step of (result.steps ?? [])) {
        const s = step as unknown as { toolCalls?: { toolName: string }[] }
        for (const call of (s.toolCalls ?? [])) toolCalls.push(call.toolName)
    }
    return {
        text: result.text,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        steps: result.steps?.length ?? 0,
        toolCalls
    }
}
