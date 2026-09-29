/*
    What the sample DCE hands its consumers, on both ends.

    A counter is the smallest thing that proves the point of a DCE: if two consumers call next() and
    see 1 and 2, they hold the SAME object. Two copies would each say 1.
*/
export interface ISampleDce {
    /** The DCE's id, as the core installed it. */
    id: string
    /** When this instance was created: the same value for every consumer, since there is one instance. */
    createdAt: number
    /** How many times the back-end factory has run across restarts (persisted by the host). Front: 0. */
    boots: number
    /** The shared counter: each call returns the next number, whoever calls. */
    next(): number
    greet(name: string): string
}

export const createSample = (id: string, createdAt: number, boots: number): ISampleDce => {
    let counter = 0
    return {
        id,
        createdAt,
        boots,
        next: () => ++counter,
        greet: (name: string) => `Hello ${name}, from DCE '${id}'`
    }
}
