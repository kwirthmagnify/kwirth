// @ts-ignore
import customCss from './custom-fm-fileman.css'
// @ts-ignore
import fmCss from '@jfvilas/react-file-manager/dist/style.css'

// Inject CSS into the DOM when the plugin loads
;[customCss as string, fmCss as string].forEach(css => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
})

import { FilemanChannel } from './FilemanChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, unknown>
    }
}

if (!window.__kwirth_plugins__) window.__kwirth_plugins__ = {}
window.__kwirth_plugins__['fileman'] = FilemanChannel
