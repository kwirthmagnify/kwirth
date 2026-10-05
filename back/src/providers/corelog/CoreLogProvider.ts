import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { IProvider, IProviderStorage, TProviderConstructor } from '../IProvider'
import { ClusterInfo } from '../../model/ClusterInfo'
import { coreLogBuffer } from '../../tools/LogBuffer'

/*
    The core's own log, as an in-memory ring buffer.

    This provider exists only when there is no Kubernetes API (the core instantiates it conditionally in
    index.ts). In a pod, the kubelet keeps the container log and the Status plugin reads it through the
    REST endpoint /managekwirth/log; where there is no pod, this provider takes that role: the Status
    plugin finds it in clusterInfo.providers, calls getLogLines(), and carries the lines over its
    WebSocket — no REST endpoint needed.

    It is an internal provider, like 'events' and 'metrics': registered by the core, not installed from a
    plugin. No channel declares it in its requirements (the Status plugin observes, it does not consume),
    so the core instantiates it itself.

    The buffer itself lives in tools/LogBuffer.ts and captures every console.log/error from the moment
    the process starts. This provider is just the face it shows to the rest of Kwirth: an IProvider with
    a getLogLines() method the Status plugin can call.
*/

/** How many lines the Status plugin reads per snapshot — the same as the REST endpoint serves. */
const CORE_LOG_LINES = 1000

export class CoreLogProvider implements IProvider {
    public readonly id = 'corelog'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    constructor(_clusterInfo: ClusterInfo, _kwirthData: KwirthData, _storage?: IProviderStorage) {}

    /**
     * The last N log lines, in order. This is what the Status plugin calls when building its inventory.
     */
    public getLogLines = (count: number = CORE_LOG_LINES): string[] => {
        return coreLogBuffer.getLines(count)
    }

    addSubscriber = async (): Promise<void> => {
        // No real-time push: the Status plugin reads on demand, it does not subscribe.
    }

    removeSubscriber = async (): Promise<void> => {}

    getStats = () => ({ subscribers: 0, events: 0 })

    startProvider = async (): Promise<void> => {
        // The buffer is already capturing since process start; nothing to do here.
    }

    stopProvider = async (): Promise<void> => {}
}

export default CoreLogProvider
export const constructor: TProviderConstructor = CoreLogProvider
