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
        if (data === null) {
            try {
                fs.unlinkSync(this.path + name)
            }
            catch (err:any) {
                if (err.code !== 'ENOENT') console.log(`Error deleting (${err}).`)
            }
            return {}
        }
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

    public writeKey = async (name: string, key: string, value: any): Promise<void> => {
        const file = this.path + name
        let existing: Record<string, any> = {}
        try { existing = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch {}
        if (value === null) delete existing[key]
        else existing[key] = value
        try { fs.writeFileSync(file, JSON.stringify(existing)) } catch (err: any) { console.log(`Error writing key '${key}' in docker configMap ${name}: ${err}`) }
    }

    public readAllKeys = async (name: string): Promise<Record<string, any>> => {
        try { return JSON.parse(fs.readFileSync(this.path + name, 'utf-8')) } catch { return {} }
    }
}
