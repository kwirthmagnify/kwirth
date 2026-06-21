import { MircChannel } from './MircChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, any>
    }
}

window.__kwirth_plugins__ = window.__kwirth_plugins__ || {}
window.__kwirth_plugins__['mirc'] = MircChannel
