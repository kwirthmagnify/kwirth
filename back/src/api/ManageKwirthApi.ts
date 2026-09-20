import express, { Request, Response} from 'express'
import { AppsV1Api, BatchV1Api, CoreV1Api } from '@kubernetes/client-node'
import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { getPreviousContainerLog } from '../tools/PreviousContainerLog'

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
                    this.restartController(this.coreApi, this.appsApi, this.batchApi, kwirthData.namespace, 'deployment+' + kwirthData.deployment)
                    res.status(200).json()
                }
                catch (err) {
                    res.status(500).json()
                    console.log(err)
                }
            })

        /*
            Log del contenedor anterior, leido al arrancar (ver PreviousContainerLog).

            🔴 SOLO admin, y no por prudencia generica: esto entrega trazas internas del core —nombres de
            recursos, rutas, mensajes de error de extensiones—, o sea justo lo que no tiene que ver un
            usuario cualquiera que entra a mirar sus logs. El front tampoco ofrece el boton sin ese scope,
            pero quien manda es esta comprobacion.
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
