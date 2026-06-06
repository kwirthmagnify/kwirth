import RegexSenderDialog from './RegexSenderDialog'

declare global { interface Window { __kwirth_senders__: Record<string, any> } }

window.__kwirth_senders__ = window.__kwirth_senders__ ?? {}
window.__kwirth_senders__['regex'] = RegexSenderDialog
