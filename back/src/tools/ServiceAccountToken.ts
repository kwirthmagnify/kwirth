import { AuthenticationV1TokenRequest, CoreV1Api } from '@kubernetes/client-node'

export class ServiceAccountToken {
    coreApi:CoreV1Api
    namespace:string

    constructor (coreApi: CoreV1Api, namespace:string) {
        this.coreApi=coreApi
        this.namespace=namespace
    }

    // public createToken = async (serviceAccountName: string, namespace: string) => {
    //     const secret = {
    //         apiVersion: 'v1',
    //         kind: 'Secret',
    //         metadata: {
    //             name: `${serviceAccountName}-kwirthtoken`,
    //             namespace: namespace,
    //             annotations: {
    //                 'kubernetes.io/service-account.name': serviceAccountName,
    //             },
    //         },
    //         type: 'kubernetes.io/service-account-token'
    //     }

    //     // we first delete it if it exists, we cannot use a previous token, it may be expired
    //     try {
    //         await this.coreApi.readNamespacedSecret({ name:serviceAccountName+'-kwirthtoken', namespace })
    //         await this.deleteToken(serviceAccountName, namespace)
    //     }
    //     catch (err) {
    //         console.log(`Token does not exists. A new one will be created (${namespace}/${serviceAccountName}-kwirthtoken)`)
    //     }

    //     // we now create it
    //     try {
    //         console.log(secret)
    //         await this.coreApi.createNamespacedSecret({namespace, body:secret})
    //         console.log('SA token created')
    //     }
    //     catch (err:any) {
    //         console.log('Error creating SA token')
    //         console.log(err?.response?.body || err)
    //     }
    // }
    
    // public extractToken = async (serviceAccountName: string, namespace: string) => {
    //     try {
    //         const response = await this.coreApi.readNamespacedSecret({ name:serviceAccountName+'-kwirthtoken', namespace })
    //         const token = Buffer.from(response.data!.token, 'base64').toString('utf-8')
    //         return token
    //     }
    //     catch (err) {
    //         console.log('Error extracting token')
    //         console.log(err)
    //     }
    //     return undefined
    // }

    createToken = async (serviceAccountName: string, namespace: string) => {
        try {
            const tokenRequest: AuthenticationV1TokenRequest = {
                spec: {
                    audiences: ["https://kubernetes.default.svc"],
                    expirationSeconds: 3600
                }
            }

            const response = await this.coreApi.createNamespacedServiceAccountToken({ name: serviceAccountName, namespace, body: tokenRequest })
            const token = response.status?.token
            console.log(`Token created for '${serviceAccountName}':`)
            return token
        }
        catch (err: any) {
            console.error('Error creating SA token:', err?.response?.body || err);
        }
    }    


    public deleteToken = async (serviceAccountName: string, namespace: string) => {
        try {
            const response = await this.coreApi.deleteNamespacedSecret({ name:serviceAccountName+'-kwirthtoken', namespace })
            console.log('SA token deleted')
        }
        catch (err) {
            console.log('Error deleting SA token')
            console.log(err)
        }
    }
    
}