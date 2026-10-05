import express, { Request, Response} from 'express'
import { AppsV1Api, BatchV1Api, CoreV1Api } from '@kubernetes/client-node'
import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { getPreviousContainerLog } from '../tools/PreviousContainerLog'
import { ELogComponent, logInfo } from '../tools/Logging'

export class ManageKwirthApi {
    public router = express.Router()
    coreApi:CoreV1Api
    appsApi:AppsV1Api
    batchApi:BatchV1Api
    
    constructor (coreApi:CoreV1Api, appsApi:AppsV1Api, batchApi:BatchV1Api, apiKeyApi: ApiKeyApi, kwirthData:KwirthData) {
        this.coreApi=coreApi
        this.appsApi=appsApi
        this.batchApi=batchApi

        // restart kwirth
        this.router.route('/restart')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    /*
                        No Kubernetes API (ECS, ACI, Cloud Run, bare OS): there is no deployment to
                        restart. The way to restart is to exit the process — the scheduler (ECS service,
                        ACI, systemd…) starts a new task, and on Fargate that means a fresh image pull
                        from the registry, so a newly pushed tag is picked up. The response is sent first
                        so the client gets it before the process goes away.
                    */
                    if (!this.coreApi) {
                        logInfo(ELogComponent.CORE, 'Restart requested in a non-Kubernetes environment: exiting the process so the scheduler starts a new task')
                        res.status(200).json({ restarted: true, method: 'process-exit' })
                        setTimeout(() => process.exit(0), 500)
                        return
                    }
                    this.restartController(this.coreApi, this.appsApi, this.batchApi, kwirthData.namespace, 'deployment+' + kwirthData.deployment)
                    res.status(200).json()
                }
                catch (err) {
                    res.status(500).json()
                    console.log(err)
                }
            })

        /*
            The previous container's log, read at startup (see PreviousContainerLog).

            🔴 ADMIN ONLY, and not out of generic caution: this hands over the core's internal traces
            —resource names, routes, extension error messages—, that is, exactly what an ordinary user
            coming in to look at their logs must not see. The front end does not offer the button
            without that scope either, but the one in charge is this check.
        */
        this.router.route('/previouslog')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .get( async (_req:Request, res:Response) => {
                res.status(200).json(getPreviousContainerLog())
            })

        /*
            The log of the container running RIGHT NOW, which is the counterpart of '/previouslog': one
            explains a death, this one explains what is happening.

            🔴 ADMIN ONLY, for the same reason as the previous one: these are the core's internal traces.

            It reads the pod's log the same way PreviousContainerLog does, minus 'previous'. No container
            is named: a Kwirth pod carries one, and if somebody put a sidecar in there Kubernetes says so
            and the reason reaches the dialog.

            A failure answers 200 with 'unavailableReason' instead of an error status, which is the shape
            '/previouslog' already uses: for whoever is looking, "there is no log and this is why" is an
            answer, not a failed request.
        */
        this.router.route('/log')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .get( async (req:Request, res:Response) => {
                const podName = process.env.HOSTNAME
                if (!kwirthData.inCluster || !podName) {
                    res.status(200).json({ lines: [], unavailableReason: `This kwirth is not running as a pod, so there is no container log to read. The execution environment is '${kwirthData.executionEnvironment}', and this viewer needs kwirth deployed inside the cluster` })
                    return
                }
                try {
                    // Clamped because it comes from the query string: a tail of millions of lines is a way
                    // of asking the core to hold the whole log in memory to answer one dialog.
                    const asked = Number(req.query.lines)
                    const tailLines = Math.min(Math.max(isNaN(asked) ? 1000 : Math.floor(asked), 1), 10000)
                    const log = await this.coreApi.readNamespacedPodLog({ name: podName, namespace: kwirthData.namespace, tailLines })
                    const lines = String(log ?? '').split('\n')
                    // a log ending in \n leaves a last empty line that adds nothing
                    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
                    res.status(200).json({ lines })
                }
                catch (err) {
                    res.status(200).json({ lines: [], unavailableReason: err instanceof Error ? err.message : String(err) })
                }
            })

    }

    restartController = async (coreApi:CoreV1Api, appsApi:AppsV1Api, batchApi: BatchV1Api, namespace:string, controllerTypeName:string): Promise<void> => {
        try {
            let result = await AuthorizationManagement.getPodLabelSelectorsFromController(coreApi, appsApi, batchApi, namespace, controllerTypeName)

            // Delete all pods, which forces kubernetes to recreate them
            for (const pod of result.pods) {
                const podName = pod.metadata?.name
                if (podName) {
                    await coreApi.deleteNamespacedPod({ name: podName, namespace: namespace })
                    console.log(`Pod ${podName} deleted.`)
                }
            }
        }
        catch (error) {
            console.log(`Error restarting controller: ${error}`)
        }
    }

}
