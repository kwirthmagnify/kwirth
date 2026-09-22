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
    // el contenedor reinicio dentro de este pod: solo entonces hay un log anterior que pedir
    restarted: boolean
    // la salida anterior NO fue limpia (exit code distinto de 0, OOMKilled...). Es lo que dispara el aviso
    abnormal: boolean
    restartCount: number
    container?: string
    termination?: IPreviousContainerTermination
    lines: string[]
    // por que no se pudo leer cuando SI se esperaba poder (log rotado, permisos, api caida)
    unavailableReason?: string
}

const NOTHING: IPreviousContainerLog = { restarted: false, abnormal: false, restartCount: 0, lines: [] }

let previousContainerLog: IPreviousContainerLog = NOTHING

export const getPreviousContainerLog = (): IPreviousContainerLog => previousContainerLog

// Cuantas lineas se piden. Configurable porque 1000 es un numero razonable, no una verdad: un core que
// escupe mucho en el arranque necesita mas para que la causa no se quede fuera de la ventana.
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
        // exit 0 tras un reinicio es una parada ordenada (un SIGTERM atendido); cualquier otra cosa no lo es
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
            // Mismo camino que usa MagnifyChannel para leer log de un pod, mas 'previous'
            const log = await coreApi.readNamespacedPodLog({ name: podName, namespace, container: status.name, previous: true, tailLines })
            result.lines = String(log ?? '').split('\n')
            // un log que acaba en \n deja una ultima linea vacia que no aporta nada
            if (result.lines.length > 0 && result.lines[result.lines.length - 1] === '') result.lines.pop()
        }
        catch (err) {
            // El reinicio es un hecho (lo dice el estado del pod), pero el log puede no estar ya: el
            // kubelet lo rota, y con varios reinicios seguidos solo guarda el ultimo.
            result.unavailableReason = err instanceof Error ? err.message : String(err)
            logWarning(ELogComponent.CORE, `Previous container log is not available: ${result.unavailableReason}`)
        }

        previousContainerLog = result
        const cause = `exit code ${termination.exitCode}${termination.reason ? ` (${termination.reason})` : ''}`
        logInfo(ELogComponent.CORE, `Previous container ended with ${cause}, restarts: ${result.restartCount}, log lines read: ${result.lines.length}`)
        return previousContainerLog
    }
    catch (err) {
        // Leer esto es un extra de diagnostico: que falle NO puede estropear el arranque del core.
        previousContainerLog = { ...NOTHING, unavailableReason: err instanceof Error ? err.message : String(err) }
        logWarning(ELogComponent.CORE, `Could not check the previous container: ${previousContainerLog.unavailableReason}`)
        return previousContainerLog
    }
}
