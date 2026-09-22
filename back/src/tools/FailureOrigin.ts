/*
    ¿De quien es este fallo: del core o de una extension?

    Importa porque la respuesta decide si el core se muere. Un `unhandledRejection` se trataba siempre
    como fatal: `exitAndLog()` se llevaba el pod por delante. Y eso significa que **una promesa sin catch
    en una extension de terceros tira Kwirth entero**, con todos sus canales, para todos los usuarios.
    Paso de verdad: el provider 'trivy' hacia un fire-and-forget sin catch y bastaba con suscribirse a el
    sin payload desde provider-debug para matar el core.

    Matar el proceso por un fallo del CORE sigue teniendo sentido —puede haber quedado en un estado
    inconsistente—, pero por un fallo de una extension no: lo suyo es aislarlo, dejar traza con su nombre
    y seguir sirviendo a todo el mundo.

    Se atribuye por el stack, que es lo unico que hay. El core carga el back de cada extension desde un
    fichero en el tmpdir del sistema (`/tmp/kwirth-plugin-<id>-back.js`), asi que cuando el
    rechazo nace en su codigo, ahi esta su rastro.

    ⚠️ La heuristica es DELIBERADAMENTE conservadora: si no se puede atribuir a una extension, se trata
    como fallo del core y el proceso muere, como hasta ahora. Preferimos un reinicio de mas que tragarnos
    en silencio un fallo del core creyendo que era de un plugin.
*/

// `/tmp/kwirth-<tipo>-<id>-back.js`, que es como el core deja el back de una extension para requerirlo
const EXTENSION_BACK_FILE = /kwirth-(plugin|provider|sender|webhook|aitoolset|idp|login|homepage|theme|irq)-([A-Za-z0-9._-]+?)-(back|front)\.js/

export interface IFailureOrigin {
    kind: string
    id: string
}

/*
    Devuelve la extension a la que se puede atribuir el fallo, o undefined si no hay forma de saberlo.
    Acepta cualquier cosa porque un rechazo puede llevar dentro lo que sea: un Error, un string, un
    objeto de una libreria, o nada.
*/
export const failureOrigin = (value: unknown): IFailureOrigin|undefined => {
    const stack = value instanceof Error ? value.stack : undefined
    // Un rechazo con un valor que no es Error no trae stack, y sin stack no hay a quien atribuir
    if (!stack) return undefined
    const found = stack.match(EXTENSION_BACK_FILE)
    return found ? { kind: found[1], id: found[2] } : undefined
}
