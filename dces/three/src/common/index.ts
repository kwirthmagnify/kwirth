/*
    What DCE `three` hands its consumers, on both ends.

    Consumers import THIS file for the types only: at runtime they get the instance the core keeps,
    through getDce<IThree>('three'). The instance exposes the three.js namespace so every consumer
    shares a single copy of the library instead of each bundling its own.
*/

/** The three.js module namespace, as a type. */
export type TThree = typeof import('three')

export interface IThree {
    /** The DCE's id, as the core installed it. */
    readonly id: string
    /** The three.js namespace, shared by all consumers. */
    readonly THREE: TThree
}
