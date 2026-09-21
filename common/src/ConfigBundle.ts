import { EExtensionType } from './ExtensionType'

/*
    Portabilidad de configuracion: llevarse la configuracion de un Kwirth a otro.

    La idea que lo gobierna todo —y que conviene tener presente al leer estos tipos— es que EL CORE NO
    ENTIENDE LO QUE TRANSPORTA. No puede: los plugins con back propio guardan su configuracion donde
    quieren, y los dos mas grandes la guardan en su propio Postgres, mezclada con datos de trabajo que
    NO deben viajar. Solo la extension sabe cual es cual.

    Asi que el reparto es:
      - la extension  decide que es configuracion suya, que exporta y que hace con lo que recibe
      - el core       reune, escribe el fichero, y en el otro extremo localiza al destinatario y le
                      entrega su parte; nunca mira dentro
      - quien lo usa  marca que entradas viajan, en el origen y en el destino

    Ver `plans/config-portability/PRD.md`.
*/

/** Que se le pide a una extension cuando se le pide su configuracion. */
export interface IExtensionExportOptions {
    /*
        Si es false, la extension debe devolver sus campos secreto VACIOS, no omitirlos: el destino
        necesita saber que existen para pedir que se rellenen. Por defecto va desmarcado en la UI —un
        bundle con credenciales acaba en la carpeta de descargas de alguien.
    */
    includeCredentials: boolean
}

/*
    Lo que una extension responde al importar. Es lo UNICO que el core sabe del contenido, asi que es
    lo unico que puede enseñar en el informe final: de ahi que sea igual para todas.
*/
export interface IExtensionImportResult {
    applied: number
    skipped: number
    /** Por que se descarto algo, o que hay que revisar. Se muestra tal cual al usuario. */
    warnings: string[]
}

/** Estado de una entrada, tanto al listar lo exportable como al previsualizar un import. */
export enum EBundleEntryStatus {
    /** Se puede exportar / se va a aplicar. */
    AVAILABLE = 'available',
    /** La extension esta, pero no implementa el metodo: `IExtension` es opcional. */
    NOT_SUPPORTED = 'not-supported',
    /*
        Instalada pero sin instancia viva a la que preguntar. Pasa con los canales: solo se instancian
        los requeridos, y nunca los anunciados como REMOTE. No se instancia una temporal a proposito:
        un constructor de canal puede abrir informers y conexiones, y despertar medio plugin para leerle
        una configuracion es un efecto secundario desproporcionado.
    */
    NOT_INSTANTIATED = 'not-instantiated',
    /** Solo al importar: el bundle la trae y aqui no esta instalada. El core NO instala nada. */
    NOT_INSTALLED = 'not-installed',
    /** Se aplicara, pero la version de aqui no es la de origen. Avisa; no transforma nada. */
    VERSION_DIFFERS = 'version-differs'
}

/** Una extension dentro del bundle. */
export interface IConfigBundleEntry {
    type: EExtensionType
    id: string
    /** La del origen. No sirve para instalar —el core no instala—, sirve para saber que falta. */
    version?: string
    /** De donde vino en el origen, por el mismo motivo. */
    marketplace?: string
    /*
        OPACO para el core: lo produce `exportConfig` de la extension y se lo come su `importConfig`.
        De ahi el `unknown`: no es dejadez de tipos, es que tiparlo seria mentir.
    */
    config: unknown
}

/** Lo que aporta el core por su cuenta. Nada de esto pertenece a una extension. */
export interface IConfigBundleCore {
    /** Intervalo de metricas, marketplaces y registros de paquetes. */
    settings?: unknown
    /** El almacen comun: proveedores y modelos de IA. No es de nadie, asi que va aparte. */
    sharedAi?: unknown
}

export interface IConfigBundleMeta {
    exportedAt: string
    kwirthVersion: string
    /** Etiqueta libre del origen, para saber de donde salio el fichero al abrirlo meses despues. */
    source?: string
    /** El fichero declara si lleva secretos dentro. Quien lo guarda merece saberlo. */
    includesCredentials: boolean
}

export const CONFIG_BUNDLE_KIND = 'kwirth-config-bundle'

/*
    Version del ENVOLTORIO, no del contenido. Existe desde el primer dia para que un Kwirth viejo pueda
    decir "no se leer esto" en vez de romperse a medias con un formato que no conoce.
*/
export const CONFIG_BUNDLE_FORMAT_VERSION = 1

export interface IConfigBundle {
    kind: typeof CONFIG_BUNDLE_KIND
    formatVersion: number
    meta: IConfigBundleMeta
    core: IConfigBundleCore
    extensions: IConfigBundleEntry[]
}

/*
    Como se nombra una entrada para marcarla o desmarcarla. Vive aqui, y no en el back, porque el front
    construye las mismas claves para decir que quiere: dos implementaciones del mismo formato acabarian
    divergiendo el dia que un id lleve un caracter raro.
*/
export const CORE_SETTINGS_KEY = 'core/settings'
export const CORE_SHARED_AI_KEY = 'core/sharedAi'
export const bundleEntryKey = (type: EExtensionType, id: string): string => `${type}/${id}`

/** Una linea del dialogo de export: que hay para exportar y si se puede. */
export interface IExportableEntry {
    type: EExtensionType
    id: string
    displayName: string
    version?: string
    marketplace?: string
    status: EBundleEntryStatus
}

/** Una linea de la vista previa del import: que pasaria con ella. */
export interface IImportPreviewEntry {
    type: EExtensionType
    id: string
    displayName: string
    /** La que trae el bundle. */
    version?: string
    /** La que hay aqui, si esta instalada. */
    installedVersion?: string
    status: EBundleEntryStatus
}

/** Lo que devuelve el import: que hizo cada entrada. */
export interface IImportEntryOutcome {
    type: EExtensionType
    id: string
    status: EBundleEntryStatus
    /** Lo que respondio la extension, cuando se la pudo llamar. */
    result?: IExtensionImportResult
    /** Por que no se pudo, o que fallo. Una entrada rota NO detiene a las demas. */
    error?: string
}

export interface IImportReport {
    entries: IImportEntryOutcome[]
    coreApplied: string[]
}
