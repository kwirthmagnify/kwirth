import { ISecrets } from './ISecrets'
import fs from 'fs'
import path from 'path'
import os from 'os'

export class NodeSecrets implements ISecrets {
    private dir: string

    constructor() {
        this.dir = path.join(os.homedir(), '.kwirth', 'secrets')
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
}
