import { useState, useRef, useEffect, useMemo } from 'react'

// material & icons
import { Alert, AppBar, Box, CircularProgress, createTheme, CssBaseline, Drawer, FormControlLabel, IconButton, PaletteMode, Snackbar, SnackbarCloseReason, Stack, Switch, Tab, Tabs, ThemeProvider, Toolbar, Tooltip, Typography } from '@mui/material'
import { Settings as SettingsIcon, Menu, Person, AccountCircle, Home, Notifications, NotificationsActive } from '@kwirthmagnify/kwirth-common-front/icons'

// model
import { Cluster, IClusterInfo } from './model/Cluster'
import { resolveRemoteChannelHost } from './tools/ChannelResolution'

// components
import { RenameTab } from './components/RenameTab'
import { SaveWorkspace } from './components/workspace/SaveWorkspace'
import { SelectWorkspace }  from './components/workspace/SelectWorkspace'
import { WorkspacePickerDialog } from './components/workspace/WorkspacePickerDialog'
import { ManageApiSecurity } from './components/security/ManageApiSecurity'
import { Login } from './components/Login'
import { ManageClusters } from './components/ManageClusters'
import { ManageUserSecurity } from './components/security/ManageUserSecurity'
import { ResourceSelector, IResourceSelected } from './components/ResourceSelector'
import { TabContent } from './components/TabContent'
import { SettingsCluster } from './components/settings/SettingsCluster'
import { SettingsUser } from './components/settings/SettingsUser'
import { MenuTab, MenuTabOption } from './menus/MenuTab'
import { MenuDrawer, MenuDrawerOption } from './menus/MenuDrawer'
import { MsgBoxButtons, MsgBoxOk, MsgBoxOkError, MsgBoxYesNo } from './tools/MsgBox'
import { IChannelSettings, Settings } from './model/Settings'
import { FirstTimeLogin } from './components/FirstTimeLogin'
import { IWorkspace, IWorkspaceSummary } from './model/IWorkspace'

import { SessionContext } from './model/SessionContext'
import { addGetAuthorization, addDeleteAuthorization, addPostAuthorization } from './tools/AuthorizationManagement'
import { IInstanceMessage, versionGreaterThan, InstanceConfigScopeEnum, IInstanceConfig, InstanceMessageChannelEnum, parseResources, KwirthData, BackChannelData, IUser, ISignalMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, EInstanceConfigView, EInstanceConfigObject, AccessKey, accessKeyDeserialize, IAuthMethod, ILoginResponse, EExtensionType, EChannelMode } from '@kwirthmagnify/kwirth-common'
import { ITabObject, ITabSummary } from './model/ITabObject'

import { TChannelConstructor, EChannelRefreshAction, IChannel, IChannelMessageAction, ISetupProps } from './channels/IChannel'
import { MetricsChannel } from './channels/metrics/MetricsChannel'
import { MagnifyChannel } from './channels/magnify/MagnifyChannel'
import { getMetricsNames, ENotifyLevel, readClusterInfo } from './tools/Global'
import { Homepage } from './components/Homepage'
import { DEFAULTLASTTABS, IColors, TABSELECTEDCOLORS, TABUNSELECTEDCOLORS } from './tools/Constants'
import { createChannelInstance } from './tools/ChannelTools'
import { clusterColor } from './tools/clusterColor'
import { MenuNotification, INotification } from './components/MenuNotification'
import { ContextSelector } from './components/ContextSelector'
import { v4 as uuid } from 'uuid'
import { About } from './components/About'
import { PluginDialog } from './components/PluginDialog'
import { ProviderDialog } from './components/ProviderDialog'
import { ManageIdps } from './components/ManageIdps'
import { SenderDialog } from './components/SenderDialog'
import { ThemeDialog } from './components/ThemeDialog'
import { HomepageDialog } from './components/HomepageDialog'
import { DocsDialog } from './components/DocsDialog'
import { IHomepageExtension } from '@kwirthmagnify/kwirth-common-front'

interface IAppProps {
    backendUrl:string
    isDesktop: boolean
    auth: string
    authMethods: IAuthMethod[]
}

// Minimal shape of a raw kube Event as returned by /provider/events (projected to IClusterEvent for homepages).
interface IRawInvolvedObject {
    kind?: string
    name?: string
    namespace?: string
}
interface IRawKubeEvent {
    type?: string
    reason?: string
    message?: string
    lastTimestamp?: string
    eventTime?: string
    firstTimestamp?: string
    involvedObject?: IRawInvolvedObject
}

