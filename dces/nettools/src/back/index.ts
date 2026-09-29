import { IDceBack, IDceBackHost } from '@kwirthmagnify/kwirth-common-back'
import { INetTools } from '../common/NetTools'
import { createNetTools } from './NetToolsImpl'
import { systemProbes } from './probes'

/*
    The back end of DCE `nettools` (plan: plans/completed/nettools/PLAN.md).

    It exports a FACTORY, not an object: the core calls create() once, hands it the host and keeps what
    it returns in `global.__kwirth_dce__['nettools']`. Every consumer then holds the SAME object, which
    here means one place where a timeout is decided and one shape of result to paint.

    It persists nothing and configures nothing: there is no state worth keeping between boots, and a
    DCE has no configuration in V1. The host is used for its logger and for its id, which is the id the
    core really installed it under — not the literal 'nettools', which an operator could have changed.
*/
const dce: IDceBack<INetTools> = {
    create: async (host: IDceBackHost): Promise<INetTools> => {
        host.logger.info(`${host.id} created: tcp reachability and dns through node, no binary is spawned`)
        return createNetTools(host.id, systemProbes)
    }
}

export default dce
