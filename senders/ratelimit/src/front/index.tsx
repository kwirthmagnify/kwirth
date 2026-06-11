import RatelimitConfigDialog from './RatelimitConfigDialog'

declare global { interface Window { __kwirth_senders__: Record<string, any> } }

window.__kwirth_senders__ = window.__kwirth_senders__ ?? {}
window.__kwirth_senders__['ratelimit'] = {
    ConfigDialog: RatelimitConfigDialog,
    nodeLabel: 'Rate limit',
    nodeDescription: 'Limits message delivery rate. Excess messages are queued and delivered in the next time window.',
}
