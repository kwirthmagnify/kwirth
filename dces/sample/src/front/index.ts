import { DCE_FRONT_FACTORIES } from '@kwirthmagnify/kwirth-common'
import { createSample } from '../common/SampleDce'

/*
    The front end of the sample DCE.

    A front script cannot be handed a host as a parameter, so the handshake is a registration: the
    script leaves its factory at `window.__kwirth_dce_factories__['sample']`, and the core's loader
    calls create() once and writes the result into `window.__kwirth_dce__['sample']`, where a consumer
    reads it with getDce() from common-front.
*/
type TFactories = Record<string, { create: () => unknown }>

const w = window as unknown as Record<string, TFactories | undefined>
const factories = (w[DCE_FRONT_FACTORIES] ??= {})
factories['sample'] = { create: () => createSample('sample', Date.now(), 0) }
