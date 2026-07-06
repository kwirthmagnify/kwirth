import express, { Request, Response } from 'express'
import { KwirthData, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'

// ─── Public config types ───────────────────────────────────────────────────────

export type OtelSignal = 'traces' | 'metrics' | 'logs'

/**
 * Maps one or more OTel signals to a space name.
 * 'services' is an optional whitelist filtering by the resource attribute 'service.name'.
 */
export interface IOtelSpaceMapping {
    name: string
    signals: OtelSignal[]
    services?: string[]
}

/**
 * Config passed by a channel when subscribing to this provider.
 *
 * Example — one space receiving all signals, another only critical logs from a specific service:
 *   {
 *     spaces: [
 *       { name: 'observability', signals: ['traces', 'metrics', 'logs'] },
 *       { name: 'alerts',        signals: ['logs'], services: ['payment-service'] }
 *     ]
 *   }
 *
 * OTel exporters must point to:
 *   http://<kwirth-host>:<port>/provider/otlp/v1/traces
 *   http://<kwirth-host>:<port>/provider/otlp/v1/metrics
 *   http://<kwirth-host>:<port>/provider/otlp/v1/logs
 *
 * Supported encoding: OTLP/HTTP JSON (Content-Type: application/json).
 * OTLP/HTTP protobuf (application/x-protobuf) is not supported in this version.
 */
export interface IOtelProviderConfig {
    spaces: IOtelSpaceMapping[]
}

// ─── Normalized event types ────────────────────────────────────────────────────

export interface IOtelTraceEvent {
    signal: 'trace'
    resource: Record<string, unknown>
    scope: { name: string; version?: string }
    spans: Array<{
        traceId: string
        spanId: string
        parentSpanId?: string
        traceState?: string
        name: string
        kind: number
        startTime: string       // ISO from nanoseconds
        endTime: string
        durationMs: number
        attributes: Record<string, unknown>
        status: { code: number; message?: string }
        events: Array<{ time: string; name: string; attributes: Record<string, unknown> }>
        links: Array<{ traceId: string; spanId: string; attributes: Record<string, unknown> }>
    }>
}

export interface IOtelMetricDataPoint {
    startTime?: string
    time?: string
    attributes: Record<string, unknown>
    value?: number
    count?: number
    sum?: number
    bucketCounts?: number[]
    explicitBounds?: number[]
}

export interface IOtelMetricEvent {
    signal: 'metric'
    resource: Record<string, unknown>
    scope: { name: string; version?: string }
    metrics: Array<{
        name: string
        description?: string
        unit?: string
        type: 'gauge' | 'sum' | 'histogram' | 'exponentialHistogram' | 'summary' | 'unknown'
        isMonotonic?: boolean
        aggregationTemporality?: number
        dataPoints: IOtelMetricDataPoint[]
    }>
}

export interface IOtelLogEvent {
    signal: 'log'
    resource: Record<string, unknown>
    scope: { name: string; version?: string }
    records: Array<{
        timestamp?: string
        observedTimestamp?: string
        severityNumber?: number
        severityText?: string
        body?: unknown
        attributes: Record<string, unknown>
        traceId?: string
        spanId?: string
        flags?: number
    }>
}

export type OtelEvent = IOtelTraceEvent | IOtelMetricEvent | IOtelLogEvent

// ─── Provider ─────────────────────────────────────────────────────────────────

export class OtelProvider implements IProvider {
    public readonly id = 'otel'
    public readonly providesRouter = true
    public readonly requiresApiKeyApi = false
    public router = express.Router()
    public routerAlias = 'otlp'
    public apiKeyApi = undefined

    private subscribers = new Map<IProviderSubscriber, IOtelProviderConfig>()
    private data = new Map<string, Map<string, unknown[]>>()   // space -> signal -> events[]

    constructor(_clusterInfo: unknown, _kwirthData: KwirthData) {
        // Protobuf bodies need express.raw() before the global bodyParser.json() can skip them
        this.router.use(express.raw({ type: 'application/x-protobuf' }))

        this.router.post('/v1/traces',  (req, res) => this.handleSignal('traces',  req, res))
        this.router.post('/v1/metrics', (req, res) => this.handleSignal('metrics', req, res))
        this.router.post('/v1/logs',    (req, res) => this.handleSignal('logs',    req, res))
    }

    addSubscriber = async (subscriber: IProviderSubscriber, config: IOtelProviderConfig) => {
        this.subscribers.set(subscriber, config ?? { spaces: [] })
    }

    removeSubscriber = async (subscriber: IProviderSubscriber) => {
        this.subscribers.delete(subscriber)
    }

    startProvider = async () => {}
    stopProvider  = async () => {}

    // ── HTTP handlers ──────────────────────────────────────────────────────────

    private handleSignal = (signal: OtelSignal, req: Request, res: Response): void => {
        try {
            const ct = req.headers['content-type'] ?? ''

            if (ct.includes('application/x-protobuf')) {
                // Protobuf not supported in this version — most OTel SDKs support JSON too.
                // To enable proto: add protobufjs + deserialize using the OTLP proto schema.
                res.status(415).json({ message: 'OTLP/HTTP protobuf not supported; configure your exporter to use Content-Type: application/json' })
                return
            }

            const body = req.body as Record<string, unknown>
            if (!body) { res.status(400).json({}); return }

            const events = this.parseSignal(signal, body)
            for (const event of events) {
                this.dispatch(signal, event)
            }

            res.status(200).json({})
        } catch (err) {
            console.error(`[otel] error processing ${signal}: ${err}`)
            res.status(500).json({})
        }
    }

    // ── Dispatch ───────────────────────────────────────────────────────────────

    private dispatch(signal: OtelSignal, event: OtelEvent): void {
        const serviceName = (event.resource?.['service.name'] as string) ?? ''

        for (const [subscriber, config] of this.subscribers) {
            for (const mapping of config.spaces) {
                if (!mapping.signals.includes(signal)) continue
                if (mapping.services?.length && !mapping.services.includes(serviceName)) continue

                const spaceName = mapping.name
                let spaceData = this.data.get(spaceName)
                if (!spaceData) { spaceData = new Map(); this.data.set(spaceName, spaceData) }
                let typeArr = spaceData.get(signal)
                if (!typeArr) { typeArr = []; spaceData.set(signal, typeArr) }
                typeArr.push(event)

                subscriber.processProviderEvent(this.id, {
                    last: {
                        type: 'event',
                        timestamp: Date.now().toString(),
                        event: { space: spaceName, type: signal, data: event },
                    },
                    all: this.data,
                })
            }
        }
    }

    // ── Signal parsers ─────────────────────────────────────────────────────────

    private parseSignal(signal: OtelSignal, body: Record<string, unknown>): OtelEvent[] {
        switch (signal) {
            case 'traces':  return this.parseTraces(body)
            case 'metrics': return this.parseMetrics(body)
            case 'logs':    return this.parseLogs(body)
        }
    }

    private parseTraces(body: Record<string, unknown>): IOtelTraceEvent[] {
        const events: IOtelTraceEvent[] = []
        for (const rs of (body.resourceSpans as any[]) ?? []) {
            const resource = normalizeAttributes(rs.resource?.attributes)
            for (const ss of rs.scopeSpans ?? []) {
                const scope = { name: ss.scope?.name ?? '', version: ss.scope?.version as string | undefined }
                const spans = (ss.spans ?? []).map((s: any) => {
                    const startNs = BigInt(s.startTimeUnixNano ?? '0')
                    const endNs   = BigInt(s.endTimeUnixNano   ?? '0')
                    return {
                        traceId:      s.traceId ?? '',
                        spanId:       s.spanId  ?? '',
                        parentSpanId: s.parentSpanId as string | undefined,
                        traceState:   s.traceState   as string | undefined,
                        name:         s.name ?? '',
                        kind:         s.kind ?? 0,
                        startTime:    nsToIso(startNs),
                        endTime:      nsToIso(endNs),
                        durationMs:   Number((endNs - startNs) / BigInt(1_000_000)),
                        attributes:   normalizeAttributes(s.attributes),
                        status:       { code: s.status?.code ?? 0, message: s.status?.message as string | undefined },
                        events: (s.events ?? []).map((e: any) => ({
                            time:       nsToIso(BigInt(e.timeUnixNano ?? '0')),
                            name:       e.name ?? '',
                            attributes: normalizeAttributes(e.attributes),
                        })),
                        links: (s.links ?? []).map((l: any) => ({
                            traceId:    l.traceId ?? '',
                            spanId:     l.spanId  ?? '',
                            attributes: normalizeAttributes(l.attributes),
                        })),
                    }
                })
                events.push({ signal: 'trace', resource, scope, spans })
            }
        }
        return events
    }

    private parseMetrics(body: Record<string, unknown>): IOtelMetricEvent[] {
        const events: IOtelMetricEvent[] = []
        for (const rm of (body.resourceMetrics as any[]) ?? []) {
            const resource = normalizeAttributes(rm.resource?.attributes)
            for (const sm of rm.scopeMetrics ?? []) {
                const scope   = { name: sm.scope?.name ?? '', version: sm.scope?.version as string | undefined }
                const metrics = (sm.metrics ?? []).map(normalizeMetric)
                events.push({ signal: 'metric', resource, scope, metrics })
            }
        }
        return events
    }

    private parseLogs(body: Record<string, unknown>): IOtelLogEvent[] {
        const events: IOtelLogEvent[] = []
        for (const rl of (body.resourceLogs as any[]) ?? []) {
            const resource = normalizeAttributes(rl.resource?.attributes)
            for (const sl of rl.scopeLogs ?? []) {
                const scope   = { name: sl.scope?.name ?? '', version: sl.scope?.version as string | undefined }
                const records = (sl.logRecords ?? []).map((r: any) => ({
                    timestamp:         r.timeUnixNano         ? nsToIso(BigInt(r.timeUnixNano))         : undefined,
                    observedTimestamp: r.observedTimeUnixNano ? nsToIso(BigInt(r.observedTimeUnixNano)) : undefined,
                    severityNumber:    r.severityNumber  as number | undefined,
                    severityText:      r.severityText    as string | undefined,
                    body:              normalizeAnyValue(r.body),
                    attributes:        normalizeAttributes(r.attributes),
                    traceId:           r.traceId as string | undefined,
                    spanId:            r.spanId  as string | undefined,
                    flags:             r.flags   as number | undefined,
                }))
                events.push({ signal: 'log', resource, scope, records })
            }
        }
        return events
    }
}

// ─── OTLP JSON normalization helpers ──────────────────────────────────────────

function nsToIso(ns: bigint): string {
    return new Date(Number(ns / BigInt(1_000_000))).toISOString()
}

function normalizeAnyValue(av: unknown): unknown {
    if (av === null || av === undefined) return undefined
    const a = av as Record<string, unknown>
    if (a.stringValue !== undefined) return a.stringValue
    if (a.intValue    !== undefined) return Number(a.intValue)
    if (a.doubleValue !== undefined) return a.doubleValue
    if (a.boolValue   !== undefined) return a.boolValue
    if (a.bytesValue  !== undefined) return a.bytesValue
    if (a.arrayValue)  return ((a.arrayValue as any).values ?? []).map(normalizeAnyValue)
    if (a.kvlistValue) return normalizeAttributes((a.kvlistValue as any).values ?? [])
    return av
}

function normalizeAttributes(kvs: Array<{ key: string; value: unknown }> | undefined): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const kv of (kvs ?? [])) result[kv.key] = normalizeAnyValue(kv.value)
    return result
}

