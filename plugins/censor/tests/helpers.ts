// Common mocks for censor's unit tests (the montag/AgoraChannel.test.ts pattern).
// No infrastructure is brought up: clusterInfo and backChannelObject are injected and the WebSocket
// traffic is captured with a MockWs class.
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { PassThrough } from 'stream'
import { ECensorCommand } from '../src/common/CensorTypes'

// Fake WebSocket: it keeps every send() as a JSON string and allows filtering by kind.
export class MockWs {
    readyState = 1
    bufferedAmount = 0
    sent: string[] = []
    send(s: string): void { this.sent.push(s) }
    close(): void {}
    parsed(): Array<Record<string, unknown>> { return this.sent.map(s => JSON.parse(s) as Record<string, unknown>) }
    of(kind: string): Array<Record<string, unknown>> { return this.parsed().filter(m => m.kind === kind) }
    last(kind: string): Record<string, unknown> | undefined { const a = this.of(kind); return a[a.length - 1] }
    clear(): void { this.sent = [] }
}

// backChannelObject with in-memory storage (own = readStorage, shared = readStorageCommon).
export const makeBackObj = () => {
    const own = new Map<string, unknown>()
    const shared = new Map<string, unknown>()
    const warnings: string[] = []
    const obj = {
        readStorage: async (id: string) => (own.has(id) ? own.get(id) : null),
        writeStorage: async (id: string, _common: boolean, data: unknown) => { own.set(id, data) },
        readStorageCommon: async (id: string) => (shared.has(id) ? shared.get(id) : null),
        writeStorageCommon: async (id: string, _common: boolean, data: unknown) => { shared.set(id, data) },
        logInfo: () => {},
        logWarning: (text: string) => { warnings.push(text) },
        logError: () => {},
        senders: { send: () => {} }
    }
    return { obj, own, shared, warnings }
}

export interface ILogApiOptions {
    follow?: boolean
    pretty?: boolean
    timestamps?: boolean
    tailLines?: number
    sinceSeconds?: number
}

export interface ILogApiCall {
    namespace: string
    pod: string
    container: string
    opts: ILogApiOptions
    aborted: boolean
}

export interface IPodSpec {
    namespace: string
    pod: string
    containers: string[]
}

// A minimal clusterInfo. logApi.log records every stream opening and returns an AbortController
// (like the real k8s client) so it can be asserted that censor aborts the requests.
export const makeClusterInfo = (pods: IPodSpec[] = []) => {
    const subs: Array<{ providerId: string; data: unknown }> = []
    const calls: ILogApiCall[] = []
    let failWith: Error | undefined = undefined
    const ci = {
        addSubscriber: (providerId: string, _c: unknown, data: unknown) => { subs.push({ providerId, data }) },
        logApi: {
            log: async (namespace: string, pod: string, container: string, _stream: PassThrough, opts: ILogApiOptions) => {
                if (failWith) throw failWith
                const call: ILogApiCall = { namespace, pod, container, opts, aborted: false }
                calls.push(call)
                const controller = new AbortController()
                controller.signal.addEventListener('abort', () => { call.aborted = true })
                return controller
            }
        },
        coreApi: {
            listPodForAllNamespaces: async () => ({
                items: pods.map(p => ({
                    metadata: { namespace: p.namespace, name: p.pod, labels: {} },
                    spec: { containers: p.containers.map(c => ({ name: c })) }
                }))
            })
        }
    }
    return { ci, subs, calls, setFailure: (err: Error | undefined) => { failWith = err } }
}

// The front->back command envelope processCommand expects.
export const cmd = (instance: string, command: ECensorCommand, data?: unknown) => ({
    msgtype: 'censormessage',
    channel: 'censor',
    instance,
    accessKey: '',
    action: EInstanceMessageAction.COMMAND,
    flow: EInstanceMessageFlow.REQUEST,
    command,
    data
})

export const instanceConfigFor = (instance: string, view: EInstanceConfigView) => ({
    instance,
    accessKey: 'tester|permanent|cluster::::',
    view,
    data: {}
})

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
