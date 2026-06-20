import { Avicii } from './Avicii'
import { AviciiSetup } from './AviciiSetup'

;(window as any).__kwirth_homepages__['avicii'] = {
    homepageId: 'avicii',
    displayName: 'Avicii',
    Component: Avicii,
    SetupDialog: AviciiSetup,
    defaultConfig: { showMetricBars: true, showResourceCards: true, showChannelIcons: true }
}
