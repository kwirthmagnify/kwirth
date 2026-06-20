import { Matrix } from './Matrix'
import { MatrixSetup } from './MatrixSetup'

;(window as any).__kwirth_homepages__['matrix'] = {
    homepageId: 'matrix',
    displayName: 'Matrix',
    Component: Matrix,
    SetupDialog: MatrixSetup,
    defaultConfig: { showQuickAccess: true, showRain: true, rainSpeed: 12, rainActiveLines: 50 }
}
