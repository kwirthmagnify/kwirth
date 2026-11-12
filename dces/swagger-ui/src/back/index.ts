import { IDceBack, IDceBackHost } from '@kwirthmagnify/kwirth-common-back'
import { bundleJs, css, version } from 'swagger-ui-assets'
import { ISwaggerUi, ISwaggerUiOptions } from '../common/index'
import { createHandler } from './handler'

/*
    The back end of DCE `swagger-ui`.

    It exports a FACTORY, not an object: the core calls create() once and keeps what it returns in
    `global.__kwirth_dce__['swagger-ui']`. A consumer gets it with getDce<ISwaggerUi>('swagger-ui') and mounts
    handler() on its own router. Swagger UI's files come in this bundle (see assets-plugin.mjs), so nothing is
    fetched from the Internet: the page works in a cluster without a way out.

    A change in this file needs the Kwirth back end restarted — the factory runs once.
*/
const dce: IDceBack<ISwaggerUi> = {
    create: async (host: IDceBackHost): Promise<ISwaggerUi> => {
        host.logger.info(`swagger-ui created, with Swagger UI ${version}`)
        return {
            id: host.id,
            swaggerUiVersion: version,
            handler: (options: ISwaggerUiOptions) => createHandler({ bundleJs, css, version }, options)
        }
    }
}

export default dce
