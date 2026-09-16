import { ReactNode } from 'react'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

/*
    Modelo del gestor de extensiones GENERICO (plan: plans/extension-managers-ui/PLAN.md).

    Habia once diálogos de gestión con el mismo esqueleto copiado once veces, y la copia derivaba: cada
    arreglo habia que aplicarlo once veces y bastaba olvidar uno para que el sintoma reapareciera. Se midio
    antes de escribir esto: entre ellos solo compartian LITERALMENTE el 22-59% del codigo, o sea que ya
    habian derivado, y por eso ninguno servia de canonico.

    Aqui vive lo que cada tipo tiene que APORTAR. Todo lo demas —las dos secciones, el filtro, el
    conmutador tarjeta/lista, el agrupado por version, instalar desde catalogo/URL/fichero, la procedencia,
    la altura de las tarjetas y las nueve reglas de UI— lo pone el generico, igual para todos.
*/

export enum EManagerSection {
    INSTALLED = 'installed',
    AVAILABLE = 'available'
}

/** Lo que el generico necesita saber de una entrada para pintarla, venga de donde venga. */
export interface IExtensionCardModel {
    name: string                 // ya resuelto: displayName || name || id. UN SOLO SITIO.
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceLabel?: string
    icon?: ReactNode             // si el tipo no lo da, el generico usa el icono del tipo
}

/** Una accion propia de un tipo, mas alla de instalar/desinstalar/configurar. */
export interface IExtensionAction {
    icon: ReactNode
    tooltip: string
    onClick: () => void
    disabled?: boolean
    color?: 'primary' | 'error' | 'inherit'
}

/** Si una entrada instalada se puede quitar, y por que no. El motivo se enseña en el tooltip. */
export interface IUninstallVerdict {
    allowed: boolean
    reason?: string
}

/*
    Lo que aporta un tipo de extension. Todo lo opcional es una CAPACIDAD: si no se declara, el generico
    simplemente no pinta esa parte.

    Dos decisiones que salieron de leer los diez diálogos enteros, y que no son caprichos:

      - `key` en vez de asumir `id`: la documentacion se identifica por el PAR (targetType, id), porque el
        id es el de la extension documentada y se repite entre tipos.
      - `canUninstall` en vez de repetir la cadena de `installedFrom`: lo no desinstalable cambia por tipo
        (dev en todos, bundled en unos, 'pack:' en casi todos, core en providers, un flag propio en IdP).
*/
export interface IExtensionManagerDescriptor<TInstalled, TEntry> {
    extensionType: EExtensionType
    /** Titulo del diálogo, p.ej. 'Manage AI toolsets'. */
    title: string
    /** Como se llama una de estas en singular y plural, para los textos del generico. */
    noun: { singular: string, plural: string }
    /*
        Seccion de la guia para el boton de ayuda (regla 7). OPCIONAL a proposito: un tipo recien creado
        todavia no tiene pagina de guia, y la propia regla dice que un boton que abre una seccion que no
        existe es peor que no tenerlo. Sin seccion, el generico pinta el titulo sin ayuda.
    */
    helpSection?: string
    /** Icono del tipo, el que se pinta cuando la entrada no trae uno propio. */
    icon: ReactNode

    /** Rutas del back. El generico no las adivina: IdP, por ejemplo, no cuelga de /core/<plural>. */
    endpoints: {
        installed: string
        install: string
        upload: string
        remove: (entry: TInstalled) => string
    }

    keyOf: (entry: TInstalled | TEntry) => string
    toModel: (entry: TInstalled | TEntry) => IExtensionCardModel
    canUninstall: (entry: TInstalled) => IUninstallVerdict

    /** Datos extra que el tipo necesita y el generico desconoce (las instancias de IdP, los plugins de themes). */
    loadExtraData?: () => Promise<void>

    /** Si devuelve un numero, el generico pinta el chip 'N configs'. */
    configCount?: (entry: TInstalled) => number | undefined
    /** Si existe, el generico pinta el engranaje y monta esto al pulsarlo. */
    renderConfigDialog?: (entry: TInstalled, onClose: () => void) => ReactNode

    /** Chips propios del tipo: 'active', 'enabled', 'Requires 2'… */
    extraChips?: (entry: TInstalled | TEntry, section: EManagerSection) => ReactNode[]
    /** Acciones propias: abrir la guia, abrir la pagina de login… */
    actions?: (entry: TInstalled | TEntry, section: EManagerSection) => IExtensionAction[]

    /** Si devuelve un motivo, instalar queda deshabilitado y el motivo va al tooltip (dependencias sin cumplir). */
    installBlockedReason?: (entry: TEntry) => string | undefined

    /** Efectos del alta/baja: un pack carga el front de cada extension que trae. */
    onInstalled?: (meta: TInstalled) => void
    onUninstalled?: (entry: TInstalled) => void
}
