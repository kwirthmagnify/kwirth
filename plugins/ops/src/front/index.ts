// @ts-ignore
import xtermCss from 'xterm/css/xterm.css'
;[xtermCss as string].forEach(css => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
})

import { OpsChannel } from './OpsChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, unknown>
    }
}

if (!window.__kwirth_plugins__) window.__kwirth_plugins__ = {}
window.__kwirth_plugins__['ops'] = OpsChannel
