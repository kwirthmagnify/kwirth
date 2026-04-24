import { CoreV1Api } from '@kubernetes/client-node'
import { ISecrets } from './ISecrets'

export class KubernetesSecrets implements ISecrets {
    coreApi:CoreV1Api
    namespace:string

    constructor (coreApi: CoreV1Api, namespace:string) {
        this.coreApi=coreApi
        this.namespace=namespace
    }

    public write = async (name:string, content:{}) => {
        var secret = {
            metadata: {
                name: name,
                namespace: this.namespace
            },
            data: content
        };
        try {
            await this.coreApi?.replaceNamespacedSecret({ name: name, namespace: this.namespace, body: secret })
        }
        catch (err) {
            try {
                await this.coreApi?.createNamespacedSecret({ namespace: this.namespace, body: secret })
            }
            catch (err) {
                console.log(`Error writing secret ${name}`, err)
            }
        }
    }
    
    public read = async (name:string, defaultValue?:any): Promise<any> => {        
        try {
            var ct = await this.coreApi?.readNamespacedSecret({ name, namespace:this.namespace })
            if (ct.data===undefined) ct.data={ data: defaultValue }
            return ct.data
        }
        catch(err:any){
            if (err.code===404) {
                console.log('Value not found reading secret',this.namespace,'/', name)
                return defaultValue
            }
            else {
                console.log('Error reading kubernetes secret',this.namespace,'/', name)
                return undefined
            }
        }

    }  

}
