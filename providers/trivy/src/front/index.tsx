import TrivyOperatorDialog from './TrivyOperatorDialog'

declare global { interface Window { __kwirth_providers__: Record<string, unknown> } }

window.__kwirth_providers__ = window.__kwirth_providers__ ?? {}
window.__kwirth_providers__['trivy'] = { ConfigDialog: TrivyOperatorDialog }
