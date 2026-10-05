/*
    What DCE `xyflow` hands its consumers.

    Consumers import THIS file for the types only: at runtime they get the instance the core keeps,
    through getDce<IXyflow>('xyflow'). Nothing here is a runtime import, so a consumer that imports these
    types does not bundle a byte of React Flow or elk.
*/

/** The React Flow module namespace (@xyflow/react), as a type. */
export type TReactFlow = typeof import('@xyflow/react')

/** elk's constructor (elkjs): `new ELK()` gives the layout engine. */
export type TElkConstructor = typeof import('elkjs/lib/elk.bundled.js').default

export interface IXyflow {
    /** The DCE's id, as the core installed it. */
    readonly id: string
    /** The React Flow namespace, shared by all consumers. Its CSS is already on the page. */
    readonly reactFlow: TReactFlow
    /**
     * elk's constructor. Async on purpose: elk is the heavy half (~1.4 MB), and keeping the call a
     * promise lets it become lazy again without consumers changing.
     */
    loadElk(): Promise<TElkConstructor>
}
