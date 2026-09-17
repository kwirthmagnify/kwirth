import React, { useContext, useEffect, useState } from 'react'
import { Checkbox, Chip, MenuItem, Select, Tooltip } from '@mui/material'
import { Construction } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { addGetAuthorization, addPutAuthorization } from '../tools/AuthorizationManagement'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { compactChip } from './MarketplaceBadge'
import { EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IUninstallVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `aitoolset` (plan: plans/ai-tools/PLAN.md) y PRIMER cliente del gestor generico.
    Se estreno aqui a proposito: es el unico tipo sin diálogo propio, asi que estrenarlo no podia romper
    nada de lo que ya funcionaba.

    Sin diálogo propio: las dos secciones, el filtro, tarjeta/lista, el Select de version, instalar desde
    catalogo/URL/fichero y la procedencia los pone ExtensionManagerDialog.
*/

interface IAiToolsetEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url?: string
    marketplaceId?: string
    marketplaceLabel?: string
    installedFrom?: string
    requiresRestart?: boolean
    /** Solo en lo instalado: cuantas tools trae, para el chip. Lo rellena el catalogo del back. */
    toolCount?: number
}

/** Un plugin instalado, que es a quien se le puede conceder un toolset. */
interface IInstalledPluginRef {
    id: string
    displayName?: string
}

const toModel = (e: IAiToolsetEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: e.installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

// Un toolset built-in del core no se instala ni se desinstala: viene dentro. Y uno de dev lo gobierna
// kwirth-dev.json, no el diálogo.
const canUninstall = (e: IAiToolsetEntry): IUninstallVerdict => {
    if (e.installedFrom === 'dev') return { allowed: false, reason: 'Dev toolsets cannot be uninstalled' }
    if (e.installedFrom === 'bundled') return { allowed: false, reason: 'Built-in toolsets cannot be uninstalled' }
    if (e.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

/*
    LA CONCESION: que plugins pueden usar este toolset (plan: "El techo en dos fases", fase 1).

    Se concede desde el TOOLSET y no desde el plugin porque lo peligroso es el toolset: `k8s-ops` son las
    ocho tools de escritura, y asi "¿quien puede escribir en el cluster por IA?" se responde en UNA
    pantalla, en vez de recorriendo los canales instalados uno a uno.

    ⚠️ Por defecto no lo usa nadie: instalar deja el toolset disponible, no concedido.

    El control es el mismo patron que ThemeManagerDialog usa para asignar un tema a plugins —un Select
    multiple en la zona de acciones— y por eso el generico gano el hueco `inlineControl`: cuando themes se
    migre, lo hereda en vez de traerse su maquetacion.

    Se busca sus propios datos en vez de recibirlos del diálogo: el generico no sabe —ni tiene por que
    saber— que existen las concesiones.
*/
const GrantSelector: React.FC<{ toolsetId: string }> = ({ toolsetId }) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [plugins, setPlugins] = useState<IInstalledPluginRef[]>([])
    const [granted, setGranted] = useState<string[]>([])
    const [error, setError] = useState('')

    useEffect(() => {
        const cargar = async () => {
            try {
                const [pl, gr] = await Promise.all([
                    fetch(`${backendUrl}/core/plugins`, addGetAuthorization(accessString)).then(r => r.json()),
                    fetch(`${backendUrl}/core/aitoolsets/grants`, addGetAuthorization(accessString)).then(r => r.json())
                ])
                setPlugins(pl as IInstalledPluginRef[])
                setGranted(((gr as Record<string, string[]>)[toolsetId]) ?? [])
            }
            catch { setError('Could not read grants') }
        }
        cargar()
    }, [backendUrl, accessString, toolsetId])

    const conceder = async (seleccion: string[]) => {
        const anterior = granted
        setGranted(seleccion)   // optimista: el desplegable responde al momento
        try {
            const res = await fetch(`${backendUrl}/core/aitoolsets/grants/${toolsetId}`, addPutAuthorization(accessString, JSON.stringify({ plugins: seleccion })))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setError('')
        }
        catch (err) {
            // Se deshace: dejar la UI diciendo que esta concedido cuando el back no lo guardo es peor que
            // el propio fallo — el admin se iria creyendo que el techo esta puesto.
            setGranted(anterior)
            setError(`Could not grant: ${err}`)
        }
    }

    if (plugins.length === 0) return null

    return (
        <Tooltip title={error || 'Plugins allowed to use this toolset'}>
            <Select multiple size='small' displayEmpty value={granted}
                onChange={e => conceder(e.target.value as string[])}
                error={Boolean(error)}
                // 'No plugin' y no un hueco en blanco: un toolset sin conceder no lo usa nadie, y eso es
                // lo que explica que "no funcione". Es el estado por defecto, tiene que leerse.
                renderValue={sel => (sel as string[]).length === 0
                    ? <em style={{ fontSize: '0.7rem', opacity: 0.5 }}>No plugin</em>
                    : (sel as string[]).join(', ')}
                sx={{ height: 22, fontSize: '0.7rem', minWidth: 110, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                {/* Con casilla: sin ella un desplegable no parece de seleccion multiple, y el admin no
                    prueba a marcar dos. Mismo criterio que el ToolSelector de common-ai. */}
                {plugins.map(p => (
                    <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.7rem', py: 0.25 }}>
                        <Checkbox size='small' checked={granted.includes(p.id)} sx={{ p: 0.5 }} />
                        {p.displayName || p.id}
                    </MenuItem>
                ))}
            </Select>
        </Tooltip>
    )
}

const aiToolsetDescriptor: IExtensionManagerDescriptor<IAiToolsetEntry, IAiToolsetEntry> = {
    extensionType: EExtensionType.AITOOLSET,
    title: 'Manage AI toolsets',
    noun: { singular: 'AI toolset', plural: 'AI toolsets' },
    // La guia del tipo ya existe (CL9 2026-09-16), asi que el dialogo lleva su boton de ayuda (regla 7).
    // Apunta a la seccion del manager, no al principio de la pagina: quien abre la ayuda DESDE el dialogo
    // quiere lo que esta viendo, no la introduccion al concepto.
    helpSection: 'guide/extensions/aitoolsets/index?id=the-ai-toolsets-manager',
    icon: <Construction fontSize='small' />,
    endpoints: {
        installed: '/core/aitoolsets',
        install: '/core/aitoolsets/install',
        upload: '/core/aitoolsets/upload',
        remove: e => `/core/aitoolsets/${e.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,
    // Solo en lo INSTALADO: conceder algo que todavia no esta instalado no significa nada.
    inlineControl: (e, section) => section === EManagerSection.INSTALLED ? <GrantSelector toolsetId={e.id} /> : undefined,
    extraChips: e => e.toolCount === undefined ? [] : [
        <Chip key='tools' label={`${e.toolCount} tool${e.toolCount > 1 ? 's' : ''}`} size='small' variant='outlined' sx={compactChip} />
    ]
}

export { aiToolsetDescriptor }
export type { IAiToolsetEntry }