function normalizeNumberDataPoints(dps: any[]): IOtelMetricDataPoint[] {
    return (dps ?? []).map((dp: any) => ({
        startTime:  dp.startTimeUnixNano ? nsToIso(BigInt(dp.startTimeUnixNano)) : undefined,
        time:       dp.timeUnixNano      ? nsToIso(BigInt(dp.timeUnixNano))      : undefined,
        attributes: normalizeAttributes(dp.attributes),
        value:      dp.asDouble !== undefined ? dp.asDouble : dp.asInt !== undefined ? Number(dp.asInt) : undefined,
    }))
}

function normalizeHistogramDataPoints(dps: any[]): IOtelMetricDataPoint[] {
    return (dps ?? []).map((dp: any) => ({
        startTime:      dp.startTimeUnixNano ? nsToIso(BigInt(dp.startTimeUnixNano)) : undefined,
        time:           dp.timeUnixNano      ? nsToIso(BigInt(dp.timeUnixNano))      : undefined,
        attributes:     normalizeAttributes(dp.attributes),
        count:          dp.count !== undefined ? Number(dp.count) : undefined,
        sum:            dp.sum   as number | undefined,
        bucketCounts:   (dp.bucketCounts  ?? []).map(Number),
        explicitBounds: dp.explicitBounds as number[] | undefined,
    }))
}

