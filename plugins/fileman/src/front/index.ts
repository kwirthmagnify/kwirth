// @ts-ignore
import customCss from './custom-fm-fileman.css'

/*
    Only the plugin's OWN stylesheet is injected here.

    The library's own used to be injected alongside it, from
    '@jfvilas/react-file-manager/dist/style.css'. It is now the `file-manager` DCE's job: it puts it on
    the page when the core creates it, once and for everybody. Injecting it here as well would put a
    second copy of the same 100 KB on the page, and carry it in this bundle for nothing.
*/
const style = document.createElement('style')
style.textContent = customCss as string
document.head.appendChild(style)

import { FilemanChannel } from './FilemanChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, unknown>
    }
}

if (!window.__kwirth_plugins__) window.__kwirth_plugins__ = {}
window.__kwirth_plugins__['fileman'] = FilemanChannel
