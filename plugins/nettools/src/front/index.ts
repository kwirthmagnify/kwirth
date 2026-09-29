import { NetToolsChannel } from './NetToolsChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, unknown>
    }
}

window.__kwirth_plugins__ = window.__kwirth_plugins__ || {}
window.__kwirth_plugins__['nettools'] = NetToolsChannel
