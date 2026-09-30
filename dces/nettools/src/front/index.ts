import { DCE_FRONT_FACTORIES } from '@kwirthmagnify/kwirth-common'
import { createNetToolsFront } from './NetToolsFrontImpl'

/*
    The front end of DCE `nettools`.

    A front script cannot be handed a host as a parameter the way a back module can, so the handshake is
    a registration: this script leaves its factory at `window.__kwirth_dce_factories__['nettools']`, and
    the core's loader calls create() ONCE and writes the result into `window.__kwirth_dce__['nettools']`,
    where a consumer reads it with getDce() from common-front.

    Leaving the call to the core is what makes "loaded" mean the factory already ran: a script that
    built its own object would make a DCE that failed indistinguishable from one that never ran, and the
    consumer would get an `undefined` instead of a cause.
*/
type TFactories = Record<string, { create: () => unknown }>

const w = window as unknown as Record<string, TFactories | undefined>
const factories = (w[DCE_FRONT_FACTORIES] ??= {})
factories['nettools'] = { create: () => createNetToolsFront('nettools') }
