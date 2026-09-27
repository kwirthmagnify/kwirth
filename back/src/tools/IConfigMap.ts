export interface IConfigMaps {
    write: (name: string, data: any) => any
    read: (name: string, defaultValue?: any) => any
    writeKey: (name: string, key: string, value: any) => Promise<void>
    readAllKeys: (name: string) => Promise<Record<string, any>>

    /*
        How much ONE object admits, in bytes, or `undefined` when there is no practical ceiling.

        It is not a configuration setting: a Kubernetes ConfigMap does not go beyond ~1 MiB (that is what
        etcd admits per key), and the other storages —file on disk, desktop, docker— have no such ceiling.
        Whoever is going to store something big, such as a login page's background, needs to ASK for it
        in order to decide, rather than applying the narrowest one's limit to everybody.
    */
    storeLimit: () => number | undefined
}
