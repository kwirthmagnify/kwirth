import SenderDesignerDialog from './SenderDesignerDialog'

declare global { interface Window { __kwirth_senders__: Record<string, any> } }

window.__kwirth_senders__ = window.__kwirth_senders__ ?? {}
window.__kwirth_senders__['composite'] = { ConfigDialog: SenderDesignerDialog, nodeLabel: 'Composite' }
