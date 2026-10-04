import * as THREE from 'three'
import type { IThree } from '../common/index'

/*
    The front-end implementation of DCE `three`.

    `three` is bundled INTO this DCE's front.js — it is the content. The DCE's globals plugin maps
    @kwirthmagnify/kwirth-common to the host's global, but `three` is resolved and bundled by esbuild.
    At runtime the core calls create() once and stores the result at window.__kwirth_dce__['three'],
    where consumers read it with getDce<IThree>('three').
*/
export const createThreeFront = (id: string): IThree => ({
    id,
    THREE,
})
