import SugarlessConfigDialog from './SugarlessConfigDialog'

declare global { interface Window { __kwirth_providers__: Record<string, unknown> } }

window.__kwirth_providers__ = window.__kwirth_providers__ ?? {}
window.__kwirth_providers__['sugarless'] = { ConfigDialog: SugarlessConfigDialog }
