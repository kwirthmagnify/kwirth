import { ISecrets } from './ISecrets'
import fs from 'fs'
import path from 'path'
import os from 'os'

export class NodeSecrets implements ISecrets {
    private dir: string

    constructor(baseDir?: string) {
        this.dir = baseDir ? path.join(baseDir, 'secrets') : path.join(os.homedir(), '.kwirth', 'secrets')
        fs.mkdirSync(this.dir, { recursive: true })
    }

    write = async (name: string, data: {}): Promise<void> => {
        try {
            fs.writeFileSync(path.join(this.dir, name), JSON.stringify(data))
        } catch (err: any) {
            console.log(`Error writing secret (${err}).`)
        }
    }

    read = async (name: string, defaultValue?: any): Promise<any> => {
        try {
            return JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf-8'))
        } catch {
            return defaultValue
        }
    }

    writeKey = async (name: string, key: string, value: any): Promise<void> => {
        const file = path.join(this.dir, name)
        let existing: Record<string, any> = {}
        try { existing = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch {}
        if (value === null) delete existing[key]
        else existing[key] = value
        try { fs.writeFileSync(file, JSON.stringify(existing)) } catch (err: any) { console.log(`Error writing key '${key}' in secret ${name}: ${err}`) }
    }

    readAllKeys = async (name: string): Promise<Record<string, any>> => {
        const file = path.join(this.dir, name)
        try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return {} }
    }
}
