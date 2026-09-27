import { CoreV1Api } from '@kubernetes/client-node'
import { ELogComponent, logInfo, logWarning } from './Logging'

/*
    The PREVIOUS container's log, read once at startup.

    When the core dies inside the cluster, the kubelet creates a new container and what explains the
    death stays in the one that went. By the time somebody goes to look, either the log has rotated or
    the pod has been recreated, so abnormal exits were investigated blind. It is read at startup —the
    only moment it is certainly there— and kept IN MEMORY: it is deliberately not persisted, because it
    is read again on every startup and what was stored would always be older than what is there.

    ⚠️ 'previous' only exists if the container restarted WITHIN THE SAME POD (crash, OOMKilled,
    CrashLoopBackOff), which is exactly the case of interest. After a rollout the pod is another one and
    the kubelet keeps nothing of the previous one: that is not a failure, there is simply nothing to
    read. That is why 'restarted' and 'unavailableReason' are told apart — "there was no restart" and
    "there was a restart but the log is gone" are different things, and the second is the one that
    puzzles whoever is looking.
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
    Picks the container to read from. A Kwirth pod carries one, but it may carry sidecars (service mesh,
    agents), so taking the first one and being done with it will not do: the one that RESTARTED is looked
    for, which is the only one with a previous log. If none restarted there is nothing to read, and that
    is the normal case.
*/
const pickRestartedContainer = (statuses: any[]): any|undefined =>
    statuses.find(s => (s.restartCount ?? 0) > 0 && s.lastState?.terminated)

const asIso = (value: unknown): string|undefined => {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string' && value !== '') return value
    return undefined
}

/*
    `tailLines` arrives already RESOLVED from outside (settings → env → default, through SettingsApi)
    because the one in charge is Kwirth's configuration, and this module has no reason to know where it
    comes from. With no argument it falls back to env+default, which is what is needed to test it in
    isolation.
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
