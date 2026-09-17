import React, { useContext, useEffect, useState } from 'react'
import { Checkbox, Chip, MenuItem, Select, Tooltip } from '@mui/material'
import { CheckCircle, FolderOpen, Palette } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addGetAuthorization, addPutAuthorization } from '../tools/AuthorizationManagement'
import { compactChip } from './MarketplaceBadge'
import { EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IUninstallVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `theme` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    PRIMER manager a medida que se migra, y por eso importa: `aitoolset` era codigo nuevo y no tenia nada
    que romper; themes lo usa gente. Lo que este fichero tiene que conseguir es que la pantalla se vea y
    se comporte IGUAL, con 523 lineas menos.

    Lo que aporta el tipo, y solo eso:
      · el chip `active` del tema en uso
      · el Select de asignacion a plugins (que tema usa cada canal)
      · los chips de procedencia en lo instalado
      · cargar/descargar el front del tema al instalar y desinstalar

    ⚠️ Se queda fuera la imagen de PREVIEW como fondo de la tarjeta. Estaba montada de punta a punta
    —endpoint, `hasPreview`, copia en los build.mjs— y NUNCA se alimento: no existe ni un `preview.png` en
    ningun tema. Se descarta al migrar (decision del usuario, 2026-09-17). Cuando haga falta un fondo, sera
    un atributo generico de la tarjeta, no un `previewUrl` de themes.
*/

interface IThemeManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
}

interface IInstalledTheme {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
}

interface IInstalledPluginRef {
    id: string
    displayName?: string
}

/** Lo que el descriptor necesita de la aplicacion: que tema esta activo y quien lo usa. */
interface IThemeDescriptorDeps {
    activeThemeName: string | undefined
    assignments: Record<string, string>
    onAssignmentsChange: (a: Record<string, string>) => void
    onThemeLoad: (id: string) => void
    onThemeUnload: (id: string) => void
}

/*
    Que canales usan este tema.

    ⚠️ Vive FUERA de la factoria a proposito. Si se definiera dentro, cada render de App crearia un tipo de
    componente nuevo y React lo desmontaria y volveria a montar — el desplegable se cerraria solo al
    escribir en el filtro.
*/
const ThemeAssignSelector: React.FC<{
    themeId: string
    assignments: Record<string, string>
    onAssignmentsChange: (a: Record<string, string>) => void
    compact?: boolean
}> = ({ themeId, assignments, onAssignmentsChange, compact }) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [plugins, setPlugins] = useState<IInstalledPluginRef[]>([])
    const [error, setError] = useState('')

    useEffect(() => {
        fetch(`${backendUrl}/core/plugins`, addGetAuthorization(accessString))
            .then(r => r.json())
            .then((data: IInstalledPluginRef[]) => setPlugins(data))
            .catch(() => setError('Could not read plugins'))
    }, [backendUrl, accessString])

    const asignados = Object.entries(assignments).filter(([, tid]) => tid === themeId).map(([pid]) => pid)

    const asignar = async (pluginIds: string[]) => {
        // Se reconstruye el mapa entero: un plugin solo puede tener UN tema, asi que asignarselo a este
        // implica quitarselo al que tuviera.
        const next: Record<string, string> = {}
        for (const [pid, tid] of Object.entries(assignments)) {
            if (tid !== themeId) next[pid] = tid
        }
        for (const pid of pluginIds) next[pid] = themeId

        try {
            const res = await fetch(`${backendUrl}/core/themes/assignments`, addPutAuthorization(accessString, JSON.stringify(next)))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            onAssignmentsChange(next)
            setError('')
        }
        catch (err) { setError(`Failed to update assignment: ${err}`) }
    }

    if (plugins.length === 0) return null

    return (
        <Tooltip title={error || 'Plugins using this theme'}>
            <Select multiple size='small' displayEmpty value={asignados} error={Boolean(error)}
                onChange={e => asignar(e.target.value as string[])}
                renderValue={sel => (sel as string[]).length === 0
                    ? <em style={{ fontSize: '0.7rem', opacity: 0.5 }}>{compact ? '–' : 'No plugin'}</em>
                    : (sel as string[]).join(', ')}
                sx={{ height: 22, fontSize: '0.7rem', minWidth: 110, '& .MuiSelect-select': { py: 0, px: 1 } }}>
                {plugins.map(p => (
                    <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.7rem', py: 0.25 }}>
                        <Checkbox size='small' checked={asignados.includes(p.id)} sx={{ p: 0.5 }} />
                        {p.displayName || p.id}
                    </MenuItem>
                ))}
            </Select>
        </Tooltip>
    )
}

