import { CoreV1Api, V1ConfigMap } from '@kubernetes/client-node'
import { IConfigMaps } from './IConfigMap'

export class KubernetesConfigMaps implements IConfigMaps {
    coreApi:CoreV1Api
    namespace:string

    constructor (coreApi: CoreV1Api, namespace:string) {
        this.coreApi=coreApi
        this.namespace=namespace
    }

    public write = async (name:string, data:any): Promise<any> =>{
        try {
            var configMap:V1ConfigMap = {
                metadata: {
                    name: name,
                    namespace: this.namespace
                },
                data: { data: JSON.stringify(data) }
            };
            try {
                await this.coreApi?.replaceNamespacedConfigMap({ name: name, namespace: this.namespace, body: configMap })
                return {}
            }
            catch (err:any) {
                console.log(`Error replacing, try to create.`)
                try {
                    await this.coreApi?.createNamespacedConfigMap({ namespace: this.namespace, body: configMap })
                    return {}
                }
                catch (err:any) {
                    console.log(`Error creating ConfigMap`)
                    console.log(err)
                    return {}
                }
            }
        }
        catch (err) {
            console.log('Error writing configMap',this.namespace,'/', name)
            console.log(err)
            return undefined
        }
    
    }
    
    public read = async (name:string, defaultValue:any=undefined): Promise<any> => {
        try {
            var ct = await this.coreApi?.readNamespacedConfigMap({ name: name, namespace: this.namespace })
            if (ct.data===undefined) ct.data={ data: defaultValue }
            return JSON.parse(ct.data.data)
        }
        catch(err:any){
            if (err.code===404) {
                console.log('Value not found reading configMap',this.namespace,'/', name)
                return defaultValue
            }
            else {
                console.log('Error reading kubernetes configMap',this.namespace,'/', name)
                return undefined
            }
        }
    }
}
