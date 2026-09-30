import { INetToolsFront } from '../common/NetToolsFront'
import { createNetToolsCore } from './NetToolsFrontCore'
import { createLatencyDialog } from './LatencyDialog'
import { NetToolsIcon } from './icons'

/*
    The instance the core keeps in `window.__kwirth_dce__['nettools']`.

    It is built ONCE per page, by the core, and every consumer gets this same object — so the history
    the core closes over is the one they all write into and all read from, and the dialog they open is
    drawing it.

    This file is the thin part on purpose: it adds the icon and the dialog to a core that already works
    without a browser. Everything worth asserting lives next door in NetToolsFrontCore.ts.
*/
export const createNetToolsFront = (id: string, now?: () => number): INetToolsFront => {
    const { core, store } = createNetToolsCore(id, now)
    return {
        ...core,
        Icon: NetToolsIcon,
        LatencyDialog: createLatencyDialog(store)
    }
}
