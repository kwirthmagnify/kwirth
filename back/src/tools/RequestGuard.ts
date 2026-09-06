import { Response } from 'express'
import { ELogComponent, logError } from './Logging'

// Una promesa lanzada dentro de un handler de express y nunca esperada escapa del handler y acaba en
// 'unhandledRejection', que en este proceso es FATAL: index.ts lo engancha a exitAndLog y el core muere.
// Los handlers que serializan con semaforo hacen justo eso — `Api.semaphore.use(async () => {...})` sin
// await ni catch —, asi que cualquier fallo inesperado dentro del bloque tumbaba el core entero. En el
// caso del login, ademas, desde una peticion sin autenticar.
//
// guard() no cambia el flujo ni la logica: la promesa sigue corriendo igual y respondiendo igual. Solo
// se queda su rechazo para que no salga del proceso, lo registra y responde 500 si nadie respondio ya.
export const guard = (work: Promise<unknown>, res: Response, component: ELogComponent): void => {
    work.catch(err => {
        logError(component, `Unhandled error while serving ${res.req?.method} ${res.req?.originalUrl}: ${err}`)
        if (!res.headersSent) res.status(500).json({})
    })
}
