import { AuthenticationV1TokenRequest, CoreV1Api } from '@kubernetes/client-node'
import { ELogComponent, logError, logInfo } from './Logging'

export class ServiceAccountToken {
    coreApi:CoreV1Api
    namespace:string

    constructor (coreApi: CoreV1Api, namespace:string) {
        this.coreApi=coreApi
        this.namespace=namespace
    }
   
    createToken = async (serviceAccountName: string, namespace: string) => {
        try {
            const tokenRequest: AuthenticationV1TokenRequest = {
                spec: {
                    //audiences: ["https://kubernetes.default.svc"],
                    audiences: [],
                    expirationSeconds: 3600 * 24 * 7
                }
            }

            const response = await this.coreApi.createNamespacedServiceAccountToken({ name: serviceAccountName, namespace, body: tokenRequest })
            const token = response.status?.token
            logInfo(ELogComponent.CORE, `Token created for '${serviceAccountName}'`)
            return token
        }
        catch (err: any) {
            logError(ELogComponent.CORE, 'Error creating SA token: ' + err?.response?.body + err)
        }
    }    


    public deleteToken = async (serviceAccountName: string, namespace: string) => {
        try {
            const response = await this.coreApi.deleteNamespacedSecret({ name:serviceAccountName+'-kwirthtoken', namespace })
            logInfo(ELogComponent.CORE, 'SA token deleted')
        }
        catch (err) {
            logError(ELogComponent.CORE, 'Error deleting SA token')
            logError(ELogComponent.CORE, err)
        }
    }
    
}