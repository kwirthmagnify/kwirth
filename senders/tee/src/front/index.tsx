import TeeSenderDialog from './TeeSenderDialog'

declare global { interface Window { __kwirth_senders__: Record<string, any> } }

window.__kwirth_senders__ = window.__kwirth_senders__ ?? {}
window.__kwirth_senders__['tee'] = TeeSenderDialog
