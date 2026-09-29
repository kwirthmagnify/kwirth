import { EDnsRecordType, IDnsOptions, IDnsResult, INetTools, IPingAttempt, IPingOptions, IPingResult, IReverseOptions, IReverseResult } from '../common/NetTools'
import { INetProbes } from './probes'
import { isValidTarget } from './target'

/*
    The orchestration: how many attempts, what they add up to, and what an error looks like.

    It knows nothing about sockets or resolvers — those arrive as `INetProbes` — so the harness
    exercises every branch here without a network (PRD RNF5).

    The rule the whole file obeys: NOTHING throws (PRD RF8). A host that does not answer is a reading,
    not an exception. Options out of range are not an exception either: they are clamped, because
    rejecting `count: 100` would only move the decision to a caller who has no better answer than 10.
*/

const DEFAULT_COUNT = 4
const MAX_COUNT = 10
const DEFAULT_TIMEOUT_MS = 2000
const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 30000
const DEFAULT_PORT = 443

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.trunc(value)))

/** A number that is really a number, clamped; anything else (undefined, NaN, Infinity) gives the default. */
const normalize = (value: number | undefined, min: number, max: number, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback

export const normalizeCount = (value?: number): number => normalize(value, 1, MAX_COUNT, DEFAULT_COUNT)
export const normalizeTimeout = (value?: number): number => normalize(value, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
export const normalizePort = (value?: number): number => normalize(value, 1, 65535, DEFAULT_PORT)

/** One decimal is what a loss percentage is worth; the float noise behind it is not information. */
const round1 = (value: number): number => Math.round(value * 10) / 10

/**
 * What the attempts add up to. `sent` is what was really made, so a probe that never started does not
 * claim to have sent anything.
 */
export const summarize = (attempts: IPingAttempt[]): Pick<IPingResult, 'sent' | 'received' | 'lossPercent' | 'minMs' | 'avgMs' | 'maxMs'> => {
    const times = attempts.filter(attempt => attempt.ok && attempt.timeMs !== undefined).map(attempt => attempt.timeMs as number)
    const sent = attempts.length
    const received = times.length
    const summary = {
        sent,
        received,
        lossPercent: sent === 0 ? 100 : round1(((sent - received) / sent) * 100)
    }
    if (received === 0) return summary
    return {
        ...summary,
        minMs: round1(Math.min(...times)),
        avgMs: round1(times.reduce((total, time) => total + time, 0) / received),
        maxMs: round1(Math.max(...times))
    }
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/**
 * The instance the core keeps in `global.__kwirth_dce__['nettools']`.
 *
 * The probes come in as a parameter, so the object has no hidden state at all: two calls never
 * interfere, which matters when every consumer of the DCE shares it.
 */
export const createNetTools = (id: string, probes: INetProbes): INetTools => {

    const ping = async (target: string, options?: IPingOptions): Promise<IPingResult> => {
        const count = normalizeCount(options?.count)
        const timeoutMs = normalizeTimeout(options?.timeoutMs)
        const port = normalizePort(options?.port)

        if (!isValidTarget(target)) {
            // No socket is opened: the guard of PRD RF7.
            return { target, port, attempts: [], ...summarize([]), error: `Invalid target '${target}': a host name or an IP address was expected` }
        }

        const attempts: IPingAttempt[] = []
        let address: string | undefined

        for (let seq = 1; seq <= count; seq++) {
            const outcome = await probes.tcp(target, port, timeoutMs)
            if (outcome.address && !address) address = outcome.address
            attempts.push({
                seq,
                ok: outcome.ok,
                ...(outcome.timeMs === undefined ? {} : { timeMs: outcome.timeMs }),
                ...(outcome.error ? { error: outcome.error } : {})
            })
        }

        return { target, port, ...(address ? { address } : {}), attempts, ...summarize(attempts) }
    }

    const resolve = async (name: string, options?: IDnsOptions): Promise<IDnsResult> => {
        const type = options?.type ?? EDnsRecordType.A
        const timeoutMs = normalizeTimeout(options?.timeoutMs)
        const started = probes.now()

        if (!isValidTarget(name)) {
            return { name, type, records: [], timeMs: 0, error: `Invalid name '${name}': a host name was expected` }
        }
        try {
            const records = await probes.resolve(name, type, options?.servers, timeoutMs)
            // An empty answer is not a failure: the name exists and has no record of this type.
            return { name, type, records, timeMs: probes.now() - started }
        }
        catch (error) {
            return { name, type, records: [], timeMs: probes.now() - started, error: messageOf(error) }
        }
    }

    const reverse = async (address: string, options?: IReverseOptions): Promise<IReverseResult> => {
        const timeoutMs = normalizeTimeout(options?.timeoutMs)
        const started = probes.now()

        if (!isValidTarget(address)) {
            return { address, hostnames: [], timeMs: 0, error: `Invalid address '${address}': an IP address was expected` }
        }
        try {
            const hostnames = await probes.reverse(address, options?.servers, timeoutMs)
            return { address, hostnames, timeMs: probes.now() - started }
        }
        catch (error) {
            return { address, hostnames: [], timeMs: probes.now() - started, error: messageOf(error) }
        }
    }

    return { id, ping, resolve, reverse }
}
