import { IDceBack, IDceBackHost } from '@kwirthmagnify/kwirth-common-back'
import { ISsh } from '../common/index'
import { connect } from './client'

/*
    The back end of DCE `ssh`.

    It exports a FACTORY: the core calls create() once and keeps what it returns; a consumer gets it with
    getDce<ISsh>('ssh'). The DCE keeps no state and opens nothing on its own — every connection is the
    consumer's, from connect() to close().
*/
export const createSsh = (id: string): ISsh => ({ id, connect })

const dce: IDceBack<ISsh> = {
    create: async (host: IDceBackHost): Promise<ISsh> => {
        host.logger.info('ssh client ready')
        return createSsh(host.id)
    }
}

export default dce
