import { Clusterized } from './Clusterized'
import { ClusterizedSetup } from './ClusterizedSetup'

;(window as any).__kwirth_homepages__['clusterized'] = {
    homepageId: 'clusterized',
    displayName: 'Clusterized',
    Component: Clusterized,
    SetupDialog: ClusterizedSetup,
    defaultConfig: { showCpu: true, showMem: true, showPods: true }
}
