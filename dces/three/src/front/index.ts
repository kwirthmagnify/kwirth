import { DCE_FRONT_FACTORIES } from '@kwirthmagnify/kwirth-common'
import { createThreeFront } from './ThreeDceImpl'

/*
    The front end of DCE `three`.

    A front script cannot be handed a host as a parameter, so the handshake is a registration: the
    script leaves its factory at `window.__kwirth_dce_factories__['three']`, and the core's loader
    calls create() once and writes the result into `window.__kwirth_dce__['three']`, where a consumer
    reads it with getDce() from common-front.
*/
type TFactories = Record<string, { create: () => unknown }>

const w = window as unknown as Record<string, TFactories | undefined>
const factories = (w[DCE_FRONT_FACTORIES] ??= {})
factories['three'] = { create: () => createThreeFront('three') }
