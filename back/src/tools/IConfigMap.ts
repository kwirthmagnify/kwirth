export interface IConfigMaps {
    write: (name: string, data: any) => any
    read: (name: string, defaultValue?: any) => any
    writeKey: (name: string, key: string, value: any) => Promise<void>
    readAllKeys: (name: string) => Promise<Record<string, any>>

    /*
        Cuanto admite UN objeto, en bytes, o `undefined` si no hay tope practico.

        No es un ajuste de configuracion: un ConfigMap de Kubernetes no pasa de ~1 MiB (es lo que etcd
        admite por clave), y el resto de almacenamientos —fichero en disco, desktop, docker— no tienen ese
        techo. Quien vaya a guardar algo grande, como el fondo de una pagina de login, necesita PREGUNTARLO
        para decidir, en vez de aplicarle a todos el limite del mas estrecho.
    */
    storeLimit: () => number | undefined
}
