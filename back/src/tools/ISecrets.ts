export interface ISecrets {
    write: (name: string, content: {}) => Promise<void>
    read: (name: string, defaultValue?: any) => Promise<any>
    writeKey: (name: string, key: string, value: any) => Promise<void>
    readAllKeys: (name: string) => Promise<Record<string, any>>

    /*
        Cuanto admite UN objeto, en bytes, o `undefined` si no hay tope practico. Mismo criterio que en
        IConfigMaps: un Secret de Kubernetes tiene el mismo techo de ~1 MiB que un ConfigMap, y los
        almacenamientos de fichero no lo tienen. Quien guarda algo grande pregunta antes.
    */
    storeLimit: () => number | undefined
}
