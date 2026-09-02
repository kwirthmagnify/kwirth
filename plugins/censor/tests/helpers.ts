// Mocks comunes para los tests unit de censor (patrón montag/AgoraChannel.test.ts).
// No se levanta infraestructura: se inyecta clusterInfo y backChannelObject y se captura el
// tráfico WebSocket con una clase MockWs.
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { PassThrough } from 'stream'
import { ECensorCommand } from '../src/common/CensorTypes'

// WebSocket falso: guarda cada send() como string JSON y permite filtrar por kind.
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

// backChannelObject con storage en memoria (own = readStorage, shared = readStorageCommon).
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

// clusterInfo mínimo. logApi.log registra cada apertura de stream y devuelve un AbortController
// (como el cliente real de k8s) para poder asertar que censor aborta las peticiones.
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

// Envelope de comando front->back que espera processCommand.
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
