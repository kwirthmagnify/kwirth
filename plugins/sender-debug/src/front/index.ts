import { SenderDebugChannel } from './SenderDebugChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, unknown>
    }
}

window.__kwirth_plugins__ = window.__kwirth_plugins__ || {}
window.__kwirth_plugins__['sender-debug'] = SenderDebugChannel
