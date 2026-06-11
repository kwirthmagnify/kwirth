import TimedConfigDialog from './TimedConfigDialog'

declare global { interface Window { __kwirth_senders__: Record<string, any> } }

window.__kwirth_senders__ = window.__kwirth_senders__ ?? {}
window.__kwirth_senders__['timed'] = {
    ConfigDialog: TimedConfigDialog,
    nodeLabel: 'Timed filter',
    nodeDescription: 'Routes or drops messages based on time-of-day windows and day-of-week rules.',
}
