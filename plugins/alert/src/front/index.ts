import { AlertChannel } from './AlertChannel'

declare global {
    interface Window {
        __kwirth_plugins__: Record<string, unknown>
    }
}

if (!window.__kwirth_plugins__) window.__kwirth_plugins__ = {}
window.__kwirth_plugins__['alert'] = AlertChannel
