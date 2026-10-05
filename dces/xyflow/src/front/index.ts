import { DCE_FRONT_FACTORIES } from '@kwirthmagnify/kwirth-common'
import { createXyflowFront } from './XyflowDceImpl'
import reactFlowCss from '@xyflow/react/dist/style.css'

/*
    The front end of DCE `xyflow`.

    A front script cannot be handed a host as a parameter, so the handshake is a registration: the
    script leaves its factory at `window.__kwirth_dce_factories__['xyflow']`, and the core's loader
    calls create() once and writes the result into `window.__kwirth_dce__['xyflow']`, where a consumer
    reads it with getDce() from common-front.

    React Flow does not draw without its stylesheet, and the core no longer loads it: the DCE puts it on
    the page when it is created, once.
*/
type TFactories = Record<string, { create: () => unknown }>

const STYLE_ID = 'kwirth-dce-xyflow-css'

const injectCss = (): void => {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = reactFlowCss
    document.head.appendChild(style)
}

const w = window as unknown as Record<string, TFactories | undefined>
const factories = (w[DCE_FRONT_FACTORIES] ??= {})
factories['xyflow'] = {
    create: () => {
        injectCss()
        return createXyflowFront('xyflow')
    }
}
