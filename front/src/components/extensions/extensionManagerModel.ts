import { ComponentType, ReactNode } from 'react'
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
    /*
        El icono que declara la propia extension en su package.json: el nombre de uno del set curado, o un
        SVG en crudo para que pueda traer el suyo. Lo resuelve el generico (ver extensionIcon), que ademas
        SANEA el SVG: viene de una extension que puede haberse instalado desde un marketplace ajeno.
    */
    iconName?: string
    /*
        Una linea mas bajo la descripcion. La necesita `pack`, que es el unico tipo que CONTIENE otras
        extensiones y tiene que decir cuales ('2 plugins, 1 theme'). Va en una linea y con elipsis: un pack
        con muchos tipos creceria y se comeria la fila de procedencia y acciones.
    */
    subtitle?: string
}

/*
    Iconos que puede llevar un chip. Es un enum corto y cerrado a proposito: el descriptor DECLARA chips,
    no los pinta, y asi no necesita importar iconos ni ser un .tsx.
*/
export enum EChipIcon {
    /** Marca de "esto es lo que esta puesto ahora": el tema activo, la homepage activa. */
    ACTIVE = 'active',
    /** Viene de un fichero suelto del disco. */
    FILE = 'file',
    /** El icono del propio tipo de extension, el que declara el descriptor. */
    TYPE = 'type'
}

/** Un chip DECLARADO. El generico lo pinta; el tipo solo dice que quiere decir. */
export interface IExtensionChip {
    label: string
    color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'
    variant?: 'filled' | 'outlined'
    icon?: EChipIcon
    tooltip?: string
}

/**
 * El icono de un tipo de extension: el COMPONENTE, no un elemento ya montado.
 *
 * Asi el generico decide el tamaño segun donde lo pinte (tarjeta, fila, chip de procedencia) y el
 * descriptor se queda sin JSX.
 */
export type TExtensionIcon = ComponentType<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }>

/** Una accion propia de un tipo, mas alla de instalar/desinstalar/configurar. */
export interface IExtensionAction {
    icon: ReactNode
    tooltip: string
    onClick: () => void
    disabled?: boolean
    color?: 'primary' | 'error' | 'inherit'
}

/**
 * Si una accion se puede hacer sobre una entrada, y por que no.
 *
 * El motivo no es un adorno: la regla de UI del proyecto es que un control se queda visible y
 * deshabilitado, nunca escondido, asi que quien lo ve necesita leer por que no puede pulsarlo.
 */
export interface IExtensionVerdict {
    allowed: boolean
    reason?: string
}

/*
    "Que plugins van con esta extension", que resulta ser la misma pregunta en varios tipos:

      · themes     → que canales usan este tema
      · aitoolset  → que canales pueden usar este toolset (la concesion de la fase 1)

    Se escribio dos veces por separado —ThemeAssignSelector y GrantSelector— y las dos copias eran el mismo
    `Select multiple` con casillas, el mismo placeholder y el mismo alto. Peor: cada TARJETA pedia
    `/core/plugins` por su cuenta, asi que abrir el diálogo con doce instaladas eran doce peticiones
    identicas. Al subirlo aqui, el generico pide la lista UNA vez y el tipo solo dice de donde se lee y
    donde se guarda.

    El mapa de `load` va de CLAVE DE ENTRADA a ids de plugin, no al reves: es como se pinta (cada tarjeta
    pregunta por lo suyo) y como lo devuelve el back de aitoolsets. Themes lo tiene invertido —un plugin
    tiene UN tema— y es el descriptor quien lo da la vuelta, que para eso conoce su formato.
*/
export interface IPluginSelectorSpec<TInstalled> {
    /** Que significa el control, para el tooltip: 'Plugins using this theme'… */
    tooltip: string
    /** Que poner cuando no hay ninguno. Por defecto 'No plugin'. */
    emptyLabel?: string
    /** Clave de entrada → ids de plugin asociados. */
    load: () => Promise<Record<string, string[]>>
    /** Persistir la nueva seleccion de ESA entrada. Si lanza, el generico deshace y enseña el motivo. */
    save: (entry: TInstalled, pluginIds: string[]) => Promise<void>
}

