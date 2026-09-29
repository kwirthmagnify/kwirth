import { ConsumerChannel } from './ConsumerChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, unknown>
    }
}

window.__kwirth_plugins__ = window.__kwirth_plugins__ || {}
window.__kwirth_plugins__['dce-consumer'] = ConsumerChannel
