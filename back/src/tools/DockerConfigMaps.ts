import { CoreV1Api } from '@kubernetes/client-node'
import { IConfigMaps } from './IConfigMap'
import fs from 'fs'

export class DockerConfigMaps implements IConfigMaps {
    path:string

    constructor (_coreApi: CoreV1Api, namespace:string) {
        if (!namespace.endsWith('/')) namespace+='/'
        this.path = namespace
    }

    public write = async (name:string, data:any): Promise<any> =>{
        try {
            fs.writeFileSync(this.path + name, JSON.stringify(data))
        }
        catch (err:any) {
            console.log(`Error writing (${err}).`)
            console.log(err)
            return {}
        }
    }
    
    public read = async (name:string, defaultValue:any=undefined): Promise<any> => {
        try {
            let data = fs.readFileSync(this.path+name, 'utf-8')
            return JSON.parse(data)
        }
        catch (err) {
            console.log(`Error reading docker configMap ${name}. Return default value.`)
            console.log(err)
            return defaultValue
        }
    }
}
