import { Response } from 'express'
import { ELogComponent, logError } from './Logging'

// A promise fired inside an express handler and never awaited escapes the handler and ends up in
// 'unhandledRejection', which in this process is FATAL: index.ts hooks it to exitAndLog and the core dies.
// The handlers that serialise with a semaphore do exactly that — `Api.semaphore.use(async () => {...})`
// with neither await nor catch — so any unexpected failure inside the block took the whole core down. In
// the login's case, on top of that, from an unauthenticated request.
//
// guard() changes neither the flow nor the logic: the promise goes on running the same and answering the
// same. It merely keeps its rejection from leaving the process, logs it and answers 500 when nobody has
// answered already.
export const guard = (work: Promise<unknown>, res: Response, component: ELogComponent): void => {
    work.catch(err => {
        logError(component, `Unhandled error while serving ${res.req?.method} ${res.req?.originalUrl}: ${err}`)
        if (!res.headersSent) res.status(500).json({})
    })
}
