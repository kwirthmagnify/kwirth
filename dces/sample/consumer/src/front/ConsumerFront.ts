import { getDce } from '@kwirthmagnify/kwirth-common-front'

/*
    The front end's side of the reading: the same thing the back end does, with the front end's own
    instance of the DCE.

    Two instances, one per process, and that is right: the back end's lives in the Kwirth process and the
    front end's in this page. What a DCE guarantees is ONE per side, shared by every consumer there — so
    two tabs of this plugin see the same front-end counter, and so would any other plugin consuming it.
*/

/** What the sample DCE hands out. A consumer depends on the CONTRACT, not on the package. */
export interface ISampleDce {
    id: string
    createdAt: number
    boots: number
    next(): number
    greet(name: string): string
}

export interface IFrontReading {
    dceId?: string
    ticks?: number[]
    createdAt?: number
    greeting?: string
    /** Why the reading failed. Present INSTEAD of the rest: getDce() throws, it does not return empty. */
    error?: string
}

export const readFrontDce = (): IFrontReading => {
    try {
        const sample = getDce<ISampleDce>('sample')
        return {
            dceId: sample.id,
            ticks: [sample.next(), sample.next()],
            createdAt: sample.createdAt,
            greeting: sample.greet('front')
        }
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
    }
}
