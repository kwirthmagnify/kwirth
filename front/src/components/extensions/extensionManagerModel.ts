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

/** What the generic dialog needs to know about an entry in order to draw it, wherever it comes from. */
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
    /** A mark for "this is what is set right now": the active theme, the active homepage. */
    ACTIVE = 'active',
    /** It comes from a loose file on disk. */
    FILE = 'file',
    /** The extension type's own icon, the one the descriptor declares. */
    TYPE = 'type'
}

/** A DECLARED chip. The generic dialog draws it; the type only says what it means. */
export interface IExtensionChip {
    label: string
    color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'
    variant?: 'filled' | 'outlined'
    icon?: EChipIcon
    tooltip?: string
}

/**
 * An extension type's icon: the COMPONENT, not an already mounted element.
 *
 * That way the generic dialog decides the size according to where it draws it (card, row, provenance
 * chip) and the descriptor is left without JSX.
 */
export type TExtensionIcon = ComponentType<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }>

/** An action of a type's own, beyond install/uninstall/configure. */
export interface IExtensionAction {
    icon: ReactNode
    tooltip: string
    onClick: () => void
    disabled?: boolean
    color?: 'primary' | 'error' | 'inherit'
}

/**
 * Whether an action can be performed on an entry, and why not.
 *
 * The reason is no ornament: the project's UI rule is that a control stays visible and disabled, never
 * hidden, so whoever sees it needs to read why they cannot press it.
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
    /** What the control means, for the tooltip: 'Plugins using this theme'… */
    tooltip: string
    /** What to put when there is none. 'No plugin' by default. */
    emptyLabel?: string
    /** An entry's key → the ids of the plugins associated with it. */
    load: () => Promise<Record<string, string[]>>
    /** Persist THAT entry's new selection. If it throws, the generic dialog undoes it and shows the reason. */
    save: (entry: TInstalled, pluginIds: string[]) => Promise<void>
}

/**
 * A dependency between extensions, exactly as it comes in the manifest.
 *
 * `requires` is mandatory — without it the extension does not work, so installing is refused — and `uses`
 * is optional: if it is there, it is taken advantage of. Any extension declared them, but only plugins
 * and providers looked at them, each with its own copy. Now the generic dialog understands them for all
 * ELEVEN types.
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
    /** The dialog's title, e.g. 'Manage AI toolsets'. */
    title: string
    /** What one of these is called in singular and plural, for the generic dialog's texts. */
    noun: { singular: string, plural: string }
    /*
        Seccion de la guia para el boton de ayuda (regla 7). OPCIONAL a proposito: un tipo recien creado
        todavia no tiene pagina de guia, y la propia regla dice que un boton que abre una seccion que no
        existe es peor que no tenerlo. Sin seccion, el generico pinta el titulo sin ayuda.
    */
    helpSection?: string
    /** The type's icon, the one drawn when the entry carries none of its own. */
    icon: TExtensionIcon

    /** The back end's routes. The generic dialog does not guess them: IdP, for one, does not hang off /core/<plural>. */
    endpoints: {
        installed: string
        install: string
        upload: string
        remove: (entry: TInstalled) => string
    }

    /**
     * What the uninstall button says when it CAN be pressed. 'Uninstall' by default.
     *
     * `pack` needs it: removing one takes with it every extension it brought, and that has to be
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

    /** Extra data the type needs and the generic dialog knows nothing about (IdP's instances, themes' plugins). */
    loadExtraData?: () => Promise<void>

    /** If it returns a number, the generic dialog draws the 'N configs' chip. */
    configCount?: (entry: TInstalled) => number | undefined
    /** If it exists, the generic dialog draws the gear and mounts this on pressing it. */
    renderConfigDialog?: (entry: TInstalled, onClose: () => void) => ReactNode
    /**
     * Whether THIS entry has configuration. Without it, the gear comes out alive on every entry of the type.
     *
     * That the TYPE is configurable does not mean all of its extensions are: a provider is configurable
     * when it brings its own front end or declares a schema, a plugin or a login when they declare a
     * configSchema, and a homepage only the active one that brings a SetupDialog.
     *
     * The gear stays VISIBLE and disabled with the reason. Hiding it leaves whoever looks wondering
     * whether that extension is configured somewhere else.
     */
    canConfigure?: (entry: TInstalled) => IExtensionVerdict

    /*
        Chips propios del tipo: 'active', 'enabled', 'Requires 2'…

        ⚠️ La PROCEDENCIA no entra aqui: los chips de dev / fichero local / via pack / Kwirth los pone el
        generico para todos los tipos. Estaban copiados uno por diálogo y solo se diferenciaban en el icono
        del chip 'Kwirth', que no es mas que el icono del tipo.
    */
    extraChips?: (entry: TInstalled | TEntry, section: EManagerSection) => IExtensionChip[]
    /** Actions of its own: open the guide, open the login page… */
    actions?: (entry: TInstalled | TEntry, section: EManagerSection) => IExtensionAction[]

    /**
     * The plugin selector of what is installed, to the left of the action buttons. It is ONE place on the
     * card and on the row, not two different layouts.
     */
    pluginSelector?: IPluginSelectorSpec<TInstalled>

    /** If it returns a reason, installing is disabled and the reason goes to the tooltip (unmet dependencies). */
    installBlockedReason?: (entry: TEntry) => string | undefined

    /**
     * The same for UPDATING: if it returns a reason, the update button is disabled with it.
     *
     * Hardly any type needs it — updating is installing on top — but a pack is not just another extension:
     * its installation also refuses when any of its members is already in place, so replacing it means
     * updating them all, and the back end does not do that.
     */
    updateBlockedReason?: (entry: TInstalled) => string | undefined

    /** Side effects of install/uninstall: a pack loads the front end of every extension it brings. */
    onInstalled?: (meta: TInstalled) => void
    onUninstalled?: (entry: TInstalled) => void
}