function normalizeMetric(m: any): IOtelMetricEvent['metrics'][number] {
    let type: IOtelMetricEvent['metrics'][number]['type'] = 'unknown'
    let dataPoints: IOtelMetricDataPoint[] = []
    let isMonotonic: boolean | undefined
    let aggregationTemporality: number | undefined

    if (m.gauge) {
        type       = 'gauge'
        dataPoints = normalizeNumberDataPoints(m.gauge.dataPoints)
    } else if (m.sum) {
        type                   = 'sum'
        isMonotonic            = m.sum.isMonotonic
        aggregationTemporality = m.sum.aggregationTemporality
        dataPoints             = normalizeNumberDataPoints(m.sum.dataPoints)
    } else if (m.histogram) {
        type                   = 'histogram'
        aggregationTemporality = m.histogram.aggregationTemporality
        dataPoints             = normalizeHistogramDataPoints(m.histogram.dataPoints)
    } else if (m.exponentialHistogram) {
        type                   = 'exponentialHistogram'
        aggregationTemporality = m.exponentialHistogram.aggregationTemporality
        dataPoints             = normalizeHistogramDataPoints(m.exponentialHistogram.dataPoints)
    } else if (m.summary) {
        type       = 'summary'
        dataPoints = normalizeNumberDataPoints(m.summary.dataPoints)
    }

    return { name: m.name ?? '', description: m.description, unit: m.unit, type, isMonotonic, aggregationTemporality, dataPoints }
}

export default OtelProvider
