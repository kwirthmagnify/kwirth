import { CoreV1Api } from '@kubernetes/client-node'
import { ELogComponent, logInfo, logWarning } from './Logging'

/*
    El log del contenedor ANTERIOR, leido una sola vez al arrancar.

    Cuando el core muere dentro del cluster, el kubelet crea un contenedor nuevo y lo que explica la
    muerte se queda en el que se fue. Para cuando alguien va a mirar, o el log se ha rotado o el pod se ha
    recreado, asi que los cierres anomalos se investigaban a ciegas. Se lee en el arranque —el unico
    momento en el que seguro que esta— y se guarda EN MEMORIA: no se persiste a proposito, porque en cada
    arranque se vuelve a leer y lo guardado seria siempre mas viejo que lo que hay.

    ⚠️ 'previous' solo existe si el contenedor reinicio DENTRO DEL MISMO POD (crash, OOMKilled,
    CrashLoopBackOff), que es justo el caso que interesa. Tras un rollout el pod es otro y el kubelet no
    guarda nada del anterior: eso no es un fallo, es que no hay nada que leer. Por eso 'restarted' y
    'unavailableReason' se distinguen — "no hubo reinicio" y "hubo reinicio pero el log ya no esta" son
    cosas distintas, y la segunda es la que desconcierta a quien mira.
*/

const DEFAULT_LINES = 1000

export interface IPreviousContainerTermination {
    exitCode?: number
    reason?: string
    signal?: number
    message?: string
    startedAt?: string
    finishedAt?: string
}

export interface IPreviousContainerLog {
    // the container restarted within this pod: only then is there a previous log to ask for
    restarted: boolean
    // the previous exit was NOT clean (an exit code other than 0, OOMKilled...). It is what fires the warning
    abnormal: boolean
    restartCount: number
    container?: string
    termination?: IPreviousContainerTermination
    lines: string[]
    // why it could not be read when it WAS expected to be readable (a rotated log, permissions, the api down)
    unavailableReason?: string
}

const NOTHING: IPreviousContainerLog = { restarted: false, abnormal: false, restartCount: 0, lines: [] }

let previousContainerLog: IPreviousContainerLog = NOTHING

export const getPreviousContainerLog = (): IPreviousContainerLog => previousContainerLog

// How many lines are asked for. Configurable because 1000 is a reasonable number, not a truth: a core that
// spews a lot at startup needs more so that the cause does not fall outside the window.
export const resolvePreviousLogLines = (): number => {
    const fromEnv = Number(process.env.PREVIOUSLOGLINES)
    if (!isNaN(fromEnv) && fromEnv > 0) return Math.floor(fromEnv)
    return DEFAULT_LINES
}

/*
    Elige el contenedor del que leer. Un pod de Kwirth lleva uno, pero puede llevar sidecars (service
    mesh, agentes), asi que no vale coger el primero y ya: se busca el que REINICIO, que es el unico con
    log anterior. Si ninguno reinicio no hay nada que leer, y ese es el caso normal.
*/
const pickRestartedContainer = (statuses: any[]): any|undefined =>
    statuses.find(s => (s.restartCount ?? 0) > 0 && s.lastState?.terminated)

const asIso = (value: unknown): string|undefined => {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' && value !== '') return value
    return undefined
}

/*
    `tailLines` viene RESUELTO de fuera (settings → env → default, via SettingsApi) porque quien manda es
    la configuracion de Kwirth, y este modulo no tiene por que saber de donde sale. Sin argumento cae a
    env+default, que es lo que hace falta para poder probarlo aislado.
*/
export const readPreviousContainerLog = async (coreApi: CoreV1Api, namespace: string, podName: string, lines?: number): Promise<IPreviousContainerLog> => {
    try {
        const pod = await coreApi.readNamespacedPod({ name: podName, namespace })
        const statuses = pod.status?.containerStatuses ?? []
        const status = pickRestartedContainer(statuses)

        if (!status) {
            previousContainerLog = NOTHING
            logInfo(ELogComponent.CORE, 'No previous container log: this container has not restarted')
            return previousContainerLog
        }

        const terminated = status.lastState.terminated
        const termination: IPreviousContainerTermination = {
            exitCode: terminated.exitCode,
            reason: terminated.reason,
            signal: terminated.signal,
            message: terminated.message,
            startedAt: asIso(terminated.startedAt),
            finishedAt: asIso(terminated.finishedAt),
        }
        // an exit 0 after a restart is an orderly stop (a SIGTERM attended to); anything else is not
        const abnormal = terminated.exitCode !== 0

        const result: IPreviousContainerLog = {
            restarted: true,
            abnormal,
            restartCount: status.restartCount ?? 0,
            container: status.name,
            termination,
            lines: [],
        }

        const tailLines = lines && lines > 0 ? Math.floor(lines) : resolvePreviousLogLines()
        try {
            // The same route MagnifyChannel uses in order to read a pod's log, plus 'previous'
            const log = await coreApi.readNamespacedPodLog({ name: podName, namespace, container: status.name, previous: true, tailLines })
            result.lines = String(log ?? '').split('\n')
            // a log ending in \n leaves a last empty line that adds nothing
            if (result.lines.length > 0 && result.lines[result.lines.length - 1] === '') result.lines.pop()
        }
        catch (err) {
            // The restart is a fact (the pod's state says so), but the log may no longer be there: the
            // kubelet rotates it, and with several restarts in a row it only keeps the last one.
            result.unavailableReason = err instanceof Error ? err.message : String(err)
            logWarning(ELogComponent.CORE, `Previous container log is not available: ${result.unavailableReason}`)
        }

        previousContainerLog = result
        const cause = `exit code ${termination.exitCode}${termination.reason ? ` (${termination.reason})` : ''}`
        logInfo(ELogComponent.CORE, `Previous container ended with ${cause}, restarts: ${result.restartCount}, log lines read: ${result.lines.length}`)
        return previousContainerLog
    }
    catch (err) {
        // Reading this is a diagnostic extra: its failing must NOT spoil the core's startup.
        previousContainerLog = { ...NOTHING, unavailableReason: err instanceof Error ? err.message : String(err) }
        logWarning(ELogComponent.CORE, `Could not check the previous container: ${previousContainerLog.unavailableReason}`)
        return previousContainerLog
    }
}
