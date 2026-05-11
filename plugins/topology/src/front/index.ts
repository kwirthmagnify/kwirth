import { TopologyChannel } from './TopologyChannel'

declare global {
    interface Window {
        __kwirth__: { React: unknown; MUI: unknown; kwirthCommon: unknown }
        __kwirth_plugins__: Record<string, unknown>
    }
}

if (!window.__kwirth_plugins__) window.__kwirth_plugins__ = {}
window.__kwirth_plugins__['topology'] = TopologyChannel
