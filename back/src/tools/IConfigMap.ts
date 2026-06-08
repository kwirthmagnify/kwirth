export interface IConfigMaps {
    write: (name: string, data: any) => any
    read: (name: string, defaultValue?: any) => any
    writeKey: (name: string, key: string, value: any) => Promise<void>
    readAllKeys: (name: string) => Promise<Record<string, any>>
}