/*
    De donde vino lo que esta instalado, en chip.

    El icono de procedencia y el chip de marketplace los pone el generico; esto es el matiz que themes
    enseñaba ademas en lo INSTALADO: si es de dev, de un fichero local o de un pack. Se conserva tal cual
    para que la pantalla no cambie con la migracion.
*/
const sourceChip = (installedFrom?: string): React.ReactNode => {
    if (!installedFrom) return undefined
    if (installedFrom === 'dev') return <Chip key='src' label='dev' size='small' variant='outlined' color='warning' sx={compactChip} />
    if (installedFrom === 'local') return <Chip key='src' icon={<FolderOpen />} label='Local file' size='small' variant='outlined' sx={compactChip} />
    if (installedFrom.startsWith('pack:')) {
        return <Tooltip key='src' title={`Installed by pack '${installedFrom.slice(5)}'`}><Chip label='via pack' size='small' variant='outlined' color='secondary' sx={compactChip} /></Tooltip>
    }
    if (installedFrom.includes('github.com/kwirthmagnify')) return <Chip key='src' icon={<Palette />} label='Kwirth' size='small' variant='outlined' color='primary' sx={compactChip} />
    // Descargado de una URL suelta: nada. La direccion recortada llenaba la fila sin decir gran cosa, y ya
    // la da el tooltip del icono de procedencia.
    return undefined
}

const toModel = (e: IInstalledTheme | IThemeManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledTheme).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (t: IInstalledTheme): IUninstallVerdict => {
    if (t.installedFrom === 'dev') return { allowed: false, reason: 'Dev themes cannot be uninstalled' }
    if (t.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

/**
 * El descriptor es una FACTORIA porque necesita estado de la aplicacion (que tema esta activo, quien lo
 * usa). El de `aitoolset` no lo necesitaba y por eso es una constante.
 */
const makeThemeDescriptor = (deps: IThemeDescriptorDeps): IExtensionManagerDescriptor<IInstalledTheme, IThemeManifestEntry> => ({
    extensionType: EExtensionType.THEME,
    title: 'Manage themes',
    noun: { singular: 'theme', plural: 'themes' },
    helpSection: 'guide/extensions/themes/index?id=admin-guide',
    icon: <Palette fontSize='small' />,
    endpoints: {
        installed: '/core/themes',
        install: '/core/themes/install',
        upload: '/core/themes/upload',
        remove: t => `/core/themes/${t.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    extraChips: (e, section) => {
        if (section !== EManagerSection.INSTALLED) return []
        const chips: React.ReactNode[] = []
        // El tema que se esta usando de verdad. Es lo primero que se busca al abrir esta pantalla.
        if (deps.activeThemeName === e.id) {
            chips.push(<Chip key='active' label='active' size='small' color='primary' icon={<CheckCircle />} sx={compactChip} />)
        }
        const src = sourceChip((e as IInstalledTheme).installedFrom)
        if (src) chips.push(src)
        return chips
    },

    inlineControl: (e, section) => section === EManagerSection.INSTALLED
        ? <ThemeAssignSelector themeId={e.id} assignments={deps.assignments} onAssignmentsChange={deps.onAssignmentsChange} />
        : undefined,

    // El front del tema se carga y se descarga en caliente: sin esto habria que recargar la pagina para
    // ver un tema recien instalado.
    onInstalled: meta => deps.onThemeLoad(meta.id),
    onUninstalled: t => deps.onThemeUnload(t.id)
})

export { makeThemeDescriptor }
export type { IInstalledTheme, IThemeManifestEntry }
