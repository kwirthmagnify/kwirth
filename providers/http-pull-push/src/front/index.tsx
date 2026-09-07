import HttpPullPushConfigDialog from './HttpPullPushConfigDialog'

declare global { interface Window { __kwirth_providers__: Record<string, any> } }

window.__kwirth_providers__ = window.__kwirth_providers__ ?? {}
window.__kwirth_providers__['http-pull-push'] = { ConfigDialog: HttpPullPushConfigDialog }
