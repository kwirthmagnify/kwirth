import { CoreV1Api, V1ConfigMap } from '@kubernetes/client-node'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import { LoginApi } from '../api/LoginApi'

export class KubernetesConfigMaps implements IConfigMaps {
    coreApi:CoreV1Api
    namespace:string

    constructor(coreApi: CoreV1Api, namespace:string) {
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
                logWarning(ELogComponent.CORE, `Error replacing, try to create.`)
                try {
                    await this.coreApi?.createNamespacedConfigMap({ namespace: this.namespace, body: configMap })
                    return {}
                }
                catch (err:any) {
                    logError(ELogComponent.CORE, `Error creating ConfigMap`)
                    logError(ELogComponent.CORE, err)
                    return {}
                }
            }
        }
        catch (err) {
            logError(ELogComponent.CORE, 'Error writing configMap'+this.namespace+'/'+name)
            logError(ELogComponent.CORE, err)
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
                logInfo(ELogComponent.CORE, 'Value not found reading configMap ' + this.namespace + '/' + name)
                return defaultValue
            }
            else {
                logError(ELogComponent.CORE, 'Error reading kubernetes configMap ' + this.namespace + '/' + name)
                return undefined
            }
        }
    }
}
