import { DCE_FRONT_FACTORIES } from '@kwirthmagnify/kwirth-common'
import { createFileManagerFront } from './FileManagerDceImpl'
import { injectCss } from './css'
import fileManagerCss from '@jfvilas/react-file-manager/dist/style.css'

/*
    The front end of DCE `file-manager`.

    A front script cannot be handed a host as a parameter, so the handshake is a registration: the
    script leaves its factory at `window.__kwirth_dce_factories__['file-manager']`, and the core's
    loader calls create() once and writes the result into `window.__kwirth_dce__['file-manager']`,
    where a consumer reads it with getDce() from common-front.

    Leaving the call to the core is what makes "loaded" mean the factory already ran: a script that
    built its own object would make a DCE that failed indistinguishable from one that never ran.

    The file manager does not draw without its stylesheet, and the core no longer loads it: the DCE
    puts it on the page when it is created, once.
*/
type TFactories = Record<string, { create: () => unknown }>

const w = window as unknown as Record<string, TFactories | undefined>
const factories = (w[DCE_FRONT_FACTORIES] ??= {})
factories['file-manager'] = {
    create: () => {
        injectCss(document, fileManagerCss)
        return createFileManagerFront('file-manager')
    }
}