/**
 * Una dependencia entre extensiones, tal y como viene en el manifest.
 *
 * `requires` es obligatoria —sin ella la extension no funciona, asi que no se deja instalar— y `uses` es
 * opcional: si esta, se aprovecha. Las declaraba cualquier extension, pero solo las miraban plugins y
 * providers, cada uno con su copia. Ahora las entiende el generico para los ONCE tipos.
 */
export interface IExtensionRequirement {
    extensionType: EExtensionType
    id: string
    minVersion: string
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
    icon: TExtensionIcon

    /** Rutas del back. El generico no las adivina: IdP, por ejemplo, no cuelga de /core/<plural>. */
    endpoints: {
        installed: string
        install: string
        upload: string
        remove: (entry: TInstalled) => string
    }

    /**
     * Que dice el boton de desinstalar cuando SE PUEDE. Por defecto 'Uninstall'.
     *
     * Lo necesita `pack`: quitarlo se lleva por delante todas las extensiones que trajo, y eso hay que
     * avisarlo ANTES de pulsar, no despues.
     */
    uninstallTooltip?: string

    /*
        Que entradas de lo instalado SON de este gestor.

        Lo necesita `provider`: su endpoint devuelve tambien los providers del core (events, metrics), que
        no son extensiones — no se instalan ni se desinstalan, y pintarlos invita a intentar quitarlos.
    */
    filterInstalled?: (entry: TInstalled) => boolean

    keyOf: (entry: TInstalled | TEntry) => string
    toModel: (entry: TInstalled | TEntry) => IExtensionCardModel
    canUninstall: (entry: TInstalled) => IExtensionVerdict

    /** Datos extra que el tipo necesita y el generico desconoce (las instancias de IdP, los plugins de themes). */
    loadExtraData?: () => Promise<void>

    /** Si devuelve un numero, el generico pinta el chip 'N configs'. */
    configCount?: (entry: TInstalled) => number | undefined
    /** Si existe, el generico pinta el engranaje y monta esto al pulsarlo. */
    renderConfigDialog?: (entry: TInstalled, onClose: () => void) => ReactNode
    /**
     * Si ESTA entrada tiene configuracion. Sin esto, el engranaje sale vivo en todas las del tipo.
     *
     * Que el TIPO se configure no quiere decir que se configuren todas sus extensiones: un provider se
     * configura si trae front propio o declara schema, un plugin o un login si declaran configSchema, y
     * una homepage solo la activa que traiga SetupDialog.
     *
     * El engranaje se queda VISIBLE y deshabilitado con el motivo. Esconderlo deja a quien mira
     * preguntandose si esa extension se configurara en otro sitio.
     */
    canConfigure?: (entry: TInstalled) => IExtensionVerdict

    /*
        Chips propios del tipo: 'active', 'enabled', 'Requires 2'…

        ⚠️ La PROCEDENCIA no entra aqui: los chips de dev / fichero local / via pack / Kwirth los pone el
        generico para todos los tipos. Estaban copiados uno por diálogo y solo se diferenciaban en el icono
        del chip 'Kwirth', que no es mas que el icono del tipo.
    */
    extraChips?: (entry: TInstalled | TEntry, section: EManagerSection) => IExtensionChip[]
    /** Acciones propias: abrir la guia, abrir la pagina de login… */
    actions?: (entry: TInstalled | TEntry, section: EManagerSection) => IExtensionAction[]

    /**
     * El selector de plugins de lo instalado, a la izquierda de los botones de accion. Es UN sitio en la
     * tarjeta y en la fila, no dos maquetaciones distintas.
     */
    pluginSelector?: IPluginSelectorSpec<TInstalled>

    /** Si devuelve un motivo, instalar queda deshabilitado y el motivo va al tooltip (dependencias sin cumplir). */
    installBlockedReason?: (entry: TEntry) => string | undefined

    /** Efectos del alta/baja: un pack carga el front de cada extension que trae. */
    onInstalled?: (meta: TInstalled) => void
    onUninstalled?: (entry: TInstalled) => void
}
