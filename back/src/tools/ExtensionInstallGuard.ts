import { versionGreaterThan } from '@kwirthmagnify/kwirth-common'

/*
    Si una extension se puede instalar encima de otra, en UN SOLO SITIO.

    Instalar y actualizar son la MISMA operacion: el cuerpo de install() de todos los managers ya
    reemplazaba —indice, codigo cacheado, modulo del back recargado—, y lo unico que lo impedia era un
    guardian copiado nueve veces que rechazaba cualquier id ya instalada. Actualizar obligaba entonces a
    desinstalar primero, que es justo lo que se lleva por delante la configuracion.

    De ahi que el permiso sea EXPLICITO y venga de fuera: sin `upgrade` el comportamiento es el de
    siempre, y quien quiera pisar una instalacion tiene que pedirlo. Un install accidental no debe
    reemplazar nada por su cuenta.

    Y solo hacia adelante. Volver a una version anterior no es actualizar: deja el indice diciendo una
    cosa y la configuracion —que no se toca— pensada para otra. Reinstalar la MISMA version tampoco pasa,
    porque no arregla nada que no arregle desinstalar e instalar, y disimula el caso real de haber pulsado
    dos veces.
*/
export const assertInstallable = (kind: string, id: string, installed: { version?: string } | undefined, newVersion: string | undefined, upgrade?: boolean): void => {
    if (!installed) return
    if (!upgrade) throw new Error(`${kind} '${id}' is already installed`)
    /*
        Sin version en alguno de los dos lados no hay forma de saber si se avanza. Pasa de verdad: lo
        bundled no siempre la trae. Se rechaza en vez de dar el paso a ciegas.
    */
    if (!newVersion || !installed.version)
        throw new Error(`${kind} '${id}' cannot be updated: the installed or the new version is unknown`)
    if (!versionGreaterThan(newVersion, installed.version))
        throw new Error(`${kind} '${id}' v${installed.version} is already installed, and v${newVersion} is not newer`)
}
