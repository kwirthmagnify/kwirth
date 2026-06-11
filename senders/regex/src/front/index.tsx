import RegexSenderDialog from './RegexSenderDialog'

declare global { interface Window { __kwirth_senders__: Record<string, any> } }

window.__kwirth_senders__ = window.__kwirth_senders__ ?? {}
window.__kwirth_senders__['regex'] = {
    ConfigDialog: RegexSenderDialog,
    nodeLabel: 'Regex filter',
    nodeDescription: 'Routes or drops messages based on regex rules evaluated against a message field.',
}
