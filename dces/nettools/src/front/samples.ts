import { IDnsSample, TDnsSampleInput } from '../common/NetToolsFront'

/*
    The shared history, as a pure store: no React, no DOM, so the harness exercises it without a browser.

    It is the only mutable state the DCE keeps on either end, and it is deliberate: this is what two
    consumers are meant to share. The store itself is created once by the factory — one per page, which
    is exactly what the type guarantees.
*/

/**
 * How many round trips are kept.
 *
 * It is a diagnostics chart, not a time series database: past a minute's worth of samples the line
 * says nothing new, and an unbounded array in a page that stays open for days is a leak.
 */
export const MAX_SAMPLES = 60

/** The oldest go first when it is full. Pure, so the bound is testable without a clock. */
export const appended = (samples: IDnsSample[], sample: IDnsSample): IDnsSample[] =>
    [...samples, sample].slice(-MAX_SAMPLES)

export interface ISampleStore {
    record(sample: TDnsSampleInput, at: number): void
    samples(): IDnsSample[]
    clear(): void
    subscribe(listener: () => void): () => void
}

/** The store the factory keeps. `now` is a parameter so the harness does not depend on the clock. */
export const createSampleStore = (): ISampleStore => {
    let samples: IDnsSample[] = []
    const listeners = new Set<() => void>()
    const notify = (): void => { for (const listener of listeners) listener() }

    return {
        record: (sample: TDnsSampleInput, at: number): void => {
            samples = appended(samples, { ...sample, at })
            notify()
        },
        // A copy on the way out: a consumer that sorted or spliced this in place would be editing what
        // every other consumer reads.
        samples: (): IDnsSample[] => [...samples],
        clear: (): void => {
            samples = []
            notify()
        },
        subscribe: (listener: () => void): (() => void) => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
        }
    }
}