const App: React.FC<IAppProps> = (props:IAppProps) => {
    const [mode, setMode] = useState<PaletteMode>((localStorage.getItem('kwirth.mode') as PaletteMode) || 'light')
    const [activeThemeName, setActiveThemeName] = useState<string | undefined>(undefined)
    const [themeReady, setThemeReady] = useState(() => !localStorage.getItem('kwirth.theme'))
    const theme = useMemo( () => (activeThemeName && window.__kwirth_themes__?.[activeThemeName])
        ? createTheme(window.__kwirth_themes__[activeThemeName].getThemeOptions(mode))
        : createTheme({
        cssVariables: true,
        palette: { mode },
        components: {
            MuiCardHeader: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundColor: theme.palette.mode === 'dark' 
                            ? theme.palette.grey[900] 
                            : theme.palette.grey[100],
                        borderBottom: `1px solid ${theme.palette.divider}`,
                    })
                }
            },

            MuiPaper: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        // Eliminamos el overlay blanco de elevación en modo oscuro
                        backgroundImage: 'none !important', 
                        // Si es modo oscuro, usamos tu gris oscuro de las cards
                        backgroundColor: theme.palette.mode === 'dark' 
                            ? theme.palette.grey[900] 
                            : theme.palette.background.paper,
                    }),
                },
            },

            MuiDialog: {
                defaultProps: {
                    TransitionProps: {
                        onExit: () => { (document.activeElement as HTMLElement)?.blur() }
                    }
                },
                styleOverrides: {
                    root: ({ theme }) => ({
                        border: '1px',
                        borderColor: '#333',
                        borderStyle: 'solid',
                    }),
                    paper: ({ theme }) => ({
                        backgroundImage: 'none !important',
                        backgroundColor: theme.palette.mode === 'dark' ? '#121212' : '#fff',
                    }),
                },
            },

            MuiDialogTitle: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '&.MuiDialogTitle-root': {
                            backgroundColor: theme.palette.mode === 'dark' 
                                ? theme.palette.grey[900] 
                                : theme.palette.grey[100],
                            backgroundImage: 'none !important',
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            paddingTop: theme.spacing(1),
                            paddingBottom: theme.spacing(1),
                            color: theme.palette.text.primary,
                        }
                    }),
                },
            },

            MuiDialogContent: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '.MuiDialogTitle-root + &': {
                            paddingTop: theme.spacing(2),
                        },
                        '&.MuiDialogContent-dividers': {
                            borderColor: theme.palette.divider,
                        }
                    }),
                },
            },

            MuiDialogActions: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundColor: theme.palette.mode === 'dark' 
                            ? theme.palette.grey[900] 
                            : theme.palette.grey[50], // Un gris muy ligero en Light
                        borderTop: `1px solid ${theme.palette.divider}`,
                        padding: theme.spacing(1.5, 2),
                    }),
                },
            },

            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundImage: 'none',
                        backgroundColor: theme.palette.mode === 'dark'
                            ? theme.palette.grey[900]
                            : theme.palette.primary.main,
                    }),
                },
            },

            MuiCssBaseline: {
                styleOverrides: (theme) => ({
                    '::-webkit-scrollbar': {
                        width: '8px',
                        height: '8px',
                    },
                    '::-webkit-scrollbar-thumb': {
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
                        borderRadius: '4px',
                    },
                    '::-webkit-scrollbar-track': {
                        background: 'transparent',
                    },
                    '::-webkit-scrollbar-corner': {
                        background: 'transparent',
                    },
                }),
            },
        },
    }), [mode, activeThemeName])

    const [frontChannels, setFrontChannels] = useState<Map<string, TChannelConstructor>>(new Map())
    const [licenseInfo, setLicenseInfo] = useState<{ customerId: string; extensions: Record<string, string[]>; expiry: string } | null>(null)
    const [user, setUser] = useState<IUser>()
    const [logged,setLogged] = useState(false)
    const [firstLogin,setFirstLogin]=useState(false)
    const [refresh,setRefresh]=useState(0)

    const [backendUrl,setBackendUrl] = useState(props.backendUrl)
    const [accessString,setAccessString] = useState('')
    const [msgBox, setMsgBox] =useState(<></>)

    const [clusters, setClusters] = useState<Cluster[]>([])
    const clustersRef = useRef<Cluster[]>([])
    const [selectedClusterName, setSelectedClusterName] = useState<string>()

    const tabs = useRef<ITabObject[]>([])
    const selectedTab = useRef<ITabObject>()
    const [ fullscreenTab, setFullscreenTab ] = useState<ITabObject|undefined>(undefined)
    const [channelMessageAction, setChannelMessageAction] = useState<IChannelMessageAction>({action: EChannelRefreshAction.NONE})

    const userSettingsRef = useRef<Settings>(new Settings())
    const autoStartedRef = useRef<boolean>(false)
    const canExitFullscreenRef = useRef<boolean>(true)
    const [autoStartPending, setAutoStartPending] = useState<boolean>(false)
    const [ssoExchangePending, setSsoExchangePending] = useState<boolean>(() => !!new URLSearchParams(window.location.search).get('sso'))

    const [backChannels, setBackChannels] = useState<BackChannelData[]>([])
    const backChannelsRef = useRef(backChannels)
    backChannelsRef.current= backChannels

    // menus/navigation
    const [anchorMenuTab, setAnchorMenuTab] = useState<null | HTMLElement>(null)
    const [menuDrawerOpen,setMenuDrawerOpen]=useState(false)

    // workspaces
    const [currentWorkspaceName, setCurrentWorkspaceName] = useState('')
    const [currentWorkspaceDescription, setCurrentWorkspaceDescription] = useState('')
    const [workspaces, setWorkspaces] = useState<{name:string, description:string}[]>([])
    const [selectWorkspaceAction, setSelectWorkspaceAction] = useState('')

    // components
    const [showAbout, setShowAbout]=useState<boolean>(false)
    const [showRenameTab, setShowRenameLog]=useState<boolean>(false)
    const [showManageClusters, setShowManageClusters]=useState<boolean>(false)
    const [showSaveWorkspace, setShowSaveWorkspace]=useState<boolean>(false)
    const [showSelectWorkspace, setShowSelectWorkspace]=useState<boolean>(false)
    const [workspacePickerMode, setWorkspacePickerMode] = useState<'export'|'import'|null>(null)
    const [workspacePickerNames, setWorkspacePickerNames] = useState<string[]>([])
    const [pendingImportData, setPendingImportData] = useState<Record<string,any>>({})
    const [pendingExportData, setPendingExportData] = useState<Record<string,any>>({})
    const [showApiSecurity, setShowApiSecurity]=useState<boolean>(false)
    const [showUserSecurity, setShowUserSecurity]=useState<boolean>(false)
    const [showSettingsUser, setShowSettingsUser]=useState<boolean>(false)
    const [showSettingsCluster, setShowSettingsCluster]=useState<boolean>(false)
    const [showPluginDialog, setShowPluginDialog]=useState<boolean>(false)
    const [showProviderDialog, setShowProviderDialog]=useState<boolean>(false)
    const [showManageIdps, setShowManageIdps]=useState<boolean>(false)
    // const [showDaemonDialog, setShowDaemonDialog]=useState<boolean>(false)
    const [showSenderDialog, setShowSenderDialog]=useState<boolean>(false)
    const [showThemeDialog, setShowThemeDialog]=useState<boolean>(false)
    const [showHomepageDialog, setShowHomepageDialog]=useState<boolean>(false)
    const [showDocsDialog, setShowDocsDialog]=useState<boolean>(false)
    const [activeHomepageId, setActiveHomepageId]=useState<string|undefined>(undefined)
    const [homepageConfig, setHomepageConfig]=useState<Record<string, any>>({})
    const homepageIdMounted = useRef(false)
    const themeNameMounted = useRef(false)

    useEffect(() => { localStorage.setItem('kwirth.mode', mode) }, [mode])
    useEffect(() => {
        if (!themeNameMounted.current) { themeNameMounted.current = true; return }
        if (activeThemeName) localStorage.setItem('kwirth.theme', activeThemeName)
        else localStorage.removeItem('kwirth.theme')
    }, [activeThemeName])
    useEffect(() => {
        if (!homepageIdMounted.current) { homepageIdMounted.current = true; return }
        if (activeHomepageId) localStorage.setItem('kwirth.homepage', activeHomepageId)
        else localStorage.removeItem('kwirth.homepage')
    }, [activeHomepageId])
    useEffect(() => {
        if (activeHomepageId) {
            const saved = localStorage.getItem(`kwirth.homepage.config.${activeHomepageId}`)
            setHomepageConfig(saved ? JSON.parse(saved) : {})
        } else {
            setHomepageConfig({})
        }
    }, [activeHomepageId])

    const onHomepageActivate = (id: string | undefined, config: Record<string, any>) => {
        if (id) {
            localStorage.setItem(`kwirth.homepage.config.${id}`, JSON.stringify(config))
            setHomepageConfig(config)
        } else {
            setHomepageConfig({})
        }
        setActiveHomepageId(id)
    }

    const [initialMessage, setInitialMessage]=useState<string>('')

    // last & favs
    const [lastTabs, setLastTabs] = useState<ITabSummary[]>([])
    const [favTabs, setFavTabs] = useState<ITabSummary[]>([])
    const [lastWorkspaces, setLastWorkspaces] = useState<IWorkspaceSummary[]>([])
    const [favWorkspaces, setFavWorkspaces] = useState<IWorkspaceSummary[]>([])
    const dataCpu = useRef([])
    const dataMemory = useRef([])
    const dataNetwork = useRef([])

    // ui notifications
    const [notifySnackbarOpen, setNotifySnackbarOpen] = useState(false)
    const [notifySnackbarMessage, setNotifySnackbarMessage] = useState('')
    const [notifySnackbarLevel, setNotifySnackbarLevel] = useState<ENotifyLevel>(ENotifyLevel.INFO)
    //const [notifications, setNotifications] = useState<INotification[]>([])
    const [notificationMenuAnchorParent, setNotificationMenuAnchorParent] = useState<null | HTMLElement>(null)
    const notifications = useRef<INotification[]>([])
    const [resourceSelected, setResourceSelected] = useState<IResourceSelected|undefined>(undefined)
    const [pluginVersion, setPluginVersion] = useState(0)

    const pluginVersionsRef = useRef<Map<string, number>>(new Map())

    const loadPluginFront = (id: string) => {
        const existing = document.getElementById(`kwirth-plugin-${id}`)
        if (existing) existing.remove()
        const script = document.createElement('script')
        script.id = `kwirth-plugin-${id}`
        //script.src = `${props.backendUrl}/plugins/${id}/front?t=${Date.now()}`
        script.src = `${backendUrl}/plugins/${id}/front?t=${Date.now()}`
        script.onload = () => {
            const PluginChannel = window.__kwirth_plugins__?.[id]
            if (PluginChannel) {
                for (const tab of tabs.current) {
                    if (tab.channel.channelId === id) {
                        const refreshed = createChannelInstance(PluginChannel as TChannelConstructor)
                        if (refreshed) tab.channel = refreshed
                    }
                }
                setFrontChannels(prev => {
                    const next = new Map(prev).set(id, PluginChannel as TChannelConstructor)
                    for (const tab of tabs.current) {
                        if (tab.channel.requirements.frontChannels) {
                            tab.channelObject.frontChannels = next
                        }
                    }
                    return next
                })
                setPluginVersion(v => v + 1)
                setChannelMessageAction({ action: EChannelRefreshAction.REFRESH })
            }
        }
        document.head.appendChild(script)
    }

    const unloadPluginFront = (id: string) => {
        const script = document.getElementById(`kwirth-plugin-${id}`)
        if (script) script.remove()
        pluginVersionsRef.current.delete(id)
        setFrontChannels(prev => {
            const next = new Map(prev)
            next.delete(id)
            for (const tab of tabs.current) {
                if (tab.channel.requirements.frontChannels) {
                    tab.channelObject.frontChannels = next
                }
            }
            return next
        })
        setPluginVersion(v => v + 1)
    }

    const loadThemeFront = (id: string, onload?: () => void) => {
        const existing = document.getElementById(`kwirth-theme-${id}`)
        if (existing) existing.remove()
        const script = document.createElement('script')
        script.id = `kwirth-theme-${id}`
        script.src = `${backendUrl}/themes/${id}/front?t=${Date.now()}`
        if (onload) {
            script.onload = () => { console.log(`[themes] loaded theme front: ${id}`); onload() }
            script.onerror = () => { console.log(`[themes] failed to load theme front: ${id}`); setThemeReady(true) }
        }
        document.head.appendChild(script)
    }

    const loadHomepageFront = (id: string, onload?: () => void) => {
        const existing = document.getElementById(`kwirth-homepage-${id}`)
        if (existing) existing.remove()
        const script = document.createElement('script')
        script.id = `kwirth-homepage-${id}`
        script.src = `${backendUrl}/homepages/${id}/front?t=${Date.now()}`
        if (onload) script.onload = onload
        document.head.appendChild(script)
    }

    const unloadHomepageFront = (id: string) => {
        const script = document.getElementById(`kwirth-homepage-${id}`)
        if (script) script.remove()
        if (window.__kwirth_homepages__) delete window.__kwirth_homepages__[id]
        if (activeHomepageId === id) setActiveHomepageId(undefined)
    }

    const unloadThemeFront = (id: string) => {
        const script = document.getElementById(`kwirth-theme-${id}`)
        if (script) script.remove()
        if (window.__kwirth_themes__) delete window.__kwirth_themes__[id]
        if (activeThemeName === id) setActiveThemeName(undefined)
    }

    useEffect(() => {
        const ids = Array.from(frontChannels.keys())
        if (ids.length === 0) return
        let intervalId: ReturnType<typeof setInterval> | undefined

        const initAndPoll = async () => {
            const devIds: string[] = []
            for (const id of ids) {
                try {
                    const res = await fetch(`${backendUrl}/plugins/${id}/version`, { headers: { 'X-Kwirth-App': 'true' } })
                    if (!res.ok) continue
                    const { dev, version } = await res.json()
                    if (dev) { devIds.push(id); pluginVersionsRef.current.set(id, version) }
                } catch {}
            }
            if (devIds.length === 0) return
            intervalId = setInterval(async () => {
                for (const id of devIds) {
                    try {
                        const res = await fetch(`${backendUrl}/plugins/${id}/version`, { headers: { 'X-Kwirth-App': 'true' } })
                        if (!res.ok) continue
                        const { version } = await res.json()
                        const prev = pluginVersionsRef.current.get(id)
                        if (prev !== undefined && prev !== version) {
                            pluginVersionsRef.current.set(id, version)
                            loadPluginFront(id)
                        }
                    } catch {}
                }
            }, 2000)
        }

        initAndPoll()
        return () => { if (intervalId) clearInterval(intervalId) }
    }, [frontChannels])

    useEffect(() => {
        if (pluginVersion === 0) return
        const cluster = clusters?.find(c => c.name === selectedClusterName)
        if (!cluster) return
        readClusterInfo(cluster, notify).then(() => setUsablechannels(cluster))
    }, [pluginVersion])

    useEffect( () => {
        // only first time
        frontChannels.set('metrics', MetricsChannel)
        frontChannels.set('magnify', MagnifyChannel)
    },[])

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'F11' && event.ctrlKey && event.altKey && !event.shiftKey) {
                event.stopPropagation()
                event.preventDefault()
                setFullscreenTab( (prev) => {
                    if (prev!==undefined) {
                        if (!canExitFullscreenRef.current) return prev
                        return undefined
                    }
                    else {
                        if (selectedTab.current && selectedTab.current.channelStarted) return selectedTab.current
                    }
                })
            }
        }

        window.addEventListener('keydown', handleKeyDown, true)
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true)
            previousFocus?.focus()
        }
    }, [])

    useEffect ( () => {
        // only when user logs on / off
        if (!logged || !backendUrl) return

        getClusters()
        readLoggedUserSettings()

        // load front.js for already-installed plugins
        fetch(`${backendUrl}/plugins`, addGetAuthorization(accessString))
            .then(r => r.json())
            .then((plugins: { id: string }[]) => plugins.forEach(p => loadPluginFront(p.id)))
            .catch(err => console.log(`[plugins] failed to load installed plugins: ${err}`))

        // load front.js for already-installed themes
        fetch(`${backendUrl}/themes`, addGetAuthorization(accessString))
            .then(r => r.json())
            .then((themes: { id: string }[]) => {
                const savedTheme = localStorage.getItem('kwirth.theme')
                console.log(`[themes] installed themes: [${themes.map(t => t.id).join(', ')}], saved theme: ${savedTheme ?? 'none'}`)
                const activeFound = savedTheme && themes.some(t => t.id === savedTheme)
                themes.forEach(t => {
                    const isActive = t.id === savedTheme
                    loadThemeFront(t.id, isActive ? () => { setActiveThemeName(t.id); setThemeReady(true) } : undefined)
                })
                if (!savedTheme || !activeFound) {
                    console.log(`[themes] no active theme to load — marking ready`)
                    setThemeReady(true)
                }
            })
            .catch(err => { console.log(`[themes] failed to load installed themes: ${err}`); setThemeReady(true) })

        // load front.js for already-installed homepages, restoring active homepage from localStorage
        fetch(`${backendUrl}/homepages`, addGetAuthorization(accessString))
            .then(r => r.json())
            .then((homepages: { id: string }[]) => {
                const savedHomepage = localStorage.getItem('kwirth.homepage')
                if (savedHomepage && !homepages.some(h => h.id === savedHomepage)) localStorage.removeItem('kwirth.homepage')
                homepages.forEach(h => {
                    const isActive = h.id === savedHomepage
                    loadHomepageFront(h.id, isActive ? () => setActiveHomepageId(h.id) : undefined)
                })
            })
            .catch(err => console.log(`[homepages] failed to load installed homepages: ${err}`))

        // check for extension updates (dev only)
        if (process.env.NODE_ENV !== 'production') {
            (async () => {
                const MANIFESTS: Record<string, string> = {
                    plugin:   'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/plugins/manifest.json',
                    sender:   'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/senders/manifest.json',
                    provider: 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/providers/manifest.json',
                    theme:    'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/themes/manifest.json',
                }
                const ENDPOINTS: Record<string, string> = {
                    plugin:   `${backendUrl}/plugins`,
                    sender:   `${backendUrl}/senders`,
                    provider: `${backendUrl}/providers`,
                    theme:    `${backendUrl}/themes`,
                }
                try {
                    const types = Object.keys(MANIFESTS)
                    const [manifests, installeds] = await Promise.all([
                        Promise.all(types.map(t => fetch(MANIFESTS[t]).then(r => r.ok ? r.json() : []).catch(() => []))),
                        Promise.all(types.map(t => fetch(ENDPOINTS[t], addGetAuthorization(accessString)).then(r => r.ok ? r.json() : []).catch(() => [])))
                    ])
                    const updates: string[] = []
                    types.forEach((type, i) => {
                        const manifest: { id: string, version: string }[] = manifests[i]
                        const installed: { id: string, version: string, installedFrom?: string }[] = installeds[i]
                        for (const inst of installed) {
                            if (inst.installedFrom === 'dev') continue
                            const latest = manifest.filter(m => m.id === inst.id).map(m => m.version).sort((a, b) => versionGreaterThan(a, b) ? -1 : 1)[0]
                            if (latest && versionGreaterThan(latest, inst.version)) updates.push(`${type} ${inst.id} ${inst.version}→${latest}`)
                        }
                    })
                    if (updates.length > 0) notify(undefined, ENotifyLevel.WARNING, `Updates available: ${updates.join(', ')}`)
                } catch {}
            })()
        }


        // load user tabs
        let lastTabs = localStorage.getItem('lastTabs')
        if (lastTabs)
            setLastTabs(JSON.parse(lastTabs))
        else
            setLastTabs(DEFAULTLASTTABS)
        let favTabs = localStorage.getItem('favTabs')
        if (favTabs) setFavTabs(JSON.parse(favTabs))

        // load user Workspaces
        let lastWorkspaces = localStorage.getItem('lastWorkspaces')
        if (lastWorkspaces)
            setLastWorkspaces(JSON.parse(lastWorkspaces))
        else
            setLastWorkspaces([])
        let favWorkspaces = localStorage.getItem('favWorkspaces')
        if (favWorkspaces) setFavWorkspaces(JSON.parse(favWorkspaces))
    },[logged, backendUrl])

    useEffect( () => {
        clustersRef.current = clusters
        const summary = clusters.map(c => ({ name: c.name, source: !!c.source }))
        tabs.current.forEach(tab => {
            if (tab.channel.requirements.clusterManagement) tab.channelObject.clusters = summary
        })
        let c = clusters.find(c => c.source)
        if (c) onChangeCluster(c.name)
    }, [clusters])

    useEffect( () => {
        if (!logged || !user?.startChannel || clusters.length === 0 || autoStartedRef.current) return
        autoStartedRef.current = true
        const srcCluster = clusters.find(c => c.source)
        if (!srcCluster || !frontChannels.has(user.startChannel)) {
            setAutoStartPending(false)
            return
        }
        populateTabObject(user, user.startChannel, user.startChannel, srcCluster, EInstanceConfigView.CLUSTER, '', '', '', '', true, true, { config: undefined, instanceConfig: undefined })
            .then(() => setAutoStartPending(false))
    }, [clusters, user])

    useEffect(() => {
        tabs.current.forEach(tab => {
            if (tab.channel.requirements.backChannels) tab.channelObject.backChannels = backChannels
        })
    }, [backChannels])

    const toggleColorMode = () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'))
    }

    const onNotifySnackbarClose = (event?: React.SyntheticEvent | Event, reason?: SnackbarCloseReason) => {
        if (reason === 'clickaway') return
        setNotifySnackbarOpen(false)
    }

    const notify = (channelId:string|undefined, level:ENotifyLevel, message:string) => {
        setNotifySnackbarMessage(message)
        setNotifySnackbarLevel(level)
        setNotifySnackbarOpen(true)
        notifications.current.push({ timestamp: new Date(), level, text: message, channelId })
        setRefresh(Math.random())
    }

    const fillTabSummary = async (tab:ITabSummary) => {
        let namespacesArray:string[] = []
        if (tab.channelObject.clusterName === '$cluster') {
            if (props.isDesktop)
                tab.channelObject.clusterName = 'inElectron'
            else
                tab.channelObject.clusterName = 'inCluster'
        }
        let allClusterPodsArray = (await (await fetch(`${backendUrl}/config/pod`, addGetAuthorization(accessString))).json())

        if (tab.channelObject.namespace==='*all' || tab.channelObject.group==='*all'|| tab.channelObject.pod==='*all'|| tab.channelObject.container==='*all') {
            namespacesArray = [...new Set<string>(allClusterPodsArray.map((p: any) => p.namespace))]
            tab.channelObject.namespace = namespacesArray.join(',')
        }
    
        let controllersArray = []
        if (tab.channelObject.group==='*all') {
            for (let namespace of namespacesArray) {
                let data = allClusterPodsArray.filter((p:any) => p.namespace===namespace).map((p:any) => {return { name:p.controllerName, type:p.controllerType}})
                data = data.map ( (g:any) => ({ ...g, namespace }))
                controllersArray.push(...data)
            }
            tab.channelObject.group = controllersArray.slice(0, 5).map(g => g.type+'+'+g.name).join(',')
        }
    
        let podsArray:any[] = []
        if (tab.channelObject.pod==='*all' || tab.channelObject.container==='*all') {
            for (let controller of controllersArray.filter(g => g.type!=='Deployment')) {
                let data = allClusterPodsArray.filter((p:any) => p.namespace===controller.namespace && p.controllerName===controller.name && p.controllerType===controller.type).map((c:any) => c.name)
                data = data.map ((name:string) => ({ name, namespace:controller.namespace}))
                podsArray.push (...data)
            }
            if (tab.channelObject.pod==='*all') {
                tab.channelObject.pod = podsArray.slice(0, 5).map(pod => pod.name).join(',')
            }
        }
    
        let containersArray:string[] = []
        if (tab.channelObject.container==='*all') {
            for (let pod of podsArray) {
                let data = allClusterPodsArray.filter((p:any) => p.namespace===pod.namespace && p.name===pod.name).map((p:any) => p.containers)
                data = data.map( (c:string) => pod.name+'+'+c)
                containersArray.push (...(data as string[]))
            }
            tab.channelObject.container = containersArray.slice(0, 5).join(',')
        }
    }

    const loadSourceCluster = async (url:string, myAccessString:string) : Promise<Cluster|undefined> => {
        let response = await fetch(`${url}/config/info`, addGetAuthorization(myAccessString))
        let srcCluster = new Cluster()
        srcCluster.kwirthData = await response.json() as KwirthData
        if (!srcCluster.kwirthData) {
            console.log('No KwirthData received from source cluster')
            return
        }
        let responseCluster = await fetch(`${url}/config/cluster`, addGetAuthorization(myAccessString))
        srcCluster.clusterInfo = await responseCluster.json() as IClusterInfo
        srcCluster.id = srcCluster.clusterInfo.id

        srcCluster.name = srcCluster.kwirthData.clusterName
        srcCluster.url = url
        srcCluster.accessString = myAccessString
        srcCluster.source = true
        srcCluster.enabled = true
        let srcMetricsRequired = Array.from(srcCluster.kwirthData.channels).reduce( (prev, current) => { return prev || current.metrics}, false)
        if (srcMetricsRequired) getMetricsNames(srcCluster)
        return srcCluster
    }

    const getClusters = async () => {
        // get current cluster
        try {
            let srcCluster = await loadSourceCluster(backendUrl, accessString)
            if (!srcCluster || !srcCluster.kwirthData) {
                setMsgBox(MsgBoxOkError('Kwirth start', 'Could not get source cluster info, so you will back to login page for starting again (... and trying to get more luck)', setMsgBox,  (b:MsgBoxButtons) => {
                    setLogged(false)
                }))
                return
            }
            if (versionGreaterThan(srcCluster.kwirthData.version, srcCluster.kwirthData.lastVersion)) {
                setInitialMessage(`You have Kwirth version ${srcCluster.kwirthData.version} installed. A new version is available (${srcCluster.kwirthData.version}), it is recommended to update your Kwirth deployment. If you're a Kwirth admin and you're using 'latest' tag, you can update Kwirth from the main menu.`)
            }

            // get previously configured clusters
            let clusterList:Cluster[]=[]
            if (!props.isDesktop) {
                let response = await fetch (`${backendUrl}/store/${user?.id}/clusters/list`, addGetAuthorization(accessString))
                if (response.status===200) {
                    clusterList = JSON.parse (await response.json())
                    clusterList = clusterList.filter (c => c.name !== srcCluster!.name)
                }
            }

            for (let cluster of clusterList) {
                readClusterInfo(cluster, notify).then( () => { setChannelMessageAction({action : EChannelRefreshAction.REFRESH}) })
            }
            clusterList.push(srcCluster)
            setClusters(clusterList)
            setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
        }
        catch (err) {
            notify(undefined, ENotifyLevel.ERROR, 'Cannot build clusters list: '+err)
        }
    }

    const readLoggedUserSettings = async () => {
        if (props.isDesktop) {
            let settingsStr = localStorage.getItem('settingsGeneral')
            if (settingsStr) {
                userSettingsRef.current = JSON.parse(settingsStr) as Settings
                return
            }
        }
        else {
            let resp = await fetch (`${backendUrl}/store/${user?.id}/settings/general`, addGetAuthorization(accessString))
            if (resp.status===200) {
                let json=await resp.json()
                if (json) {
                    userSettingsRef.current = JSON.parse(json) as Settings
                    return
                }
            }
        }
        userSettingsRef.current = { channelSettings: [], keepAliveInterval: 60, channelUserPreferences:[] }
    }

    const writeLoggedUserSettings = async (user:IUser) => {
        if (user) {
            if (props.isDesktop) {
                localStorage.setItem('settingsGeneral', JSON.stringify(userSettingsRef.current))
            }
            else {
                let payload = JSON.stringify(userSettingsRef.current)
                fetch (`${backendUrl}/store/${user.id}/settings/general`, addPostAuthorization(accessString, payload))
            }
        }
        else {
            console.log('No user specified on writing logged user settings')
        }
    }

    const setUsablechannels = (cluster:Cluster) => {
        if (cluster && cluster.kwirthData) {
            let usableChannels = [...cluster.kwirthData.channels]
            usableChannels = usableChannels.filter(c => {
                if (!Array.from(frontChannels.keys()).includes(c.id)) return false
                // 'single' channels announced as remote are shown too (Agora & co.). If no in-cluster Kwirth
                // hosts it, the ADD handler explains how to connect it; WS routing to the host is set in
                // populateTabObject (its first consumer is Agora).
                return true
            })
            setBackChannels(usableChannels)
        }
    }

    const onChangeCluster = (clusterName:string) => {
        if (!clusters) return
        let cluster = clusters.find(c => c.name === clusterName)
        if (cluster && cluster.kwirthData) {
            setUsablechannels(cluster)
            setSelectedClusterName(clusterName)
        }
    }

    const startSocket = (tab:ITabObject, cluster:Cluster, fn: () => void) => {
        // A REMOTE (single, delegated) channel had its in-cluster host resolved into channelObject.clusterUrl by
        // populateTabObject; the framework socket must open there, not to the local cluster. Non-remote channels
        // leave clusterUrl = cluster.url (or unset) → same as before.
        tab.ws = new WebSocket(tab.channelObject?.clusterUrl ?? cluster.url)
        tab.ws.onopen = fn
    }

    const onResourceSelectorAdd = async (selection:IResourceSelected, start:boolean, settings:any) : Promise<void> => {
        let cluster = clusters.find(c => c.name===selection.clusterName)
        if (!cluster || !user) {
            setMsgBox(MsgBoxOkError('Kwirth',`Cluster established at tab configuration ${selection.clusterName} does not exist.`, setMsgBox))
            return
        }

        // A 'single' channel announced REMOTE here is hosted by the in-cluster Kwirth of this cluster. If
        // that Kwirth is not connected, we cannot delegate — tell the user the situation and how to fix it.
        const channelData = cluster.kwirthData?.channels?.find(ch => ch.id === selection.channelId)
        if (channelData?.mode === EChannelMode.REMOTE && !resolveRemoteChannelHost(selection.channelId, cluster.clusterInfo?.id ?? '', clusters)) {
            setMsgBox(MsgBoxOkError('Channel runs in-cluster',
                `'${selection.channelId}' runs on the in-cluster Kwirth of cluster '${cluster.name}', which is not connected here. Connect that Kwirth (Manage clusters) to use this channel from this app.`,
                setMsgBox))
            return
        }

        if (frontChannels.has(selection.channelId)) {
           await populateTabObject(user, selection.name, selection.channelId, cluster, selection.view as EInstanceConfigView, selection.namespaces.join(','), selection.controllers.join(','), selection.pods.join(','), selection.containers.join(','), start, false, settings)
        }
        else {
            console.log(`Error, invalid channel: `, selection.channelId)
            setMsgBox(MsgBoxOkError('Add resource', `Channel '${selection.channelId}' is not supported`, setMsgBox))
        }
    }

    const readChannelUserPreferences = async (channelId:string) : Promise<any> => {
        let chanPref = userSettingsRef.current.channelUserPreferences?.find(c => c.channelId===channelId)
        if (chanPref) {
            return chanPref.data
        }
        else {
            console.log('Channel preferences are undefined')
            return undefined
        }
    }

    const writeChannelUserPreferences = async (user:IUser, channelId:string, data:any) : Promise<boolean> => {
        if (!userSettingsRef.current?.channelUserPreferences) userSettingsRef.current.channelUserPreferences = []

        let channelPreferences = userSettingsRef.current?.channelUserPreferences?.find(c => c.channelId===channelId)
        if (channelPreferences) {
            channelPreferences.data = data
        }
        else {
            userSettingsRef.current.channelUserPreferences.push ({ channelId, data })
        }
        await writeLoggedUserSettings(user)
        return true
    }

    const populateTabObject = async (user:IUser, name:string, channelId:string, cluster:Cluster, view:EInstanceConfigView, namespaces:string, controllers:string, pods:string, containers:string, start:boolean, fullscreen: boolean, settings:any, tab?:ITabObject) : Promise<ITabObject> => {
        let newChannel = createChannelInstance(frontChannels.get(channelId))
        if (!newChannel) {
            throw 'Invalid channel instance'
        }
        let newTab:ITabObject = {
            name: name,
            ws: undefined,
            keepAliveRef: undefined,
            reconnectRef: undefined,
            defaultTab: false,
            channel: newChannel,
            channelObject: {
                clusterName: cluster.name,
                instanceId: '',
                view: view as EInstanceConfigView,
                namespace: namespaces,
                group: controllers,
                pod: pods,
                container: containers,
                config: undefined,
                isDesktop: props.isDesktop,
                userName: user?.id,
                data: undefined,
                instanceConfig: undefined,
                channelId: newChannel.channelId
            },
            channelStarted: false,
            channelPaused: false,
            channelPending: false,
            headerEl: undefined
        }

        // For a 'single' channel announced REMOTE here, delegate to the in-cluster Kwirth that hosts it:
        // the WS (clusterUrl) + credential (accessString) point to that host, not the local (e.g. desktop) back.
        // Non-remote channels keep the selected cluster (host is undefined → falls back). clusterInfo/clusterName
        // stay the target cluster (same id).
        const channelMode = cluster.kwirthData?.channels?.find(ch => ch.id === channelId)?.mode
        const host = channelMode === EChannelMode.REMOTE ? resolveRemoteChannelHost(channelId, cluster.clusterInfo?.id ?? '', clusters) : undefined
        if (newTab.channel.requirements.clusterUrl) newTab.channelObject.clusterUrl = host?.url ?? cluster.url
        if (newTab.channel.requirements.clusterInfo) newTab.channelObject.clusterInfo = cluster.clusterInfo
        if (newTab.channel.requirements.accessString) newTab.channelObject.accessString = host?.accessString ?? cluster?.accessString
        if (newTab.channel.requirements.metrics) newTab.channelObject.metricsList = cluster.metricsList
        if (newTab.channel.requirements.frontChannels) newTab.channelObject.frontChannels = frontChannels
        if (newTab.channel.requirements.backChannels) newTab.channelObject.backChannels = backChannels
        if (newTab.channel.requirements.notifier) newTab.channelObject.notify = notify
        if (newTab.channel.requirements.notifications) newTab.channelObject.notifications = notifications.current
        if (newTab.channel.requirements.palette) newTab.channelObject.setPalette = (palette:string) => setMode(palette as 'light'|'dark')
        if (newTab.channel.requirements.openManager) newTab.channelObject.openManager = (type) => {
            switch (type) {
                case EExtensionType.PLUGIN:   setShowPluginDialog(true); break
                case EExtensionType.PROVIDER: setShowProviderDialog(true); break
                case EExtensionType.SENDER:   setShowSenderDialog(true); break
                case EExtensionType.THEME:    setShowThemeDialog(true); break
                case EExtensionType.HOMEPAGE: setShowHomepageDialog(true); break
                case EExtensionType.DOCS:     setShowDocsDialog(true); break
            }
        }
        if (newTab.channel.requirements.clusterManagement) {
            newTab.channelObject.clusters = clustersRef.current.map(c => ({ name: c.name, source: !!c.source }))
            newTab.channelObject.selectedClusterName = selectedClusterName
            newTab.channelObject.openClusterManager = () => setShowManageClusters(true)
            newTab.channelObject.selectCluster = (clusterName: string) => {
                const target = clustersRef.current.find(c => c.name === clusterName)
                if (!target || !user) return
                const tabName = newTab.name
                const channelId = newTab.channel.channelId
                const view = newTab.channelObject.view
                const namespace = newTab.channelObject.namespace
                const group = newTab.channelObject.group
                const pod = newTab.channelObject.pod
                const container = newTab.channelObject.container
                const wasStarted = newTab.channelStarted
                const cfg = { config: newTab.channelObject.config, instanceConfig: newTab.channelObject.instanceConfig }
                removeTab(newTab)
                tabs.current = tabs.current.filter(t => t !== newTab)
                populateTabObject(user, tabName, channelId, target, view, namespace, group, pod, container, wasStarted, fullscreen, cfg)
            }
        }
        if (newTab.channel.requirements.exit) newTab.channelObject.exit = () => {
            setBackendUrl(props.backendUrl)
            setLogged(false)
        }
        newTab.channelObject.stopChannel = () => stopTabChannel(newTab)
        newTab.channelObject.isExtensionLicensed = (type: string, id: string) => licenseInfo ? (licenseInfo.extensions[type]?.includes(id) ?? false) : true
        if (newTab.channel.requirements.userSettings) {
            // console.log(user)
            // this is reallyreallyreally tricky. 
            // we recieve user as parm in this function (we ignore the 'user' in the useState), since readchanneluserprefs y writechanneluserprefs do use a variable named
            // 'user', so this 'user' value will be added to the newly create closure when invoking writechanneluserprefs original function
            newTab.channelObject.readChannelUserPreferences = readChannelUserPreferences
            newTab.channelObject.writeChannelUserPreferences = (channelId:string, data:any) => {
                return writeChannelUserPreferences(user, channelId, data)
            }
        }
        newTab.channelObject.config = userSettingsRef.current?.channelSettings?.find(c => c.channelId === newTab.channel.channelId)
        if ((await newTab.channel.initChannel(newTab.channelObject))) setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
        if (tab) newTab.channelObject.instanceConfig = tab.channelObject.instanceConfig
        if (newTab.channel.requirements.settings) {
            // this 'requiresSettings' must be executed after managing config and instanceConfig
            if (userSettingsRef.current) {
                let thisChannnel = userSettingsRef.current.channelSettings.find(c => c.channelId === newTab.channel.channelId)
                if (thisChannnel) {
                    newTab.channelObject.channelSettings = {
                        channelId: newTab.channel.channelId,
                        channelConfig: thisChannnel.channelConfig,
                        channelInstanceConfig: thisChannnel.channelInstanceConfig
                    }
                }
                else {
                    newTab.channelObject.channelSettings = {
                        channelId: newTab.channel.channelId,
                        channelConfig: undefined,
                        channelInstanceConfig: undefined
                    }
                }
            }
            newTab.channelObject.updateChannelSettings = (channelSettings:IChannelSettings) => {
                if (userSettingsRef.current) {
                    let thisChannnel = userSettingsRef.current.channelSettings.find(c => c.channelId === newTab.channel.channelId)
                    if (!thisChannnel) {
                        thisChannnel = {
                            channelId: newTab.channel.channelId,
                            channelConfig: channelSettings.channelConfig,
                            channelInstanceConfig: undefined
                        }
                        userSettingsRef.current.channelSettings.push(thisChannnel)
                    }
                    else {
                        thisChannnel.channelConfig = channelSettings.channelConfig
                    }
                    writeLoggedUserSettings(user)
                }
            }
        }
        
        newTab.channelObject.createTab = (resource:IResourceSelected, start:boolean, settings:any) => {
            onResourceSelectorAdd(resource, start, settings)
        }

        startSocket(newTab, cluster, () => {
            console.log(`WebSocket connected: ${newTab.ws?.url}`, new Date().toISOString())
            setKeepAlive(newTab)
            if (newTab.channel.requirements.webSocket) newTab.channelObject.webSocket = newTab.ws
            if (newTab && (newTab.channelStarted || start)) {
                if (settings) {
                    newTab.channelObject.config = settings.config
                    newTab.channelObject.instanceConfig = settings.instanceConfig
                }
                startTabChannel(newTab, cluster)
                setChannelMessageAction({action : EChannelRefreshAction.REFRESH})  // we force rendering
            }
        })
        selectedTab.current = newTab
        tabs.current.push(newTab)
        if (fullscreen) setFullscreenTab(newTab)
        setChannelMessageAction({action : EChannelRefreshAction.REFRESH})  // force re-render for showing new tab
        return newTab
    }

    const showChannelSetup = () => {
        if (!selectedTab.current || !selectedTab.current.channel || !selectedTab.current.channel.getSetupVisibility()) return
        const SetupDialog = selectedTab.current.channel.SetupDialog
        let props:ISetupProps = {
            channel: selectedTab.current.channel,
            onChannelSetupClosed,
            channelObject: selectedTab.current.channelObject,
            setupConfig: {
                channelId: selectedTab.current.channel.channelId,
                channelConfig: selectedTab.current.channelObject.config,
                channelInstanceConfig: selectedTab.current.channelObject.instanceConfig
            }
        }
        if (userSettingsRef.current?.channelSettings && userSettingsRef.current.channelSettings.some(c => c.channelId === selectedTab.current?.channel.channelId)) {
            props.setupConfig = userSettingsRef.current.channelSettings.find(c => c.channelId === selectedTab.current?.channel.channelId)
        }
        return <SetupDialog {...props} />
    }

    const onChannelSetupClosed = (channel:IChannel, channelSettings:IChannelSettings, start:boolean, setDefaultValues:boolean) => {
        channel.setSetupVisibility(false)
        if (!selectedTab.current || !userSettingsRef.current) return
        if (!start) {
            setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
            return
        }

        if (setDefaultValues) {
            userSettingsRef.current.channelSettings = userSettingsRef.current.channelSettings.filter(c => c.channelId !== channel.channelId)
            userSettingsRef.current.channelSettings.push ({
                channelId: selectedTab.current.channel.channelId,
                channelInstanceConfig: channelSettings.channelInstanceConfig,
                channelConfig: channelSettings.channelConfig
            })
            if (user) writeLoggedUserSettings(user)
        }

        selectedTab.current.channelObject.config = channelSettings.channelConfig
        selectedTab.current.channelObject.instanceConfig = channelSettings.channelInstanceConfig
        setChannelMessageAction({action : EChannelRefreshAction.REFRESH})  // we force rendering

        let cluster = clusters.find(c => c.name === selectedTab.current!.channelObject.clusterName)
        if (!cluster) {
            setMsgBox(MsgBoxOk('Kwirth',`Cluster (${selectedTab.current!.channelObject.clusterName}) could not be found.`, setMsgBox))
            return
        }
        startTabChannel(selectedTab.current, cluster)
    }

    const setKeepAlive = (tab:ITabObject) => {
        tab.keepAliveRef = setInterval((t:ITabObject) => {
            if (t.channelObject.instanceId) {
                // we only send keealive (ping) if we have a valid instance id
                let instanceConfig:IInstanceMessage = {
                    action: EInstanceMessageAction.PING,
                    channel: t.channel.channelId,
                    flow: EInstanceMessageFlow.REQUEST,
                    type: EInstanceMessageType.SIGNAL,
                    instance: t.channelObject.instanceId
                }
                if (t.ws && t.ws.readyState === WebSocket.OPEN) t.ws.send(JSON.stringify(instanceConfig))
            }
        }, (userSettingsRef.current?.keepAliveInterval || 60) * 1000, tab)
    }

    const getTabColor = (tab:ITabObject) => {
        let colorTable:IColors = TABUNSELECTEDCOLORS
        if (selectedTab.current === tab) colorTable = TABSELECTEDCOLORS
        if (tab.channelStarted) { 
            if (tab.channelPaused) {
                return colorTable.pause
            }
            else {
                if (tab.channelPending) {
                    return colorTable.pending
                }
                else {
                    if (tab.ws?.readyState) {
                        if (tab.ws?.readyState === 1)
                            return colorTable.start
                        else
                            return colorTable.interrupt
                    }
                    else {
                        return colorTable.start
                    }
                    // if (selectedTab.current?.ws?.readyState) {
                    //     if (selectedTab.current?.ws?.readyState === 1)
                    //         return colorTable.start
                    //     else
                    //         return colorTable.interrupt
                    // }
                    // else {
                    //     return colorTable.start
                    // }
                }
            }
        }
        else {
            return colorTable.stop
        }
    }

    const onChangeTab = (_event:unknown, tabNumber:number)=> {
        if (tabNumber>=0) {
            let newTab = tabs.current[tabNumber]
            if (newTab.channelObject) {
                newTab.channelPending = false
                setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
                let cluster = clusters.find(c => c.name === newTab.channelObject.clusterName)
                if (cluster) setUsablechannels(cluster)
            }
            selectedTab.current = newTab
        }
        else {
            selectedTab.current = undefined
            setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
        }
    }

    const wsOnMessage = (wsEvent:MessageEvent) => {
        let instanceMessage:IInstanceMessage
        try {
            instanceMessage = JSON.parse(wsEvent.data) as IInstanceMessage
        }
        catch (err:any) {
            console.log(err.stack)
            console.log(wsEvent.data)
            return
        }
        if (instanceMessage.action === EInstanceMessageAction.PING || instanceMessage.channel === InstanceMessageChannelEnum.NONE) return

        if (instanceMessage.type === EInstanceMessageType.SIGNAL && instanceMessage.action === EInstanceMessageAction.RECONNECT && instanceMessage.flow === EInstanceMessageFlow.RESPONSE) {
            let msg:ISignalMessage = JSON.parse(wsEvent.data) as ISignalMessage
            if (msg.data!==undefined) {
                if (msg.data===false) {
                    notify(undefined, ENotifyLevel.ERROR, msg.text||'Error reconnecting')
                    let tab = tabs.current.find(tab => tab.ws !== null && tab.ws === wsEvent.target)
                    if (tab) stopTabChannel(tab)
                }
            }
        }

        if (frontChannels.has(instanceMessage.channel)) {
            let tab = tabs.current.find(tab => tab.ws !== null && tab.ws === wsEvent.target)
            if (!tab || !tab.channel || !tab.channelObject) return
            let refresh = tab.channel.processChannelMessage(tab.channelObject, wsEvent)
            if (refresh.action === EChannelRefreshAction.REFRESH) {
                if (selectedTab?.current?.name === tab.name) {
                    setChannelMessageAction({action: EChannelRefreshAction.REFRESH})
                }
                else {
                    if (!tab.channelPending) tab.channelPending = true
                }
            }
            else if (refresh.action === EChannelRefreshAction.STOP) {
                stopTabChannel(tab)
            }
        }
        else {
            console.log('Received invalid channel in message: ', instanceMessage)
            notify(undefined, ENotifyLevel.ERROR, `'Received invalid channel in message: ${instanceMessage.channel}`)
        }
    }

    const onClickChannelStart = () => {
        if (selectedTab.current && selectedTab.current.channel) {
            if (selectedTab.current.channel.requirements.setup) {
                selectedTab.current.channel.setSetupVisibility(true)
            }
            else {
                let cluster = clusters.find(c => c.name === selectedTab.current!.channelObject.clusterName)
                if (!cluster) {
                    setMsgBox(MsgBoxOk('Kwirth',`Cluster (${selectedTab.current!.channelObject.clusterName}) could not be found.`, setMsgBox))
                    return
                }
                startTabChannel(selectedTab.current, cluster)
            }
        }
        else {
            console.log(`Unsupported channel ${selectedTab.current?.channel.channelId}`)
        }
    }

    const socketReconnect = (wsEvent:any, id:NodeJS.Timer) => {
        clearInterval(id)
        console.log('Reconnected, will reconfigure socket')
        let tab = tabs.current.find(tab => tab.ws === wsEvent.target)
        if (!tab || !tab.channelObject) return
        tab.reconnectRef = undefined   // the retry interval succeeded and was cleared above

        let instanceConfig:IInstanceConfig = {
            channel: tab.channel.channelId,
            objects: EInstanceConfigObject.PODS,
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.RECONNECT,
            instance: tab.channelObject.instanceId,
            scope: InstanceConfigScopeEnum.NONE,
            accessKey: '',
            view: EInstanceConfigView.NONE,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            type: EInstanceMessageType.SIGNAL
        }
        if (wsEvent.target) {
            tab.ws = wsEvent.target
            // Refresh the socket handle: it was only set on the first connect (see startSocket, l.945), so
            // channels that send through channelObject.webSocket would otherwise hold the dead socket.
            if (tab.channel.requirements.webSocket) tab.channelObject.webSocket = tab.ws
            tab.ws!.onerror = (event) => socketDisconnect(event)
            tab.ws!.onmessage = (event) => wsOnMessage(event)
            tab.ws!.onclose = (event) => socketDisconnect(event)
            tab.ws!.send(JSON.stringify(instanceConfig))
            // Let the channel resync after reconnecting (re-open room, re-subscribe…), mirroring socketDisconnected.
            if (tab.channel.socketReconnect(tab.channelObject)) setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
        }
        else {
            console.log('Target not set on reconnect')
        }
    }

    const socketDisconnect = (wsEvent:any) => {
        console.log('WebSocket disconnected', new Date().toISOString())
        let tab = tabs.current.find(tab => tab.ws === wsEvent.target)
        if (!tab || !tab.channelObject) return

        notify(undefined, ENotifyLevel.ERROR, `Websocket for channel '${tab.channel.channelId}' has been interrupted`)
        const reconnectable = backChannels.find(c => c.id === tab!.channel.channelId && c.reconnectable)
        if (reconnectable) {
            console.log(`Trying to reconnect...`)
            if (tab.ws) {
                tab.ws.onerror = null
                tab.ws.onmessage = null
                tab.ws.onclose = null
                tab.ws = undefined
            }
            let cluster = clusters.find(c => c.name === tab!.channelObject!.clusterName)
            if (!cluster) return

            if (selectedTab.current && selectedTab.current.channel) {
                if (selectedTab.current.channel.socketDisconnected(selectedTab.current.channelObject)) setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
            }
            else {
                console.log('Unsuppported channel on disconnect:', tab.channel.channelId)
            }
            setChannelMessageAction({action : EChannelRefreshAction.REFRESH})

            if (tab.reconnectRef) clearInterval(tab.reconnectRef)   // never stack retry loops
            let selfId = setInterval( (url, tab) => {
                console.log(`Trying to reconnect using ${url} and ${tab.channelObject.instanceId}`)
                try {
                    let ws = new WebSocket(url)
                    tab.ws = ws
                    ws.onopen = (event) => socketReconnect(event, selfId)
                }
                catch  {}
            }, 10000, tab.channelObject.clusterUrl ?? cluster.url, tab)   // reconnect to the delegated host too
            tab.reconnectRef = selfId   // track it so removeTab can stop retrying when the tab closes
        }
        else {
            console.log(`Channel ${tab.channel.channelId} does not support reconnect.`)
        }
    }
    
    const startTabChannel = (tab:ITabObject, cluster:Cluster) => {
        // +++ i think cluster can be obtained from tab object: tab.channelObject
        if (!tab || !tab.channelObject) {
            console.log('No active tab found')
            return
        }

        if (tab.ws && tab.ws.readyState === WebSocket.OPEN) {
            tab.ws.onerror = (event) => socketDisconnect(event)
            tab.ws.onmessage = (event) => wsOnMessage(event)
            tab.ws.onclose = (event) => socketDisconnect(event)

            let instanceConfig: IInstanceConfig = {
                channel: tab.channel.channelId,
                objects: EInstanceConfigObject.PODS,
                action: EInstanceMessageAction.START,
                flow: EInstanceMessageFlow.REQUEST,
                instance: '',
                // Use the delegated host credential for REMOTE channels (populateTabObject stamped it into
                // channelObject.accessString); non-remote keeps the local cluster key. Must match clusterUrl.
                accessKey: tab.channelObject.accessString ?? cluster.accessString,
                scope: InstanceConfigScopeEnum.NONE,
                view: tab.channelObject.view,
                namespace: tab.channelObject.namespace,
                group: tab.channelObject.group,
                pod: tab.channelObject.pod,
                container: tab.channelObject.container,
                type: EInstanceMessageType.SIGNAL
            }

            if (tab.channel) {
                instanceConfig.scope = tab.channel.getScope()
                instanceConfig.data = tab.channelObject.instanceConfig
                tab.ws.send(JSON.stringify(instanceConfig))
                tab.channelStarted = true
                tab.channelPaused = false
                
                tab.channel.startChannel(tab.channelObject)

                if (!lastTabs.some(t => t.name === tab.name && t.channel === tab.channel.channelId)) {
                    let newTab:ITabSummary = {
                        name: tab.name,
                        description: tab.name,
                        channel: tab.channel.channelId,
                        channelObject: {
                            clusterName: tab.channelObject.clusterName,
                            view: tab.channelObject.view,
                            namespace: tab.channelObject.namespace,
                            group: tab.channelObject.group,
                            pod: tab.channelObject.pod,
                            container: tab.channelObject.container
                        }
                    }
                    let newLastTabs = lastTabs
                    if (newLastTabs.length>5) newLastTabs= newLastTabs.slice(0,4)
                    setLastTabs([newTab, ...newLastTabs])
                    localStorage.setItem('lastTabs', JSON.stringify([newTab, ...newLastTabs]))
                }
            }
            else {
                console.log('Channel is not supported')
            }            
        }
        else {
            console.log('Tab web socket is not started')
        }
    }

    const onClickChannelStop = () => {
        setAnchorMenuTab(null)
        if (selectedTab.current && selectedTab.current.channelObject) stopTabChannel(selectedTab.current)
    }

    const stopTabChannel = (tab:ITabObject) => {
        if (!tab || !tab.channelObject) return
        let cluster = clusters.find(c => c.name === tab.channelObject.clusterName)

        if (!cluster) return
        let instanceConfig: IInstanceConfig = {
            channel: tab.channel.channelId,
            objects: EInstanceConfigObject.PODS,
            action: EInstanceMessageAction.STOP,
            flow: EInstanceMessageFlow.REQUEST,
            instance: tab.channelObject.instanceId,
            accessKey: tab.channelObject.accessString ?? cluster.accessString,   // delegated host credential for REMOTE
            view: tab.channelObject.view,
            scope: InstanceConfigScopeEnum.NONE,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            type: EInstanceMessageType.SIGNAL
        }
        if (selectedTab.current && selectedTab.current.channel) {
            if (selectedTab.current.channel.stopChannel(selectedTab.current.channelObject)) setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
            if (tab.ws && tab.ws.readyState === tab.ws.OPEN) tab.ws.send(JSON.stringify(instanceConfig))
            tab.channelStarted = false
            tab.channelPaused = false
        }
        else {
            console.log('Channel is not supported on stop:',tab.channel.channelId)
        }
    }

    const onClickChannelPause = () => {
        setAnchorMenuTab(null)
        if (!selectedTab.current || !selectedTab.current.channelObject || !selectedTab.current.ws) return
        let cluster = clusters.find(c => c.name === selectedTab.current!.channelObject.clusterName)
        if(!cluster) return
        
        let instanceConfig:IInstanceConfig = {
            channel: selectedTab.current.channel.channelId,
            objects: EInstanceConfigObject.PODS,
            action: EInstanceMessageAction.PAUSE,
            flow: EInstanceMessageFlow.REQUEST,
            instance: selectedTab.current.channelObject?.instanceId,
            accessKey: cluster.accessString,
            scope: InstanceConfigScopeEnum.NONE,
            view: selectedTab.current.channelObject.view,
            namespace: selectedTab.current.channelObject.namespace,
            group: selectedTab.current.channelObject.group,
            pod: selectedTab.current.channelObject.pod,
            container: selectedTab.current.channelObject.container,
            type: EInstanceMessageType.SIGNAL
        }

        if (selectedTab.current.channelPaused) {
            selectedTab.current.channelPaused = false
            instanceConfig.action = EInstanceMessageAction.CONTINUE
            if (selectedTab.current.channel.continueChannel(selectedTab.current.channelObject)) setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
        }
        else {
            selectedTab.current.channelPaused = true
            instanceConfig.action = EInstanceMessageAction.PAUSE
            if (selectedTab.current.channel.pauseChannel(selectedTab.current.channelObject)) setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
        }
        selectedTab.current.ws.send(JSON.stringify(instanceConfig))
    }

    const removeTab = (tab:ITabObject) => {
        if (tab.ws) {
            tab.ws.onopen = null
            tab.ws.onerror = null
            tab.ws.onmessage = null
            tab.ws.onclose = null
        }
        clearInterval(tab.keepAliveRef)
        if (tab.reconnectRef) clearInterval(tab.reconnectRef)   // stop any in-flight reconnect retry loop
        if (tab.channelObject) stopTabChannel(tab)
    }

    const onClickTabRemove = () => {
        setAnchorMenuTab(null)
        if (!selectedTab.current) return

        removeTab(selectedTab.current)

        let current = tabs.current.findIndex(t => t === selectedTab.current)
        let newTabs = tabs.current.filter(t => t !== selectedTab.current)

        if (current >= newTabs.length) current--
        if (current >= 0 && current<newTabs.length) newTabs[current].channelPending = false
        if (current>=0) selectedTab.current = newTabs[current]
        tabs.current = newTabs
        selectedTab.current = undefined
    }

    const menuTabOptionSelected = (option: MenuTabOption) => {
        setAnchorMenuTab(null)
        if (!selectedTab?.current) return
        let selectedTabIndex = tabs.current.indexOf(selectedTab.current)
        switch(option) {
            case MenuTabOption.TabInfo:
                if (selectedTab.current) {
                    let a=`
                        <b>Tab type</b>: ${selectedTab.current.channel.channelId}</br>
                        <b>Cluster</b>: ${selectedTab.current.channelObject.clusterName}</br>
                        <b>View</b>: ${selectedTab.current.channelObject.view}<br/>
                        <b>Namespace</b>: ${selectedTab.current.channelObject.namespace}<br/>
                        <b>Group</b>: ${selectedTab.current.channelObject.group}<br/>
                        <b>Pod</b>: ${selectedTab.current.channelObject.pod}<br/>
                        <b>Container</b>: ${selectedTab.current.channelObject.container}
                    `
                    setMsgBox(MsgBoxOk('Tab info',a,setMsgBox))
                }
                break
            case MenuTabOption.TabRename:
                setShowRenameLog(true)
                break
            case MenuTabOption.TabMoveLeft:
                if (selectedTab.current) {
                    tabs.current[selectedTabIndex] = tabs.current[selectedTabIndex-1]
                    tabs.current[selectedTabIndex-1] = selectedTab.current
                    selectedTab.current = tabs.current[selectedTabIndex]
                }
                break
            case MenuTabOption.TabMoveRight:
                if (selectedTab.current) {
                    tabs.current[selectedTabIndex] = tabs.current[selectedTabIndex+1]
                    tabs.current[selectedTabIndex+1] = selectedTab.current
                    onChangeTab(null, selectedTabIndex+1)
                }
                break
            case MenuTabOption.TabMoveFirst:
                if (selectedTab.current) {
                    tabs.current.splice(selectedTabIndex, 1)
                    tabs.current.splice(0, 0, selectedTab.current)
                }
                break
            case MenuTabOption.TabMoveLast:
                if (selectedTab.current) {
                    tabs.current.splice(selectedTabIndex, 1)
                    tabs.current.push(selectedTab.current)
                }
                break
            case MenuTabOption.TabRemove:
                onClickTabRemove()
                break
            case MenuTabOption.TabSetDefault:
                if (selectedTab.current && selectedTab.current.channelObject) selectedTab.current.defaultTab=true
                break
            case MenuTabOption.TabRestoreParameters:
                if (selectedTab.current) {
                    setResourceSelected( {
                        view:selectedTab.current.channelObject.view,
                        name: selectedTab.current.name,
                        controllers: selectedTab.current.channelObject.group.split(','),
                        clusterName: selectedTab.current.channelObject.clusterName,
                        containers: selectedTab.current.channelObject.container.split(','),
                        pods:selectedTab.current.channelObject.pod.split(','),
                        namespaces:selectedTab.current.channelObject.namespace.split(','),
                        channelId: selectedTab.current.channel.channelId
                    })
                }
                break
            case MenuTabOption.FullScreen:
                setFullscreenTab(selectedTab.current)
                break
            case MenuTabOption.ChannelStart:
                onClickChannelStart()
                break
            case MenuTabOption.ChannelPause:
                onClickChannelPause()
                break
            case MenuTabOption.ChannelStop:
                onClickChannelStop()
                break
        }
    }

    const saveWorkspace = async (name:string, description:string) => {
        let newTabs:ITabObject[] = []
        for (let tab of tabs.current) {
            let newTab:ITabObject = {
                name: tab.name,
                defaultTab: tab.defaultTab,
                ws: undefined,
                keepAliveRef: undefined,
                reconnectRef: undefined,
                channel: tab.channel,
                channelObject: JSON.parse(JSON.stringify(tab.channelObject)),
                channelStarted: tab.channelStarted,
                channelPaused: false,
                channelPending: false,
                headerEl: undefined
            }
            delete newTab.channelObject.data  // we only need uiConfig and instanceConfig
            newTabs.push(newTab)
        }
        let workspace:IWorkspace = {
            name,
            description,
            tabs: newTabs
        }
        let payload=JSON.stringify( workspace )
        await fetch (`${backendUrl}/store/${user?.id}/workspaces/${name}`, addPostAuthorization(accessString, payload))

        if (currentWorkspaceName !== name) {
            setCurrentWorkspaceName(name)
            setCurrentWorkspaceDescription(description)
            
            let newLastWorkspaces=[{name: workspace.name, description:workspace.description}, ...lastWorkspaces]
            setLastWorkspaces(newLastWorkspaces)
            localStorage.setItem('lastWorkspaces', JSON.stringify(newLastWorkspaces))
        }
    }

    const onSaveWorkspaceClosed = (name?:string, description?:string) => {
        setShowSaveWorkspace(false)
        if (name) saveWorkspace(name, description||'No description')
    }

    const onSelectWorkspaceClosed = async (action:string, name?:string) => {
        setShowSelectWorkspace(false)
        if (!name) return
        if (action === 'delete') {
            setMsgBox(MsgBoxYesNo('Delete workspace',`Are you sure you want to delete workspace ${name} (you cannot undo this action)?`, setMsgBox, (button) => {
                if (button===MsgBoxButtons.Yes) {
                    fetch (`${backendUrl}/store/${user?.id}/workspaces/${name}`, addDeleteAuthorization(accessString))
                    if (name === currentWorkspaceName) {
                        setCurrentWorkspaceName('untitled')
                        setCurrentWorkspaceDescription('No description yet')                            
                    }
                    let newLastWorkspaces=[...lastWorkspaces.filter(b => b.name!==name)]
                    setLastWorkspaces(newLastWorkspaces)
                    localStorage.setItem('lastWorkspaces', JSON.stringify(newLastWorkspaces))
                }
            }))
        }
        else if (action === 'load') {
            loadWorkspace(name)
        }
    }

    const loadWorkspace = async (name: string, autoStart: boolean = true) => {
        let errors = ''
        clearTabs()

        let workspaceDef = await (await fetch (`${backendUrl}/store/${user?.id}/workspaces/${name}`, addGetAuthorization(accessString))).json()
        let newWorkspace:IWorkspace = JSON.parse(workspaceDef)
        if (newWorkspace?.tabs && newWorkspace.tabs.length>0) {
            for (let t of newWorkspace.tabs) {
                let clusterName = t.channelObject.clusterName
                if (!clusters.find(c => c.name === clusterName)) {
                    errors += `Cluster '${clusterName}' used in tab '${t.name}' does not exist — tab will be skipped<br/><br/>`
                }
                if (!frontChannels.has(t.channel.channelId)) {
                    errors += `Channel '${t.channel.channelId}' used in tab '${t.name}' is not available (plugin not installed?) — tab will be skipped<br/><br/>`
                }
            }
            if (errors!=='') setMsgBox(MsgBoxOkError('Kwirth',`Some errors have been detected when loading workspace:<br/><br/>${errors}`, setMsgBox))
            setCurrentWorkspaceName(name)
            setCurrentWorkspaceDescription(newWorkspace.description)
            for (let t of newWorkspace.tabs) {
                if (!clusters.find(c => c.name === t.channelObject.clusterName)) continue
                if (!frontChannels.has(t.channel.channelId)) continue
                let res:IResourceSelected = {
                    channelId: t.channel.channelId,
                    clusterName: t.channelObject.clusterName,
                    view: t.channelObject.view,
                    namespaces: t.channelObject.namespace.split(','),
                    controllers: t.channelObject.group.split(','),
                    pods: t.channelObject.pod.split(','),
                    containers: t.channelObject.container.split(','),
                    name: t.name
                }
                onResourceSelectorAdd(res, autoStart, undefined)
            }

            if (!lastWorkspaces.some(workspace => workspace.name === newWorkspace.name)) {
                let newLastWorkspaces = lastWorkspaces
                if (newLastWorkspaces.length>5) newLastWorkspaces= newLastWorkspaces.slice(0,4)
                setLastWorkspaces([newWorkspace, ...newLastWorkspaces])
                localStorage.setItem('lastWorkspaces', JSON.stringify([newWorkspace, ...newLastWorkspaces]))
            }
        }
    }

    const showNoWorkspaces = () => {
        setMsgBox(MsgBoxOk('Workspace management','You have no workspaces stored in your personal Kwirth space', setMsgBox))
    }

    const getWorkspaces = async () => {
        let allWorkspaces:IWorkspace[] = await (await fetch (`${backendUrl}/store/${user?.id}/workspaces?full=true`, addGetAuthorization(accessString))).json()
        if (allWorkspaces.length===0) {
            showNoWorkspaces()
            return undefined
        }
        else {
            let values = allWorkspaces.map( b => {
                let name=Object.keys(b)[0]
                let workspace = JSON.parse((b as any)[name]) as IWorkspace
                return { name: workspace.name,  description: workspace.description }
            })
            return values
        }
    }

    const clearTabs = () => {
        // for (let tab of tabs.current) {
        //     if (tab.channelObject) stopTabChannel(tab)
        // }
        // tabs.current = []
        for(let t of tabs.current) {
            removeTab(t)
        }
        tabs.current = []
        setRefresh(Math.random())
    }

    const menuDrawerOptionSelected = async (option:MenuDrawerOption) => {
        setMenuDrawerOpen(false)
        switch(option) {
            case MenuDrawerOption.NewWorkspace: {
                const doNew = () => {
                    clearTabs()
                    setCurrentWorkspaceName('untitled')
                    setCurrentWorkspaceDescription('No description yet')
                    selectedTab.current = undefined
                }
                const hasStarted = tabs.current.some(t => t.channelStarted)
                if (hasStarted)
                    setMsgBox(MsgBoxYesNo('New workspace', 'Some tabs are still running. Creating a new workspace will stop and remove all current tabs. Continue?', setMsgBox, (b: MsgBoxButtons) => b === MsgBoxButtons.Yes ? doNew() : {}))
                else
                    doNew()
                break
            }
            case MenuDrawerOption.SaveWorkspace:
                if (currentWorkspaceName !== '' && currentWorkspaceName !== 'untitled')
                    saveWorkspace(currentWorkspaceName, currentWorkspaceDescription)
                else {
                    setShowSaveWorkspace(true)
                }
                break
            case MenuDrawerOption.SaveWorkspaceAs: {
                    let values = await getWorkspaces()
                    if (values) {
                        setWorkspaces(values)
                        setShowSaveWorkspace(true)
                }}
                break
            case MenuDrawerOption.LoadWorkspace: {
                let values = await getWorkspaces()
                if (values) {
                    setWorkspaces(values)
                    setSelectWorkspaceAction ('load')
                    setShowSelectWorkspace(true)
                }}
                break
            case MenuDrawerOption.DeleteWorkspace: {
                let values = await getWorkspaces()
                if (values) {
                    setWorkspaces( values )
                    setSelectWorkspaceAction ('delete')
                    setShowSelectWorkspace(true)
                }}
                break
            case MenuDrawerOption.ManageCluster:
                setShowManageClusters(true)
                break
            case MenuDrawerOption.ApiSecurity:
                setShowApiSecurity(true)
                break
            case MenuDrawerOption.UserSecurity:
                setShowUserSecurity(true)
                break
            case MenuDrawerOption.ManagePlugins:
                setShowPluginDialog(true)
                break
            case MenuDrawerOption.ManageProviders:
                setShowProviderDialog(true)
                break
            case MenuDrawerOption.ManageSenders:
                setShowSenderDialog(true)
                break
            // case MenuDrawerOption.ManageDaemons:
            //     setShowDaemonDialog(true)
            //     break
            case MenuDrawerOption.ManageThemes:
                setShowThemeDialog(true)
                break
            case MenuDrawerOption.ManageHomepages:
                setShowHomepageDialog(true)
                break
            case MenuDrawerOption.ManageIdps:
                setShowManageIdps(true)
                break
            case MenuDrawerOption.ManageDocs:
                setShowDocsDialog(true)
                break
            case MenuDrawerOption.ExportWorkspaces: {
                const allNames:string[] = await (await fetch (`${backendUrl}/store/${user?.id}/workspaces`, addGetAuthorization(accessString))).json()
                if (allNames.length===0) { showNoWorkspaces(); break }
                const allContent:Record<string,any> = {}
                for (const name of allNames) {
                    const ws = await (await fetch (`${backendUrl}/store/${user?.id}/workspaces/${name}`, addGetAuthorization(accessString))).json()
                    allContent[name] = JSON.parse(ws)
                }
                setPendingExportData(allContent)
                setWorkspacePickerNames(allNames)
                setWorkspacePickerMode('export')
                break
            }
            case MenuDrawerOption.ImportWorkspaces:
                // nothing to do, the menuitem launches the handleUpload
                break
            case MenuDrawerOption.SettingsUser:
                setShowSettingsUser(true)
                break
            case MenuDrawerOption.SettingsCluster:
                setShowSettingsCluster(true)
                break
            case MenuDrawerOption.UpdateKwirth:
                setMsgBox(MsgBoxYesNo('Update Kwirth',`This action will restart the Kwirth instance and users won't be able to work during 7 to 10 seconds. In addition, all volatile API keys will be deleted. Do you want to continue?`,setMsgBox, (button) => {
                    if (button===MsgBoxButtons.Yes) {
                        fetch (`${backendUrl}/managekwirth/restart`, addGetAuthorization(accessString))
                    }
                }))
                break
            case MenuDrawerOption.About:
                setShowAbout(true)
                break
            case MenuDrawerOption.Exit:
                setLogged(false)
                break
        }
    }

    const handleDownload = (content:string, filename:string,  mimeType:string='text/plain') => {
        const blob = new Blob([content], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    const handleUpload = (event:any) => {
        setMenuDrawerOpen(false)
        const file = event.target.files[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (e:any) => {
                const allWorkspaces = JSON.parse(e.target.result) as Record<string,any>
                setPendingImportData(allWorkspaces)
                setWorkspacePickerNames(Object.keys(allWorkspaces))
                setWorkspacePickerMode('import')
            }
            reader.readAsText(file)
        }
    }

    const onWorkspacePickerConfirm = (selected: string[]) => {
        if (workspacePickerMode === 'export') {
            const content: Record<string,any> = {}
            for (const name of selected) content[name] = pendingExportData[name]
            handleDownload(JSON.stringify(content), `${user?.id}-export-${new Date().toLocaleDateString()+'-'+new Date().toLocaleTimeString()}.kwirth.json`)
        } else if (workspacePickerMode === 'import') {
            for (const name of selected)
                fetch(`${backendUrl}/store/${user?.id}/workspaces/${name}`, addPostAuthorization(accessString, JSON.stringify(pendingImportData[name])))
        }
        setWorkspacePickerMode(null)
    }

    const onSettingsUserClosed = (ok:boolean) => {
        setShowSettingsUser(false)
        if (ok && user) writeLoggedUserSettings(user)
    }

    const onSettingsClusterClosed = (readMetricsInterval:number|undefined) => {
        setShowSettingsCluster(false)
        
        if (!readMetricsInterval) return
        if (readMetricsInterval) {
            let cluster = clusters.find(c => c.name === selectedClusterName)
            if (cluster && cluster.kwirthData)  {
                cluster.kwirthData.metricsInterval = readMetricsInterval
                let payload = JSON.stringify( { metricsInterval: readMetricsInterval } )
                fetch (`${cluster.url}/provider/metrics/config`, addPostAuthorization(cluster.accessString, payload))
            }
        }
    }

    const onRenameTabClosed = (newname:string|undefined) => {
        setShowRenameLog(false)
        if (!selectedTab.current || !newname) return
        selectedTab.current.name = newname
    }
 
    const onManageClustersClosed = (cc:Cluster[]) => {
        setShowManageClusters(false)
        let otherClusters = cc.filter (c => !c.source)
        let payload=JSON.stringify(otherClusters)
        fetch (`${backendUrl}/store/${user?.id}/clusters/list`, addPostAuthorization(accessString, payload))
        setClusters([...cc])
    }

    const onFirstTimeLoginClose = (exit:boolean) => {
        setFirstLogin(false)
        if (exit) setLogged(false)
    }

    const formatTabName = (tab : ITabObject) => {
        if (!tab.name) return <>noname</>
        let icon = <Box sx={{minWidth:'24px'}}/>
        if (tab.channel) icon = tab.channel.getChannelIcon()
        let name = tab.name
        if (name.length>20) name = tab.name.slice(0, 8) + '...' + tab.name.slice(-8)
        return <>{icon}&nbsp;{name}</>
    }

    const hasAdminScope = () => {
        if (!user) return false
        let resources = parseResources(user.accessKey.resources)
        return resources.some(r => r.scopes.split(',').includes('admin'))
    }

    const onHomepageSelectTab = async (tab: ITabSummary): Promise<void> => {
        let cluster = clusters.find(c => c.name === tab.channelObject.clusterName)
        if (cluster && user) {
            let clonedTab:ITabSummary = JSON.parse(JSON.stringify(tab))
            await fillTabSummary(clonedTab)
            await populateTabObject(user, clonedTab.name, clonedTab.channel, cluster, clonedTab.channelObject.view, clonedTab.channelObject.namespace, clonedTab.channelObject.group, clonedTab.channelObject.pod, clonedTab.channelObject.container, false, false, undefined)
            onClickChannelStart()
            setRefresh(Math.random())
        }
        else {
            notify(undefined, ENotifyLevel.ERROR, `Cluster ${tab.channelObject.clusterName} does not exist in your clusters list`)
        }
    }

    const onHomepageRestoreParameters = async (tab: ITabSummary): Promise<void> => {
        let cluster = clusters.find(c => c.name === tab.channelObject.clusterName)
        if (cluster) {
            setResourceSelected( {
                view:tab.channelObject.view,
                name: tab.name,
                controllers: tab.channelObject.group.split(','),
                clusterName: tab.channelObject.clusterName,
                containers: tab.channelObject.container.split(','),
                pods:tab.channelObject.pod.split(','),
                namespaces: tab.channelObject.namespace.split(','),
                channelId: tab.channel
            })
        }
    }

    const onHomepageSelectWorkspace = (workspace: IWorkspaceSummary): void => {
        loadWorkspace(workspace.name, true)
    }

    const onHomepageRestoreWorkspace = (workspace: IWorkspaceSummary): void => {
        loadWorkspace(workspace.name, false)
    }
    
    const onHomepageUpdateTabs = (last: ITabSummary[], fav: ITabSummary[]): void => {
        localStorage.setItem('lastTabs', JSON.stringify(last))
        localStorage.setItem('favTabs', JSON.stringify(fav))
        setLastTabs(last)
        setFavTabs(fav)
    }
    
    const onHomepageUpdateWorkspaces = (last: IWorkspaceSummary[], fav: IWorkspaceSummary[]): void => {
        localStorage.setItem('lastWorkspaces', JSON.stringify(last))
        localStorage.setItem('favWorkspaces', JSON.stringify(fav))
        setLastWorkspaces(last)
        setFavWorkspaces(fav)
    }
    
    const onSelectHome = () => {
        selectedTab.current = undefined
        setChannelMessageAction({action : EChannelRefreshAction.REFRESH})
    }

    const showNotifications = (event:any) => {
        setNotificationMenuAnchorParent(event.currentTarget)
    }

    const onLoginClosed = (user:IUser|undefined, firstTime:boolean) => {
        if (user) {
            autoStartedRef.current = false
            canExitFullscreenRef.current = user.exitFullScreen !== false
            if (user.startChannel) setAutoStartPending(true)
            setLogged(true)
            setFirstLogin(firstTime)
            setUser(user)
            const as = user.accessKey.id + '|' + user.accessKey.type + '|' + user.accessKey.resources
            setAccessString(as)
            setCurrentWorkspaceName('untitled')
            setCurrentWorkspaceDescription('No description yet')
            clearTabs()
            fetch(`${backendUrl}/license`, addGetAuthorization(as))
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (data && data.customerId) setLicenseInfo(data) })
                .catch(() => {})
        }
        else {
            setLogged(false)
            setRefresh(Math.random())
        }
    }

    // SSO handoff: al volver del IdP el back redirige con ?sso=<code> (o ?ssoerror=<motivo>).
    // Canjeamos el codigo (un solo uso) por el ILoginResponse y arrancamos la sesion.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const sso = params.get('sso')
        const ssoerror = params.get('ssoerror')
        if (!sso && !ssoerror) return
        window.history.replaceState({}, '', window.location.pathname)   // limpiamos el query param
        if (ssoerror) {
            setMsgBox(MsgBoxOkError('Login', `Single Sign-On failed (${ssoerror}).`, setMsgBox))
            return
        }
        (async () => {
            try {
                const resp = await fetch(`${props.backendUrl}/core/auth/exchange`, addPostAuthorization('', JSON.stringify({ code: sso })))
                if (resp.status !== 200) {
                    setSsoExchangePending(false)
                    setMsgBox(MsgBoxOkError('Login', 'Single Sign-On session could not be established.', setMsgBox))
                    return
                }
                const login = await resp.json() as ILoginResponse
                const ssoUser:IUser = { id: login.id, name: login.name, password: '', accessKey: login.accessKey, resources: '', startChannel: login.startChannel, exitFullScreen: login.exitFullScreen, enabledChannels: login.enabledChannels }
                setSsoExchangePending(false)
                onLoginClosed(ssoUser, false)
            }
            catch {
                setSsoExchangePending(false)
                setMsgBox(MsgBoxOkError('Login', 'Error contacting Kwirth backend for SSO.', setMsgBox))
            }
        })()
    }, [])

    const onContextSelectorLocal = async (name:string, accessKey: AccessKey) => {
        setCurrentWorkspaceName('untitled')
        setCurrentWorkspaceDescription('No description yet')
        clearTabs()
        let userId = localStorage.getItem('electronUser')
        if (!userId) {
            userId = uuid()
            localStorage.setItem('electronUser', userId)
        }
        let user:IUser = {
            id: userId,
            name: 'Kwirth Electron',
            password: '',
            accessKey: accessKey,
            resources: '',
        }
        let asStr = user.accessKey.id + '|' + user.accessKey.type + '|' + user.accessKey.resources
        setAccessString(asStr)
        setUser(user)
        await readLoggedUserSettings()

        let srcCluster = await loadSourceCluster(backendUrl, asStr)
        if (!srcCluster) {
            setMsgBox(MsgBoxOkError('KwirthDesktop start', 'Could not get source cluster info, so you will back to login page trying to be more lucky.', setMsgBox,  (b:MsgBoxButtons) => {
                setLogged(false)
            }))
            return
        }

        let magnifySettings = {
            config: undefined,
            instanceConfig: undefined
        }
        await populateTabObject(user, 'ELECTRON', 'magnify', srcCluster, EInstanceConfigView.CLUSTER, '', '', '', '', true, true, magnifySettings)
        setFirstLogin(false)
        setLogged(true)
    }

    const onContextSelectorRemote = async (name:string, url:string, accessString:string) => {
        setBackendUrl(url)
        setAccessString(accessString)
        setCurrentWorkspaceName('untitled')
        setCurrentWorkspaceDescription('No description yet')
        clearTabs()
        let userId = localStorage.getItem('electronUser')
        if (!userId) {
            userId = uuid()
            localStorage.setItem('electronUser', userId)
        }
        let user:IUser = {
            id: userId,
            name: 'Kwirth Electron',
            password: '',
            accessKey: accessKeyDeserialize(accessString),
            resources: '',
        }
        setUser(user)
        await readLoggedUserSettings()

        let srcCluster = await loadSourceCluster(url, accessString)
        if (!srcCluster) {
            setMsgBox(MsgBoxOkError('KwirthDesktop start', 'Could not get source cluster info, so you will back to login page trying to be more lucky.', setMsgBox,  (b:MsgBoxButtons) => {
                setLogged(false)
            }))
            return
        }

        let magnifySettings = {
            config: undefined,
            instanceConfig: undefined
        }
        await populateTabObject(user, 'ELECTRON', 'magnify', srcCluster, EInstanceConfigView.NAMESPACE  , 'default', '', '', '', true, true, magnifySettings)
        setFirstLogin(false)
        setLogged(true)
    }
    
    if (!logged) {
        //if (props.isDesktop) {
        if (props.auth === 'kubeconfig') {
            return <div style={{ backgroundImage:`url('./turbo-pascal.png')`, backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', width: '100vw', height: '100vh' }} >
                <SessionContext.Provider value={{ user, accessString: accessString, logged, backendUrl }}>
                    <ContextSelector onContextSelectorLocal={onContextSelectorLocal} onContextSelectorRemote={onContextSelectorRemote} isDesktop={props.isDesktop}/>
                </SessionContext.Provider>
            </div>
        }
        else {
            if (ssoExchangePending) {
                return (
                    <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'background.default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CircularProgress />
                    </Box>
                )
            }
            return (
                <div style={{ backgroundImage:`url('./turbo-pascal.png')`, backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', width: '100vw', height: '100vh' }} >
                    <SessionContext.Provider value={{ user, accessString: accessString, logged, backendUrl }}>
                        <Login methods={props.authMethods} onClose={onLoginClosed} key={refresh}></Login>
                    </SessionContext.Provider>
                </div>
            )
        }
    }

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {logged && (!themeReady || autoStartPending) && (
                <Box sx={{ position: 'fixed', inset: 0, zIndex: 9999, bgcolor: mode === 'dark' ? '#121212' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress />
                </Box>
            )}
            <SessionContext.Provider value={{ user, accessString: accessString, logged, backendUrl }}>
                { !fullscreenTab &&
                    <AppBar position='sticky' elevation={0} sx={{ zIndex: 1300, height:'64px'}}>
                    <Toolbar>
                        <IconButton size='large' edge='start' color='inherit' sx={{ mr: 1 }} onClick={() => setMenuDrawerOpen(prev => !prev)}><Menu /></IconButton>
                        <Typography sx={{ ml:1,flexGrow: 1 }}>Kwirth - {clusters.find(c => c.name === selectedClusterName)?.clusterInfo?.name}</Typography>
                        {/* <Tooltip title={<div style={{textAlign:'center'}}>{currentWorkspaceName}<br/><br/>{currentWorkspaceDescription}</div>} sx={{ mr:2}} slotProps={{popper: {modifiers: [{name: 'offset', options: {offset: [0, -12]}}]}}}>
                            <Typography variant='h6' component='div' sx={{mr:2, cursor:'default'}}>{currentWorkspaceName}</Typography>
                        </Tooltip> */}
                        <Tooltip title={<>Notifications</>}>
                            {notifications.current.length>0? 
                                <IconButton onClick={showNotifications}>
                                    <NotificationsActive sx={{color:notifications.current.some(n => n.level === ENotifyLevel.ERROR)? 'red':notifications.current.some(n => n.level === ENotifyLevel.WARNING)?'orange':'lightgray'}}/>
                                </IconButton>
                                :
                                <IconButton onClick={showNotifications}>
                                    <Notifications sx={{color:'white'}}/>
                                </IconButton>
                            }
                        </Tooltip>
                        <FormControlLabel control={<Switch size='small' onClick={toggleColorMode} checked={mode==='dark'}/>} label={mode === 'light' ? 'light' : 'dark'} labelPlacement='bottom'/>
                        <Tooltip title={<div style={{textAlign:'center'}}>{user?.id}<br/>{user?.name}<br/>[{user && parseResources(user.accessKey.resources).map(r=>r.scopes).join(',')}]{licenseInfo && <><br/>customer: {licenseInfo.customerId}<br/>expires: {licenseInfo.expiry}</>}</div>} sx={{ mr:2 }} slotProps={{popper: {modifiers: [{name: 'offset', options: {offset: [0, -6]}}]}}}>
                            {licenseInfo ? <AccountCircle/> : <Person/>}
                        </Tooltip>
                    </Toolbar>
                    </AppBar>
                }

                { !fullscreenTab &&
                    <Drawer sx={{ flexShrink: 0, '& .MuiDrawer-paper': {mt: '64px'} }} anchor="left" open={menuDrawerOpen} onClose={() => setMenuDrawerOpen(false)}>
                        <Stack direction={'column'}>
                            <MenuDrawer optionSelected={menuDrawerOptionSelected} uploadSelected={handleUpload} selectedClusterName={selectedClusterName} hasAdminScope={hasAdminScope()}/>
                        </Stack>
                    </Drawer>
                }

                { !fullscreenTab && 
                    <ResourceSelector clusters={clusters} backChannels={backChannels} onAdd={(res) => onResourceSelectorAdd(res, false, undefined)} onChangeCluster={onChangeCluster} sx={{ mt:1, ml:1 }} tabs={tabs.current} data-refresh={channelMessageAction} resourceSelected={resourceSelected} frontChannels={frontChannels}/>
                }
                
                <Stack direction={'column'} display={'flex'} flexDirection={'column'} sx={{minHeight:0, height:'100%', flexGrow:1}}>
                    { !fullscreenTab && 
                        <Stack direction={'row'} alignItems={'end'} sx={{borderBottom: 1, borderColor: 'divider', mt:1}}>
                            <Tabs value={selectedTab.current? false : 0} sx={{minWidth:'100px', minHeight: '48px', height: '48px'}}>
                                <Tab key={'0'} label={<Home/>} value={0} onClick={onSelectHome}/>
                            </Tabs>
                            { tabs.current.length>0 &&
                                <Tabs value={selectedTab.current? tabs.current.indexOf(selectedTab.current) : false} onChange={onChangeTab} variant='scrollable' scrollButtons='auto' TabIndicatorProps={{ style: { display: 'none' } }} 
                                    sx={{
                                        ml: "-16px",
                                        minHeight: '48px',
                                        height: '48px',
                                        '& .MuiTab-root': {
                                            minHeight: '48px', height: '48px', paddingTop: 0, paddingBottom: 0, borderRadius: '8px 8px 0 0', backgroundColor: 'background.paper', textTransform: 'none', paddingLeft: '12px',
                                        },
                                        '& .MuiTab-root .MuiTouchRipple-root': {
                                            borderTopLeftRadius: '8px',
                                            borderTopRightRadius: '8px'
                                        }
                                    }}
                                >
                                    {   tabs.current.map((tab:ITabObject, index) => {
                                            return <Tab component='span' ref={(el) => tab.headerEl === el} key={index} label={formatTabName(tab)} value={index}
                                                style={{ borderLeft: `6px solid ${getTabColor(tab)}`, borderTop: '1px solid #888888', borderRight: '1px solid #888888', boxSizing: 'border-box', backgroundColor: clusterColor(tab.channelObject?.clusterName ?? '', mode).tabBg }}
                                                icon={
                                                    tab === selectedTab.current ? 
                                                        <IconButton onClick={(event) => setAnchorMenuTab(event.currentTarget)}>
                                                            <SettingsIcon fontSize='small' color='primary'/>
                                                        </IconButton>
                                                        :
                                                        <Box sx={{minWidth:'36px'}}/>
                                                } 
                                                iconPosition='end'
                                                sx={{
                                                    borderRadius: '10px 10px 0 0',
                                                    '& .MuiTouchRipple-root': {
                                                        borderTopLeftRadius: '8px',
                                                        borderTopRightRadius: '8px',
                                                    }}
                                                }
                                            />
                                        })
                                    }
                                </Tabs>
                            }
                            <Typography sx={{ flexGrow: 1 }}></Typography>
                        </Stack>
                    }
                    { selectedTab.current &&
                        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow:1, height:'100%', minHeight:0 }}>
                            { anchorMenuTab && <MenuTab onClose={() => setAnchorMenuTab(null)} optionSelected={menuTabOptionSelected} anchorMenuTab={anchorMenuTab} tabs={tabs.current} selectedTab={selectedTab.current} selectedTabIndex={selectedTab.current? tabs.current.indexOf(selectedTab.current) : -1} backChannels={backChannels}/>}
                            <TabContent key={selectedTab.current?.name} channel={selectedTab.current?.channel} channelObject={selectedTab.current?.channelObject ? { ...selectedTab.current.channelObject, isFullscreen: fullscreenTab !== undefined } : undefined} />
                        </Box>
                    }
                    { !selectedTab.current &&
                        <Box sx={{ display: 'flex', flexDirection: 'column', height:'100%', minHeight:0 }}>
                            {(() => {
                                const isExtensionLicensed = (type: string, id: string) => licenseInfo ? (licenseInfo.extensions[type]?.includes(id) ?? false) : true
                                const getClusterEvents = async (clusterName: string, limit = 25) => {
                                    const cluster = clusters.find(c => c.name === clusterName)
                                    if (!cluster) return []
                                    try {
                                        const res = await fetch(`${cluster.url}/provider/events?limit=${limit}`, addGetAuthorization(cluster.accessString))
                                        if (!res.ok) return []
                                        const items = await res.json() as IRawKubeEvent[]
                                        // project raw kube events to the summary shape consumed by homepages (IClusterEvent)
                                        return items.map(e => ({
                                            time: String(e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? ''),
                                            type: e.type ?? '',
                                            reason: e.reason ?? '',
                                            namespace: e.involvedObject?.namespace,
                                            object: `${e.involvedObject?.kind ?? ''}/${e.involvedObject?.name ?? ''}`,
                                            message: e.message ?? '',
                                        }))
                                    } catch { return [] }
                                }
                                const getClusterMetrics = async (clusterName: string) => {
                                    const cluster = clusters.find(c => c.name === clusterName)
                                    if (!cluster) return null
                                    try {
                                        const res = await fetch(`${cluster.url}/provider/metrics/usage/cluster`, addGetAuthorization(cluster.accessString))
                                        if (!res.ok) return null
                                        const data = await res.json()
                                        return { cpu: data.cpuUsage as number, memory: data.memoryUsage as number, vcpus: data.vcpus as number, totalMemoryBytes: data.memory as number, pods: data.pods as number, maxPods: data.maxPods as number }
                                    } catch { return null }
                                }
                                const homepageProps = { lastTabs, favTabs, lastWorkspaces, favWorkspaces, onHomepageSelectTab, onRestoreTabParameters: onHomepageRestoreParameters, onSelectWorkspace: onHomepageSelectWorkspace, onRestoreWorkspace: onHomepageRestoreWorkspace, frontChannels, onUpdateTabs: onHomepageUpdateTabs, cluster: clusters.find(c => c.name === selectedClusterName), clusters, onUpdateWorkspaces: onHomepageUpdateWorkspaces, dataCpu: dataCpu.current, dataMemory: dataMemory.current, dataNetwork: dataNetwork.current, isExtensionLicensed, getClusterEvents, getClusterMetrics, config: homepageConfig }
                                const ext: IHomepageExtension | undefined = activeHomepageId ? window.__kwirth_homepages__?.[activeHomepageId] : undefined
                                const pendingSaved = !activeHomepageId && !!localStorage.getItem('kwirth.homepage')
                                return ext ? <ext.Component {...homepageProps} /> : pendingSaved ? null : <Homepage {...homepageProps} />
                            })()}
                        </Box>
                    }

                </Stack>

                { showRenameTab && <RenameTab onClose={onRenameTabClosed} tabs={tabs.current} oldname={selectedTab.current?.name}/> }
                { showSaveWorkspace && <SaveWorkspace onClose={onSaveWorkspaceClosed} name={currentWorkspaceName} description={currentWorkspaceDescription} values={workspaces} /> }
                { showSelectWorkspace && <SelectWorkspace onSelect={onSelectWorkspaceClosed} values={workspaces} action={selectWorkspaceAction}/> }
                { workspacePickerMode && <WorkspacePickerDialog title={workspacePickerMode === 'export' ? 'Select workspaces to export' : 'Select workspaces to import'} workspaceNames={workspacePickerNames} onConfirm={onWorkspacePickerConfirm} onCancel={() => setWorkspacePickerMode(null)} /> }
                { showManageClusters && <ManageClusters onClose={onManageClustersClosed} clusters={clusters} notify={notify}/> }
                { showApiSecurity && <ManageApiSecurity onClose={() => setShowApiSecurity(false)} /> }
                { showUserSecurity && <ManageUserSecurity onClose={() => setShowUserSecurity(false)} /> }
                { showPluginDialog && <PluginDialog onClose={() => setShowPluginDialog(false)} onPluginLoaded={loadPluginFront} onPluginUnloaded={unloadPluginFront} /> }
                { showProviderDialog && <ProviderDialog onClose={() => setShowProviderDialog(false)} /> }
                { showManageIdps && <ManageIdps onClose={() => setShowManageIdps(false)} /> }
                { showSenderDialog && <SenderDialog onClose={() => setShowSenderDialog(false)} /> }
                { showThemeDialog && <ThemeDialog onClose={() => setShowThemeDialog(false)} activeThemeName={activeThemeName} onActivate={setActiveThemeName} onThemeLoad={loadThemeFront} onThemeUnload={unloadThemeFront} /> }
                { showHomepageDialog && <HomepageDialog onClose={() => setShowHomepageDialog(false)} activeHomepageId={activeHomepageId} onActivate={onHomepageActivate} onHomepageLoad={loadHomepageFront} onHomepageUnload={unloadHomepageFront} /> }
                { showDocsDialog && <DocsDialog onClose={() => setShowDocsDialog(false)} /> }
                { showChannelSetup() }
                { showSettingsUser && <SettingsUser onClose={onSettingsUserClosed} settings={userSettingsRef.current} /> }
                { showSettingsCluster && clusters && <SettingsCluster onClose={onSettingsClusterClosed} clusterName={selectedClusterName} clusterMetricsInterval={clusters.find(c => c.name===selectedClusterName)?.kwirthData?.metricsInterval} /> }
                
                { initialMessage !== '' && MsgBoxOk('Kwirth',initialMessage, () => setInitialMessage(''))}
                { firstLogin && <FirstTimeLogin onClose={onFirstTimeLoginClose}/> }
                <Snackbar open={notifySnackbarOpen} autoHideDuration={3000} anchorOrigin={{vertical: 'bottom', horizontal:'center'}} onClose={onNotifySnackbarClose}>
                    <Alert severity={notifySnackbarLevel} variant="filled" onClose={onNotifySnackbarClose} sx={{ width: '100%' }}>{notifySnackbarMessage}</Alert>
                </Snackbar>
                { notificationMenuAnchorParent && <MenuNotification anchorParent={notificationMenuAnchorParent} notifications={notifications.current} onRefresh={() => setRefresh(Math.random())} onClose={() => setNotificationMenuAnchorParent(null)} channels={frontChannels} />}
                { msgBox }
                { showAbout && <About onClose={() => setShowAbout(false)}/>}
            </SessionContext.Provider>
        </ThemeProvider>
    )
}

export default App