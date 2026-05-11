import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
    Box, Chip, CircularProgress, Divider, IconButton, InputAdornment,
    ListItemIcon, ListItemText, Menu, MenuItem, Paper, Stack, TextField,
    Tooltip, Typography,
} from '@mui/material'
import {
    CenterFocusStrong, Clear, ContentCopy, Delete, Hub, Info,
    PlayArrow, Refresh, Search, Stop, Terminal, Timeline, ZoomIn, ZoomOut,
} from '@mui/icons-material'
import { IContentProps } from './types'
import {
    ETopologyNodeKind, ETopologyNodeStatus,
    ICanvasState, ITopologyData, ITopologyNode,
} from './TopologyData'
import { ITopologyConfig } from './TopologyConfig'
import {
    EInstanceConfigView,
    EInstanceMessageAction, EInstanceMessageFlow,
    EInstanceMessageType,
} from '@kwirthmagnify/kwirth-common'
import { ENotifyLevel } from './types'

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_SIZE = 14

const KIND_COLOR: Record<ETopologyNodeKind, number> = {
    [ETopologyNodeKind.INGRESS]:               0x378add,
    [ETopologyNodeKind.SERVICE]:               0x7f77dd,
    [ETopologyNodeKind.DEPLOYMENT]:            0x1d9e75,
    [ETopologyNodeKind.STATEFULSET]:           0x639922,
    [ETopologyNodeKind.DAEMONSET]:             0x4a9076,
    [ETopologyNodeKind.REPLICASET]:            0x89c1a0,
    [ETopologyNodeKind.JOB]:                   0xef9f27,
    [ETopologyNodeKind.CRONJOB]:               0xba7517,
    [ETopologyNodeKind.POD]:                   0x34d058,
    [ETopologyNodeKind.CONTAINER]:             0x00c8a0,
    [ETopologyNodeKind.PERSISTENTVOLUMECLAIM]: 0xe06b6b,
}

const STATUS_EMISSIVE: Record<ETopologyNodeStatus, number> = {
    [ETopologyNodeStatus.RUNNING]:     0x000000,
    [ETopologyNodeStatus.PENDING]:     0x443300,
    [ETopologyNodeStatus.FAILED]:      0x660000,
    [ETopologyNodeStatus.SUCCEEDED]:   0x003300,
    [ETopologyNodeStatus.UNKNOWN]:     0x222222,
    [ETopologyNodeStatus.TERMINATING]: 0x440044,
    [ETopologyNodeStatus.BOUND]:       0x003322,
    [ETopologyNodeStatus.RELEASED]:    0x332200,
    [ETopologyNodeStatus.LOST]:        0x440000,
}

const STATUS_COLOR: Record<ETopologyNodeStatus, 'default'|'success'|'warning'|'error'|'info'> = {
    [ETopologyNodeStatus.RUNNING]:     'success',
    [ETopologyNodeStatus.PENDING]:     'warning',
    [ETopologyNodeStatus.FAILED]:      'error',
    [ETopologyNodeStatus.SUCCEEDED]:   'info',
    [ETopologyNodeStatus.UNKNOWN]:     'default',
    [ETopologyNodeStatus.TERMINATING]: 'warning',
    [ETopologyNodeStatus.BOUND]:       'success',
    [ETopologyNodeStatus.RELEASED]:    'warning',
    [ETopologyNodeStatus.LOST]:        'error',
}

// ── Hierarchy: from bottom (PVC) to top (Ingress) ────────────────────────────
// When propagating highlights UP we follow edges / ownerUids toward Ingress.
// When propagating DOWN we follow reverse edges / pods owned by a controller.
// Ingress is the ceiling — we never continue past it.

const KIND_LEVEL: Record<ETopologyNodeKind, number> = {
    [ETopologyNodeKind.PERSISTENTVOLUMECLAIM]: 0,
    [ETopologyNodeKind.CONTAINER]:             1,
    [ETopologyNodeKind.POD]:                   2,
    [ETopologyNodeKind.REPLICASET]:            3,
    [ETopologyNodeKind.JOB]:                   3,
    [ETopologyNodeKind.CRONJOB]:               3,
    [ETopologyNodeKind.DEPLOYMENT]:            4,
    [ETopologyNodeKind.STATEFULSET]:           4,
    [ETopologyNodeKind.DAEMONSET]:             4,
    [ETopologyNodeKind.SERVICE]:               5,
    [ETopologyNodeKind.INGRESS]:               6,
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface ICtxAction { icon: React.ReactNode; label: string; action: string; divider?: boolean }

const COMMON_ACTIONS: ICtxAction[] = [
    { icon: <Timeline fontSize='small'/>,    label: 'View path',    action: 'view-path', divider: true },
    { icon: <Info fontSize='small'/>,        label: 'View details', action: 'details' },
    { icon: <ContentCopy fontSize='small'/>, label: 'Copy name',    action: 'copy-name', divider: true },
]

const KIND_ACTIONS: Partial<Record<ETopologyNodeKind, ICtxAction[]>> = {
    [ETopologyNodeKind.CONTAINER]: [
        { icon: <Terminal fontSize='small'/>,  label: 'Open shell',  action: 'shell' },
        { icon: <PlayArrow fontSize='small'/>, label: 'View logs',   action: 'logs', divider: true },
    ],
    [ETopologyNodeKind.POD]: [
        { icon: <PlayArrow fontSize='small'/>, label: 'View logs',       action: 'logs' },
        { icon: <Delete fontSize='small'/>,    label: 'Delete pod',      action: 'delete-pod', divider: true },
    ],
    [ETopologyNodeKind.DEPLOYMENT]: [
        { icon: <PlayArrow fontSize='small'/>, label: 'Scale up (+1)',   action: 'scale-up' },
        { icon: <Stop fontSize='small'/>,      label: 'Scale to zero',   action: 'scale-zero' },
        { icon: <Refresh fontSize='small'/>,   label: 'Restart rollout', action: 'restart', divider: true },
    ],
    [ETopologyNodeKind.STATEFULSET]: [
        { icon: <PlayArrow fontSize='small'/>, label: 'Scale up (+1)',   action: 'scale-up' },
        { icon: <Stop fontSize='small'/>,      label: 'Scale to zero',   action: 'scale-zero' },
        { icon: <Refresh fontSize='small'/>,   label: 'Restart rollout', action: 'restart', divider: true },
    ],
    [ETopologyNodeKind.DAEMONSET]: [
        { icon: <Refresh fontSize='small'/>, label: 'Restart rollout', action: 'restart', divider: true },
    ],
    [ETopologyNodeKind.SERVICE]: [
        { icon: <Hub fontSize='small'/>, label: 'Show endpoints', action: 'endpoints', divider: true },
    ],
    [ETopologyNodeKind.INGRESS]: [
        { icon: <Info fontSize='small'/>, label: 'Show rules', action: 'ingress-rules', divider: true },
    ],
}

function actionsFor(kind: ETopologyNodeKind): ICtxAction[] {
    return [...(KIND_ACTIONS[kind] ?? []), ...COMMON_ACTIONS]
}

// ── Node info panel ───────────────────────────────────────────────────────────

const NodeInfoPanel: React.FC<{ node: ITopologyNode }> = ({ node }) => (
    <Paper elevation={0} sx={{
        p: 1.5, width: 240, bgcolor: 'rgba(10,12,20,0.92)',
        border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 2,
    }}>
        <Stack spacing={0.5}>
            <Stack direction='row' alignItems='center' justifyContent='space-between'>
                <Typography variant='body2' fontWeight={500} noWrap sx={{ maxWidth: 150, color: '#fff' }}>{node.name}</Typography>
                <Chip label={node.status} size='small' color={STATUS_COLOR[node.status]} />
            </Stack>
            <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.5)' }}>{node.kind} · {node.namespace}</Typography>
            {node.podName && (
                <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.7)' }}>Pod: {node.podName}</Typography>
            )}
            {node.replicas !== undefined && (
                <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.7)' }}>
                    Replicas: {node.readyReplicas ?? '?'} / {node.replicas}
                </Typography>
            )}
            {node.image && (
                <Tooltip title={node.image}>
                    <Typography variant='caption' noWrap sx={{ color: 'rgba(255,255,255,0.5)' }}>
                        {node.image.length > 38 ? '…' + node.image.slice(-36) : node.image}
                    </Typography>
                </Tooltip>
            )}
            {node.host && <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.7)' }}>Host: {node.host}</Typography>}
            {node.ports && node.ports.length > 0 && (
                <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.7)' }}>Ports: {node.ports.join(', ')}</Typography>
            )}
            {node.storageClass && (
                <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.7)' }}>StorageClass: {node.storageClass}</Typography>
            )}
            {node.capacity && (
                <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.7)' }}>Capacity: {node.capacity}</Typography>
            )}
            {node.accessModes && node.accessModes.length > 0 && (
                <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.7)' }}>Access: {node.accessModes.join(', ')}</Typography>
            )}
            {node.edges && node.edges.length > 0 && (
                <>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', my: 0.5 }} />
                    <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        Connections: {node.edges.length}
                    </Typography>
                </>
            )}
            {Object.keys(node.labels).length > 0 && (
                <>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', my: 0.5 }} />
                    <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.3)', wordBreak: 'break-all' }}>
                        {Object.entries(node.labels).slice(0, 4).map(([k, v]) => `${k}=${v}`).join('  ')}
                    </Typography>
                </>
            )}
        </Stack>
    </Paper>
)

// ── Camera helpers ────────────────────────────────────────────────────────────

function updateCamera(cam: THREE.PerspectiveCamera, sph: { theta: number; phi: number; radius: number; tx?: number; ty?: number; tz?: number }) {
    const tx = sph.tx ?? 0, ty = sph.ty ?? 0, tz = sph.tz ?? 0
    cam.position.set(
        tx + sph.radius * Math.sin(sph.phi) * Math.sin(sph.theta),
        ty + sph.radius * Math.cos(sph.phi),
        tz + sph.radius * Math.sin(sph.phi) * Math.cos(sph.theta),
    )
    cam.lookAt(tx, ty, tz)
    cam.updateProjectionMatrix()
}

function animateCameraTo(
    cam:      THREE.PerspectiveCamera,
    sph:      React.MutableRefObject<{ theta: number; phi: number; radius: number; tx?: number; ty?: number; tz?: number }>,
    target:   THREE.Vector3,
    newRadius: number,
    newTheta:  number,
    newPhi:    number,
    durationMs = 600,
) {
    const start = performance.now()
    const r0 = sph.current.radius, t0 = sph.current.theta, p0 = sph.current.phi
    const lx0 = sph.current.tx ?? 0, ly0 = sph.current.ty ?? 0, lz0 = sph.current.tz ?? 0

    const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs)
        const e = 1 - Math.pow(1 - t, 3)

        sph.current.radius = r0 + (newRadius - r0) * e
        sph.current.theta  = t0 + (newTheta  - t0) * e
        sph.current.phi    = p0 + (newPhi    - p0) * e
        sph.current.tx     = lx0 + (target.x - lx0) * e
        sph.current.ty     = ly0 + (target.y - ly0) * e
        sph.current.tz     = lz0 + (target.z - lz0) * e

        updateCamera(cam, sph.current)

        if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
}

// ── Three.js helpers ──────────────────────────────────────────────────────────

function geometryFor(kind: ETopologyNodeKind): THREE.BufferGeometry {
    const s = NODE_SIZE
    switch (kind) {
        case ETopologyNodeKind.POD:                   return new THREE.SphereGeometry(s, 16, 12)
        case ETopologyNodeKind.CONTAINER:             return new THREE.SphereGeometry(s * 0.55, 10, 8)
        case ETopologyNodeKind.SERVICE:               return new THREE.CylinderGeometry(s, s, s * 1.6, 6)
        case ETopologyNodeKind.INGRESS:               return new THREE.CylinderGeometry(s * 1.3, s * 0.7, s * 1.2, 4)
        case ETopologyNodeKind.DEPLOYMENT:
        case ETopologyNodeKind.STATEFULSET:
        case ETopologyNodeKind.DAEMONSET:             return new THREE.BoxGeometry(s * 1.8, s * 1.8, s * 1.8)
        case ETopologyNodeKind.JOB:
        case ETopologyNodeKind.CRONJOB:               return new THREE.TetrahedronGeometry(s * 1.2)
        case ETopologyNodeKind.PERSISTENTVOLUMECLAIM: return new THREE.CylinderGeometry(s * 0.6, s * 1.0, s * 0.8, 8)
        default:                                      return new THREE.OctahedronGeometry(s)
    }
}

function makeLabel(text: string, fontSize: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 256; canvas.height = 50  // 256/50 ≈ 72/14 sprite aspect ratio
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.lineWidth = 3
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const display = text.length > 28 ? text.slice(0, 26) + '…' : text
    let fs = fontSize * 2
    ctx.font = `bold ${fs}px sans-serif`
    const measured = ctx.measureText(display)
    if (measured.width > 240) fs = Math.floor(fs * 240 / measured.width)
    ctx.font = `bold ${fs}px sans-serif`
    ctx.strokeText(display, 128, 25)
    ctx.fillText(display, 128, 25)
    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: true })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(72, 14, 1)
    sprite.position.set(0, NODE_SIZE * 1.8, 0)
    return sprite
}

function buildEdgeLine(from: ITopologyNode, to: ITopologyNode, color: number, opacity: number): THREE.Line {
    return new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(from.x, from.y, from.z),
            new THREE.Vector3(to.x, to.y, to.z),
        ]),
        new THREE.LineBasicMaterial({ color, opacity, transparent: true, linewidth: 2 })
    )
}

// Thicker highlighted path line — uses multiple offset lines to simulate width
function buildPathLine(from: ITopologyNode, to: ITopologyNode, color: number, opacity: number): THREE.Group {
    const group = new THREE.Group()
    const offsets = [
        [0, 0, 0], [1.2, 0, 0], [-1.2, 0, 0], [0, 1.2, 0], [0, -1.2, 0],
    ]
    offsets.forEach(([ox, oy, oz]) => {
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(from.x + ox, from.y + oy, from.z + oz),
                new THREE.Vector3(to.x + ox, to.y + oy, to.z + oz),
            ]),
            new THREE.LineBasicMaterial({ color, opacity, transparent: true, linewidth: 2 })
        )
        group.add(line)
    })
    return group
}

// ── Graph traversal: collect ALL nodes connected to `root` following hierarchy ─
//
// Strategy: BFS in both directions across the full hierarchy PVC→Ingress.
// - Going UP (toward Ingress): follow node.edges + reverse ownerUids.
// - Going DOWN (toward PVC): follow incoming edges + ownerUids pointing at node.
// Stop at Ingress (never continue upward from Ingress).
// Returns: set of involved node UIDs AND list of {from,to} pairs for edges.

interface IHighlightEdge { from: ITopologyNode; to: ITopologyNode; color: number }

function collectSubgraph(
    rootUid:  string,
    allNodes: Map<string, ITopologyNode>,
    nodeSet:  Set<string>,
): { involvedUids: Set<string>; edges: IHighlightEdge[] } {
    const involved  = new Set<string>([rootUid])
    const seenEdges = new Set<string>()
    const result:   IHighlightEdge[] = []

    const addEdge = (from: ITopologyNode, to: ITopologyNode, color: number) => {
        const key = `${from.uid}→${to.uid}`
        if (seenEdges.has(key)) return
        seenEdges.add(key)
        result.push({ from, to, color })
    }

    // Precompute reverse maps
    const incomingEdges = new Map<string, ITopologyNode[]>()
    const ownedBy       = new Map<string, ITopologyNode[]>()
    allNodes.forEach(n => {
        if (!nodeSet.has(n.uid)) return
        n.edges?.forEach(e => {
            if (!incomingEdges.has(e.targetUid)) incomingEdges.set(e.targetUid, [])
            incomingEdges.get(e.targetUid)!.push(n)
        })
        n.ownerUids?.forEach(oid => {
            if (!ownedBy.has(oid)) ownedBy.set(oid, [])
            ownedBy.get(oid)!.push(n)
        })
    })

    // ── Phase 1: go DOWN from root only ──────────────────────────────────────
    // Follows forward edges (Service→Pod, Pod→PVC) and ownedBy (RS→Pod, Pod→Container).
    // This finds direct descendants without touching siblings.
    const downQ = [rootUid]
    const downV = new Set<string>([rootUid])
    while (downQ.length > 0) {
        const uid  = downQ.shift()!
        const node = allNodes.get(uid)
        if (!node || !nodeSet.has(uid)) continue

        node.edges?.forEach(edge => {
            if (!nodeSet.has(edge.targetUid)) return
            const target = allNodes.get(edge.targetUid)
            if (!target) return
            addEdge(node, target, 0xffdd44)
            involved.add(target.uid)
            if (!downV.has(target.uid)) { downV.add(target.uid); downQ.push(target.uid) }
        })

        ownedBy.get(uid)?.forEach(child => {
            if (!nodeSet.has(child.uid)) return
            addEdge(node, child, 0x66ffaa)
            involved.add(child.uid)
            if (!downV.has(child.uid)) { downV.add(child.uid); downQ.push(child.uid) }
        })
    }

    // ── Phase 2: go UP from every involved node ───────────────────────────────
    // Follows ownerUids (Pod→RS→Deployment) and incomingEdges (Pod←Service←Ingress).
    // Starting from all descendants found in Phase 1 avoids expanding to siblings.
    const upQ = Array.from(involved)
    const upV = new Set<string>(involved)
    while (upQ.length > 0) {
        const uid  = upQ.shift()!
        const node = allNodes.get(uid)
        if (!node || !nodeSet.has(uid)) continue
        if (node.kind === ETopologyNodeKind.INGRESS) continue

        node.ownerUids?.forEach(oid => {
            if (!nodeSet.has(oid)) return
            const owner = allNodes.get(oid)
            if (!owner) return
            addEdge(owner, node, 0x66ffaa)
            involved.add(owner.uid)
            if (!upV.has(owner.uid)) { upV.add(owner.uid); upQ.push(owner.uid) }
        })

        incomingEdges.get(uid)?.forEach(src => {
            if (!nodeSet.has(src.uid)) return
            addEdge(src, node, 0xffdd44)
            involved.add(src.uid)
            if (!upV.has(src.uid)) { upV.add(src.uid); upQ.push(src.uid) }
        })
    }

    return { involvedUids: involved, edges: result }
}

// ── Search suggestion list ────────────────────────────────────────────────────

const SearchSuggestions: React.FC<{
    query:    string
    nodes:    ITopologyNode[]
    onSelect: (node: ITopologyNode) => void
}> = ({ query, nodes, onSelect }) => {
    if (!query) return null
    const q = query.toLowerCase()
    const matches = nodes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 8)
    if (!matches.length) return (
        <Paper sx={{ position: 'absolute', top: '100%', left: 0, right: 0, bgcolor: '#0f1420', border: '0.5px solid rgba(255,255,255,0.12)', zIndex: 10, p: 1 }}>
            <Typography variant='caption' sx={{ color: '#556' }}>No matches</Typography>
        </Paper>
    )
    return (
        <Paper sx={{ position: 'absolute', top: '100%', left: 0, right: 0, bgcolor: '#0f1420', border: '0.5px solid rgba(255,255,255,0.12)', zIndex: 10, maxHeight: 240, overflow: 'auto' }}>
            {matches.map(n => {
                const hex = '#' + (KIND_COLOR[n.kind] ?? 0x888888).toString(16).padStart(6, '0')
                return (
                    <MenuItem key={n.uid} dense onClick={() => onSelect(n)} sx={{ color: '#ccc', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}>
                        <Stack direction='row' spacing={1} alignItems='center'>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: hex, flexShrink: 0 }} />
                            <Typography variant='caption' noWrap sx={{ color: '#ccc', maxWidth: 160 }}>{n.name}</Typography>
                            <Typography variant='caption' sx={{ color: '#556', flexShrink: 0 }}>{n.kind}</Typography>
                        </Stack>
                    </MenuItem>
                )
            })}
        </Paper>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export const TopologyTabContent: React.FC<IContentProps> = ({ channelObject }) => {
    const rootRef      = useRef<HTMLDivElement>(null)
    const [canvasTop, setCanvasTop] = useState(0)
    const mountRef     = useRef<HTMLDivElement>(null)
    const rendererRef  = useRef<THREE.WebGLRenderer>()
    const sceneRef     = useRef<THREE.Scene>()
    const cameraRef    = useRef<THREE.PerspectiveCamera>()
    const meshMapRef   = useRef<Map<string, THREE.Mesh>>(new Map())
    const edgeLinesRef = useRef<THREE.Line[]>([])
    const hlLinesRef   = useRef<THREE.Line[]>([])
    const pathGroupRef = useRef<THREE.Group[]>([])   // thick path lines
    const animRef      = useRef<number>()
    const isDragging   = useRef(false)
    const isPanning    = useRef(false)
    const prevMouse    = useRef({ x: 0, y: 0 })
    const spherical    = useRef({ theta: 0.4, phi: 1.1, radius: 700, tx: 0, ty: 0, tz: 0 })
    const selectedRef    = useRef<string | undefined>()
    const pathModeRef         = useRef<string | undefined>()
    const hiddenKindsRef      = useRef<Set<ETopologyNodeKind>>(new Set())
    const hiddenNamespacesRef = useRef<Set<string>>(new Set())
    const restoredRef         = useRef(false)

    const [selectedNode,       setSelectedNode]       = useState<ITopologyNode | undefined>()
    const [contextMenu,        setContextMenu]        = useState<{ x: number; y: number; node: ITopologyNode } | undefined>()
    const [hiddenKinds,        setHiddenKinds]        = useState<Set<ETopologyNodeKind>>(
        () => new Set((channelObject.data as ITopologyData).canvasState?.hiddenKinds ?? [])
    )
    const [hiddenNamespaces,   setHiddenNamespaces]   = useState<Set<string>>(
        () => new Set((channelObject.data as ITopologyData).canvasState?.hiddenNamespaces ?? [])
    )
    const [searchQuery,        setSearchQuery]        = useState('')
    const [searchFocused,      setSearchFocused]      = useState(false)
    const [pathModeNode,       setPathModeNode]       = useState<ITopologyNode | undefined>()
    const [pathNodes,          setPathNodes]          = useState<ITopologyNode[]>([])
    const [, forceUpdate] = useState(0)

    const topologyData: ITopologyData   = channelObject.data
    const topologyCfg:  ITopologyConfig = channelObject.config

    const availableNamespaces = React.useMemo(
        () => Array.from(new Set(Array.from(topologyData.nodes.values()).map(n => n.namespace))).sort(),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [topologyData.lastUpdated]
    )

    const visibleNodes = React.useMemo(
        () => Array.from(topologyData.nodes.values()).filter(n =>
            !hiddenKinds.has(n.kind) && !hiddenNamespaces.has(n.namespace)
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [topologyData.lastUpdated, hiddenKinds, hiddenNamespaces]
    )

    useLayoutEffect(() => {
        if (rootRef.current) setCanvasTop(rootRef.current.getBoundingClientRect().top)
    }, [])

    // Keep refs in sync with state
    useEffect(() => { hiddenKindsRef.current = hiddenKinds }, [hiddenKinds])
    useEffect(() => { hiddenNamespacesRef.current = hiddenNamespaces }, [hiddenNamespaces])

    // Save canvas state on unmount
    useEffect(() => {
        return () => {
            const state: ICanvasState = {
                ...spherical.current,
                hiddenKinds:      Array.from(hiddenKindsRef.current),
                hiddenNamespaces: Array.from(hiddenNamespacesRef.current),
                selectedUid: selectedRef.current,
                pathModeUid: pathModeRef.current,
            }
            topologyData.canvasState = state
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Three.js init ─────────────────────────────────────────────────────────
    useEffect(() => {
        const el = mountRef.current
        if (!el) return

        const w = el.clientWidth  || 800
        const h = el.clientHeight || 600

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
        renderer.setSize(w, h)
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.shadowMap.enabled = true
        el.appendChild(renderer.domElement)
        rendererRef.current = renderer

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x0a0c14)
        scene.fog = new THREE.Fog(0x0a0c14, 900, 2500)
        sceneRef.current = scene

        scene.add(new THREE.AmbientLight(0xffffff, 0.55))
        const dir = new THREE.DirectionalLight(0xffffff, 0.9)
        dir.position.set(200, 500, 300); dir.castShadow = true
        scene.add(dir)
        const point = new THREE.PointLight(0x4488ff, 0.4, 1400)
        point.position.set(-300, 150, 200)
        scene.add(point)

        const grid = new THREE.GridHelper(1600, 24, 0x1a2230, 0x1a2230)
        grid.position.y = -200
        scene.add(grid)

        const layers = [
            { z: 300, label: 'Ingress' }, { z: 150, label: 'Services' },
            { z: 0, label: 'Controllers' }, { z: -75, label: 'ReplicaSets' },
            { z: -150, label: 'Pods' }, { z: -225, label: 'Containers' },
            { z: -300, label: 'PVCs' },
        ]
        layers.forEach(({ z, label }) => {
            const cv = document.createElement('canvas')
            cv.width = 320; cv.height = 48
            const c = cv.getContext('2d')!
            c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(0, 0, 320, 48)
            c.fillStyle = '#6688aa'; c.font = '20px sans-serif'; c.fillText(label, 10, 32)
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.6 }))
            sp.position.set(-700, 0, z); sp.scale.set(160, 24, 1)
            scene.add(sp)
        })

        if (topologyData.canvasState) {
            const s = topologyData.canvasState
            spherical.current = { theta: s.theta, phi: s.phi, radius: s.radius, tx: s.tx, ty: s.ty, tz: s.tz }
        }

        const camera = new THREE.PerspectiveCamera(50, w / h, 1, 4000)
        updateCamera(camera, spherical.current)
        cameraRef.current = camera

        const animate = () => {
            animRef.current = requestAnimationFrame(animate)
            const sel = selectedRef.current
            if (sel) {
                const mesh = meshMapRef.current.get(sel)
                if (mesh) {
                    const mat = mesh.material as THREE.MeshPhongMaterial
                    mat.emissiveIntensity = 0.3 + 0.25 * Math.sin(Date.now() * 0.004)
                }
            }
            hlLinesRef.current.forEach((line, i) => {
                const mat = line.material as THREE.LineBasicMaterial
                mat.opacity = 0.55 + 0.4 * Math.sin(Date.now() * 0.004 + i * 0.5)
            })
            renderer.render(scene, camera)
        }
        animate()

        const ro = new ResizeObserver(() => {
            const nw = el.clientWidth, nh = el.clientHeight
            renderer.setSize(nw, nh); camera.aspect = nw / nh; camera.updateProjectionMatrix()
        })
        ro.observe(el)

        return () => { cancelAnimationFrame(animRef.current!); ro.disconnect(); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Rebuild meshes ────────────────────────────────────────────────────────
    useEffect(() => {
        const scene = sceneRef.current
        if (!scene) return

        meshMapRef.current.forEach(m => scene.remove(m)); meshMapRef.current.clear()
        edgeLinesRef.current.forEach(l => scene.remove(l)); edgeLinesRef.current = []
        hlLinesRef.current.forEach(l => scene.remove(l)); hlLinesRef.current = []
        pathGroupRef.current.forEach(g => scene.remove(g)); pathGroupRef.current = []

        const nodeSet = new Set(visibleNodes.map(n => n.uid))

        visibleNodes.forEach(node => {
            if (topologyCfg.showOnlyRunning && node.status !== ETopologyNodeStatus.RUNNING) return
            const geo = geometryFor(node.kind)
            const mat = new THREE.MeshPhongMaterial({
                color:             KIND_COLOR[node.kind] ?? 0x888888,
                emissive:          new THREE.Color(STATUS_EMISSIVE[node.status] ?? 0),
                emissiveIntensity: selectedRef.current === node.uid ? 0.5 : 0.15,
                shininess:         70,
            })
            const mesh = new THREE.Mesh(geo, mat)
            mesh.position.set(node.x, node.y, node.z)
            mesh.castShadow = true
            mesh.userData = { uid: node.uid }
            mesh.add(makeLabel(node.name, topologyCfg.labelSize))
            scene.add(mesh)
            meshMapRef.current.set(node.uid, mesh)
        })

        // Normal edges (dim) — forward edges and ownership edges
        visibleNodes.forEach(node => {
            node.edges?.forEach(edge => {
                if (!nodeSet.has(edge.targetUid)) return
                const target = topologyData.nodes.get(edge.targetUid)
                if (!target) return
                const line = buildEdgeLine(node, target, 0x4488dd, 0.5)
                scene.add(line); edgeLinesRef.current.push(line)
            })
            node.ownerUids?.forEach(oid => {
                if (!nodeSet.has(oid)) return
                const owner = topologyData.nodes.get(oid)
                if (!owner) return
                const line = buildEdgeLine(owner, node, 0x44aa44, 0.4)
                scene.add(line); edgeLinesRef.current.push(line)
            })
        })

        if (pathModeRef.current) {
            const { involvedUids, edges } = collectSubgraph(pathModeRef.current, topologyData.nodes, nodeSet)
            meshMapRef.current.forEach((mesh, uid) => {
                const mat = mesh.material as THREE.MeshPhongMaterial
                const inPath = involvedUids.has(uid)
                mat.transparent = true
                mat.opacity     = inPath ? 1.0 : 0.07
                mat.emissiveIntensity = inPath && uid === pathModeRef.current ? 0.5 : inPath ? 0.15 : 0.0
                mat.needsUpdate = true
            })
            const seen = new Set<string>()
            edges.forEach(({ from, to, color }) => {
                const key = `${from.uid}→${to.uid}`
                if (seen.has(key)) return
                seen.add(key)
                const grp = buildPathLine(from, to, color, 0.92)
                scene.add(grp)
                pathGroupRef.current.push(grp)
            })
        } else {
            rebuildHighlightLines(scene, selectedRef.current, visibleNodes, nodeSet)
        }
        // One-time restore of path/selected state after nodes load
        if (!restoredRef.current && topologyData.lastUpdated > 0 && topologyData.canvasState) {
            restoredRef.current = true
            const uid = topologyData.canvasState.pathModeUid ?? topologyData.canvasState.selectedUid
            if (uid) {
                const node = topologyData.nodes.get(uid)
                if (node) {
                    if (topologyData.canvasState.pathModeUid) applyPathMode(node)
                    else { selectedRef.current = node.uid; setSelectedNode(node) }
                }
            }
        }

        forceUpdate(n => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topologyData.lastUpdated, topologyCfg.showOnlyRunning, topologyCfg.labelSize, topologyCfg.nodeSpacingFactor, hiddenKinds, hiddenNamespaces])

    // ── Highlight subgraph ────────────────────────────────────────────────────
    const rebuildHighlightLines = useCallback((
        scene:       THREE.Scene,
        selectedUid: string | undefined,
        nodes:       ITopologyNode[],
        nodeSet:     Set<string>,
    ) => {
        hlLinesRef.current.forEach(l => scene.remove(l))
        hlLinesRef.current = []
        if (!selectedUid) return

        const { edges } = collectSubgraph(selectedUid, topologyData.nodes, nodeSet)

        // Deduplicate edges by uid pair
        const seen = new Set<string>()
        edges.forEach(({ from, to, color }) => {
            const key = `${from.uid}→${to.uid}`
            if (seen.has(key)) return
            seen.add(key)
            const line = buildEdgeLine(from, to, color, 0.9)
            scene.add(line)
            hlLinesRef.current.push(line)
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topologyData.nodes])

    // ── Path mode: dim everything outside the subgraph, draw thick lines ──────
    const applyPathMode = useCallback((node: ITopologyNode) => {
        const scene = sceneRef.current
        if (!scene) return

        selectedRef.current = node.uid
        setSelectedNode(node)
        pathModeRef.current = node.uid
        setPathModeNode(node)

        const nodeSet = new Set(visibleNodes.map(n => n.uid))
        const { involvedUids, edges } = collectSubgraph(node.uid, topologyData.nodes, nodeSet)

        const sorted = Array.from(involvedUids)
            .map(u => topologyData.nodes.get(u))
            .filter((n): n is ITopologyNode => n !== undefined)
            .sort((a, b) => KIND_LEVEL[a.kind] - KIND_LEVEL[b.kind])
        setPathNodes(sorted)

        // Dim / restore meshes
        meshMapRef.current.forEach((mesh, uid) => {
            const mat = mesh.material as THREE.MeshPhongMaterial
            const inPath = involvedUids.has(uid)
            mat.transparent = true
            mat.opacity     = inPath ? 1.0 : 0.07
            mat.emissiveIntensity = inPath && uid === node.uid ? 0.5 : inPath ? 0.15 : 0.0
            mat.needsUpdate = true
        })

        // Dim normal edge lines
        edgeLinesRef.current.forEach(l => {
            const m = l.material as THREE.LineBasicMaterial
            m.opacity = 0.04; m.needsUpdate = true
        })

        // Remove old path groups
        pathGroupRef.current.forEach(g => scene.remove(g))
        pathGroupRef.current = []

        // Remove old highlight lines (path mode replaces them)
        hlLinesRef.current.forEach(l => scene.remove(l))
        hlLinesRef.current = []

        // Draw thick path lines
        const seen = new Set<string>()
        edges.forEach(({ from, to, color }) => {
            const key = `${from.uid}→${to.uid}`
            if (seen.has(key)) return
            seen.add(key)
            const grp = buildPathLine(from, to, color, 0.92)
            scene.add(grp)
            pathGroupRef.current.push(grp)
        })

        // Fly camera to subgraph
        const camera = cameraRef.current
        if (camera) {
            const involved = Array.from(involvedUids).map(u => topologyData.nodes.get(u)).filter((n): n is ITopologyNode => n !== undefined)
            if (involved.length > 0) {
                const cx = involved.reduce((s, n) => s + n.x, 0) / involved.length
                const cy = involved.reduce((s, n) => s + n.y, 0) / involved.length
                const cz = involved.reduce((s, n) => s + n.z, 0) / involved.length
                let maxDist = 100
                involved.forEach(n => {
                    const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2 + (n.z - cz) ** 2)
                    if (d > maxDist) maxDist = d
                })
                animateCameraTo(camera, spherical, new THREE.Vector3(cx, cy, cz), Math.max(260, maxDist * 2.4), spherical.current.theta, spherical.current.phi)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleNodes, topologyData.nodes])

    const exitPathMode = useCallback(() => {
        const scene = sceneRef.current
        if (!scene) return

        selectedRef.current = undefined
        setSelectedNode(undefined)
        pathModeRef.current = undefined
        setPathModeNode(undefined)
        setPathNodes([])

        // Restore all meshes
        meshMapRef.current.forEach((mesh) => {
            const mat = mesh.material as THREE.MeshPhongMaterial
            mat.transparent = false
            mat.opacity     = 1.0
            mat.emissiveIntensity = 0.15
            mat.needsUpdate = true
        })

        // Restore normal edge lines
        edgeLinesRef.current.forEach(l => {
            const m = l.material as THREE.LineBasicMaterial
            m.opacity = 0.5; m.needsUpdate = true
        })

        // Remove thick path lines and highlight lines
        pathGroupRef.current.forEach(g => scene.remove(g))
        pathGroupRef.current = []
        hlLinesRef.current.forEach(l => scene.remove(l))
        hlLinesRef.current = []
    }, [])
    // ── Mouse controls ────────────────────────────────────────────────────────
    const handleMouseDown  = useCallback((e: React.MouseEvent) => {
        if (e.button === 0) { isDragging.current = true; prevMouse.current = { x: e.clientX, y: e.clientY } }
        if (e.button === 1) { isPanning.current  = true; prevMouse.current = { x: e.clientX, y: e.clientY }; e.preventDefault() }
    }, [])
    const handleMouseUp    = useCallback(() => { isDragging.current = false; isPanning.current = false }, [])
    const handleMouseLeave = useCallback(() => { isDragging.current = false; isPanning.current = false }, [])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current && !isPanning.current) return
        const dx = e.clientX - prevMouse.current.x
        const dy = e.clientY - prevMouse.current.y
        prevMouse.current = { x: e.clientX, y: e.clientY }
        if (isDragging.current) {
            spherical.current.theta -= dx * 0.005
            spherical.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.current.phi + dy * 0.005))
        } else {
            // Pan: move look-at target along camera right and screen-up vectors
            // right      = ( cos θ,              0,           −sin θ          )
            // screen_up  = (−sin θ · cos φ,   sin φ,  −cos θ · cos φ )
            const { theta, phi, radius } = spherical.current
            const speed = radius * 0.0012
            spherical.current.tx = (spherical.current.tx ?? 0)
                - Math.cos(theta) * dx * speed
                - Math.sin(theta) * Math.cos(phi) * dy * speed
            spherical.current.ty = (spherical.current.ty ?? 0)
                + Math.sin(phi) * dy * speed
            spherical.current.tz = (spherical.current.tz ?? 0)
                + Math.sin(theta) * dx * speed
                - Math.cos(theta) * Math.cos(phi) * dy * speed
        }
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }, [])

    const handleWheel = useCallback((e: React.WheelEvent) => {
        spherical.current.radius = Math.max(150, Math.min(2500, spherical.current.radius + e.deltaY * 0.6))
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }, [])

    const pickNode = useCallback((e: React.MouseEvent): ITopologyNode | undefined => {
        const renderer = rendererRef.current, camera = cameraRef.current, el = mountRef.current
        if (!renderer || !camera || !el) return undefined
        const rect = el.getBoundingClientRect()
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        const ray = new THREE.Raycaster()
        ray.setFromCamera(mouse, camera)
        const hits = ray.intersectObjects(Array.from(meshMapRef.current.values()))
        if (!hits.length) return undefined
        return topologyData.nodes.get(hits[0].object.userData.uid)
    }, [topologyData.nodes])

    const handleClick = useCallback((e: React.MouseEvent) => {
        const node = pickNode(e)
        if (!node) {
            exitPathMode()
            return
        }
        applyPathMode(node)
    }, [pickNode, applyPathMode, exitPathMode])

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        const node = pickNode(e)
        if (node) setContextMenu({ x: e.clientX, y: e.clientY, node })
    }, [pickNode])

    // ── Context menu actions ──────────────────────────────────────────────────
    const handleAction = useCallback((action: string, node: ITopologyNode) => {
        setContextMenu(undefined)
        const ws = channelObject.webSocket

        const sendCmd = (topoAction: string, extra: Record<string, string | number | boolean> = {}) => {
            if (!ws) return
            ws.send(JSON.stringify({
                channel:  'topology',
                instance: channelObject.instanceId,
                type:     EInstanceMessageType.DATA,
                action:   EInstanceMessageAction.COMMAND,
                flow:     EInstanceMessageFlow.REQUEST,
                topoAction,
                kind:      node.kind,
                name:      node.name,
                namespace: node.namespace,
                uid:       node.uid,
                ...extra,
            }))
        }

        switch (action) {
            case 'view-path': applyPathMode(node); break
            case 'details':   selectedRef.current = node.uid; setSelectedNode(node); break
            case 'copy-name': navigator.clipboard.writeText(node.name); break
            case 'shell': {
                const podNode = node.kind === ETopologyNodeKind.CONTAINER
                    ? Array.from(topologyData.nodes.values()).find(n => node.ownerUids?.includes(n.uid) && n.kind === ETopologyNodeKind.POD)
                    : node
                if (podNode) {
                    const containerName = node.kind === ETopologyNodeKind.CONTAINER ? node.name : ''
                    channelObject.createTab?.({
                        clusterName: channelObject.clusterName,
                        namespaces: [podNode.namespace],
                        controllers: [],
                        pods: [podNode.name],
                        containers: containerName ? [containerName] : [],
                        channelId: 'ops',
                        view: EInstanceConfigView.POD,
                        name: containerName || podNode.name,
                    }, true, {
                        config: {
                            accessKey: 0,
                            launchShell: true,
                            shell: { namespace: podNode.namespace, pod: podNode.name, container: containerName },
                        },
                        instanceConfig: { sessionKeepAlive: true },
                    })
                }
                break
            }
            case 'logs': {
                const podNode = node.kind === ETopologyNodeKind.CONTAINER
                    ? Array.from(topologyData.nodes.values()).find(n => node.ownerUids?.includes(n.uid) && n.kind === ETopologyNodeKind.POD)
                    : node
                if (podNode) {
                    const containerName = node.kind === ETopologyNodeKind.CONTAINER ? node.name : ''
                    channelObject.createTab?.({
                        clusterName: channelObject.clusterName,
                        namespaces: [podNode.namespace],
                        controllers: [],
                        pods: [podNode.name],
                        containers: containerName ? [containerName] : [],
                        channelId: 'log',
                        view: EInstanceConfigView.POD,
                        name: containerName || podNode.name,
                    }, true, undefined)
                }
                break
            }
            case 'scale-up':  sendCmd('SCALE', { replicas: (node.replicas ?? 0) + 1 }); break
            case 'scale-zero':sendCmd('SCALE', { replicas: 0 }); break
            case 'restart':   sendCmd('RESTART'); break
            case 'delete-pod':sendCmd('DELETE_POD'); break
            default:          channelObject.notify?.('topology', ENotifyLevel.INFO, `${action} on ${node.name}`)
        }
    }, [channelObject, applyPathMode])

    // ── Camera controls ───────────────────────────────────────────────────────
    const resetCamera = () => {
        spherical.current = { theta: 0.4, phi: 1.1, radius: 700, tx: 0, ty: 0, tz: 0 }
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }
    const zoomIn  = () => { spherical.current.radius = Math.max(150, spherical.current.radius - 100); if (cameraRef.current) updateCamera(cameraRef.current, spherical.current) }
    const zoomOut = () => { spherical.current.radius = Math.min(2500, spherical.current.radius + 100); if (cameraRef.current) updateCamera(cameraRef.current, spherical.current) }

    // ── Kind toggle ───────────────────────────────────────────────────────────
    const toggleKind = useCallback((kind: ETopologyNodeKind) => {
        setHiddenKinds(prev => { const next = new Set(prev); next.has(kind) ? next.delete(kind) : next.add(kind); return next })
    }, [])

    const kindCount = (kind: ETopologyNodeKind) =>
        Array.from(topologyData.nodes.values()).filter(n => n.kind === kind).length

    // ── Search ────────────────────────────────────────────────────────────────
    const handleSearchSelect = useCallback((node: ITopologyNode) => {
        setSearchQuery(node.name)
        setSearchFocused(false)
        applyPathMode(node)
    }, [applyPathMode])

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Box ref={rootRef} sx={{ width: '100%', height: `calc(100vh - ${canvasTop}px)`, position: 'relative', bgcolor: '#0a0c14', overflow: 'hidden' }}>

            {/* Three.js canvas */}
            <Box
                ref={mountRef}
                sx={{ width: '100%', height: '100%', cursor: isDragging.current ? 'grabbing' : 'grab' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
                onClick={handleClick}
                onContextMenu={handleContextMenu}
            />

            {/* Loading */}
            {topologyData.loading && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <Stack alignItems='center' spacing={1}>
                        <CircularProgress size={32} sx={{ color: '#378add' }} />
                        <Typography variant='caption' sx={{ color: '#889' }}>Loading cluster topology…</Typography>
                    </Stack>
                </Box>
            )}

            {/* Empty */}
            {!topologyData.loading && topologyData.nodes.size === 0 && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <Typography variant='body2' sx={{ color: '#445' }}>No resources found. Start the channel to load the cluster topology.</Typography>
                </Box>
            )}

            {/* Error */}
            {topologyData.error && (
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bgcolor: 'rgba(180,0,0,0.8)', p: '4px 12px' }}>
                    <Typography variant='caption' sx={{ color: '#fff' }}>{topologyData.error}</Typography>
                </Box>
            )}

            {/* ── Path mode banner with breadcrumbs ── */}
            {pathModeNode && (
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    bgcolor: 'rgba(30,18,60,0.94)', borderBottom: '1px solid rgba(180,140,255,0.3)',
                    px: 1.5, py: '5px', display: 'flex', alignItems: 'center', gap: 1, zIndex: 6,
                }}>
                    <Timeline sx={{ color: '#bb88ff', fontSize: 16, flexShrink: 0 }} />
                    {/* Breadcrumb nodes */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, overflowX: 'auto', '&::-webkit-scrollbar': { height: 3 } }}>
                        {pathNodes.map((n, i) => {
                            const hex = '#' + (KIND_COLOR[n.kind] ?? 0x888888).toString(16).padStart(6, '0')
                            const isSelected = n.uid === pathModeNode.uid
                            return (
                                <React.Fragment key={n.uid}>
                                    {i > 0 && (
                                        <Typography variant='caption' sx={{ color: 'rgba(180,140,255,0.4)', flexShrink: 0 }}>›</Typography>
                                    )}
                                    <Box sx={{
                                        display: 'flex', alignItems: 'center', gap: 0.4, flexShrink: 0,
                                        px: 0.8, py: '2px', borderRadius: 1,
                                        bgcolor: isSelected ? hex + '33' : 'rgba(255,255,255,0.05)',
                                        border: `0.5px solid ${isSelected ? hex + '88' : 'rgba(255,255,255,0.1)'}`,
                                    }}>
                                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: hex, flexShrink: 0 }} />
                                        <Typography variant='caption' noWrap sx={{ color: isSelected ? hex : 'rgba(255,255,255,0.7)', fontSize: 10, maxWidth: 90 }}>
                                            {n.name}
                                        </Typography>
                                        <Typography variant='caption' sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, flexShrink: 0 }}>
                                            {n.kind}
                                        </Typography>
                                    </Box>
                                </React.Fragment>
                            )
                        })}
                    </Box>
                    <Chip
                        label='Exit'
                        size='small'
                        onClick={exitPathMode}
                        sx={{
                            flexShrink: 0, cursor: 'pointer', fontSize: 10,
                            bgcolor: 'rgba(180,130,255,0.15)', color: '#cc99ff',
                            border: '0.5px solid rgba(180,130,255,0.35)',
                            '&:hover': { bgcolor: 'rgba(180,130,255,0.28)' },
                        }}
                    />
                </Box>
            )}

            {/* ── Search bar — top centre ── */}
            <Box sx={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 280, zIndex: 5 }}>
                <Box sx={{ position: 'relative' }}>
                    <TextField
                        size='small'
                        placeholder='Search resource…'
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setSearchFocused(true) }}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                        InputProps={{
                            startAdornment: <InputAdornment position='start'><Search sx={{ color: '#557', fontSize: 18 }} /></InputAdornment>,
                            endAdornment: searchQuery
                                ? <InputAdornment position='end'>
                                    <IconButton size='small' onClick={() => { setSearchQuery(''); setSearchFocused(false) }} sx={{ color: '#557' }}>
                                        <Clear fontSize='small' />
                                    </IconButton>
                                  </InputAdornment>
                                : null,
                        }}
                        sx={{
                            width: '100%',
                            '& .MuiOutlinedInput-root': {
                                bgcolor: 'rgba(10,12,20,0.88)',
                                color: '#ccc',
                                fontSize: 13,
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
                                '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.25)' },
                                '&.Mui-focused fieldset': { borderColor: '#378add' },
                            },
                        }}
                    />
                    {searchFocused && searchQuery && (
                        <SearchSuggestions
                            query={searchQuery}
                            nodes={visibleNodes}
                            onSelect={handleSearchSelect}
                        />
                    )}
                </Box>
            </Box>

            {/* Camera controls — top right */}
            <Stack sx={{ position: 'absolute', top: 12, right: 12 }} spacing={0.5}>
                {[
                    { icon: <CenterFocusStrong fontSize='small'/>, title: 'Reset camera', fn: resetCamera },
                    { icon: <ZoomIn fontSize='small'/>,            title: 'Zoom in',      fn: zoomIn },
                    { icon: <ZoomOut fontSize='small'/>,           title: 'Zoom out',     fn: zoomOut },
                ].map(btn => (
                    <Tooltip key={btn.title} title={btn.title} placement='left'>
                        <IconButton size='small' onClick={btn.fn} sx={{
                            color: '#99aabb', bgcolor: 'rgba(0,0,0,0.55)',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                        }}>
                            {btn.icon}
                        </IconButton>
                    </Tooltip>
                ))}
            </Stack>

            {/* Namespace chips — bottom right */}
            {availableNamespaces.length > 1 && (
                <Box sx={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 0.75, maxHeight: '60%', overflowY: 'auto', alignItems: 'flex-end' }}>
                    {availableNamespaces.map(ns => {
                        const hidden = hiddenNamespaces.has(ns)
                        return (
                            <Chip key={ns} label={ns} size='small'
                                onClick={() => setHiddenNamespaces(prev => { const next = new Set(prev); next.has(ns) ? next.delete(ns) : next.add(ns); return next })}
                                sx={{
                                    cursor: 'pointer',
                                    bgcolor: hidden ? 'rgba(255,255,255,0.04)' : 'rgba(100,160,255,0.12)',
                                    color:   hidden ? 'rgba(255,255,255,0.25)' : '#88aadd',
                                    border:  `0.5px solid ${hidden ? 'rgba(255,255,255,0.1)' : 'rgba(100,160,255,0.3)'}`,
                                    fontSize: 11,
                                    textDecoration: hidden ? 'line-through' : 'none',
                                    transition: 'all 0.15s ease',
                                    '&:hover': { bgcolor: 'rgba(100,160,255,0.22)' },
                                }}
                            />
                        )
                    })}
                </Box>
            )}

            {/* Kind chips — bottom left */}
            <Box sx={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 0.75, flexWrap: 'wrap', maxWidth: '50%' }}>
                {(Object.values(ETopologyNodeKind) as ETopologyNodeKind[]).map(kind => {
                    const count = kindCount(kind)
                    if (!count) return null
                    const hex    = '#' + (KIND_COLOR[kind] ?? 0x888888).toString(16).padStart(6, '0')
                    const hidden = hiddenKinds.has(kind)
                    const label  = kind === ETopologyNodeKind.PERSISTENTVOLUMECLAIM ? `PVC: ${count}`
                               : kind === ETopologyNodeKind.CONTAINER ? `Ctr: ${count}`
                               : `${kind}: ${count}`
                    return (
                        <Chip key={kind} label={label} size='small' onClick={() => toggleKind(kind)} sx={{
                            cursor: 'pointer',
                            bgcolor: hidden ? 'rgba(255,255,255,0.04)' : hex + '22',
                            color:   hidden ? 'rgba(255,255,255,0.25)' : hex,
                            border:  `0.5px solid ${hidden ? 'rgba(255,255,255,0.1)' : hex + '44'}`,
                            fontSize: 11,
                            textDecoration: hidden ? 'line-through' : 'none',
                            transition: 'all 0.15s ease',
                            '&:hover': { bgcolor: hex + '33' },
                        }} />
                    )
                })}
            </Box>

            {/* Selected node info — top left, below banner when in path mode */}
            {selectedNode && (
                <Box sx={{ position: 'absolute', top: pathModeNode ? 54 : 12, left: 12, transition: 'top 0.15s ease' }}>
                    <NodeInfoPanel node={selectedNode} />
                </Box>
            )}

            {/* Context menu */}
            <Menu
                open={!!contextMenu}
                onClose={() => setContextMenu(undefined)}
                anchorReference='anchorPosition'
                anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
                slotProps={{ paper: { sx: { minWidth: 210, bgcolor: '#0f1420', border: '0.5px solid rgba(255,255,255,0.1)' } } }}
            >
                {contextMenu && <>
                    <MenuItem disabled sx={{ opacity: '1 !important' }}>
                        <Stack>
                            <Typography variant='caption' fontWeight={500} sx={{ color: '#ccc' }}>{contextMenu.node.name}</Typography>
                            <Typography variant='caption' sx={{ color: '#666' }}>{contextMenu.node.kind} · {contextMenu.node.namespace}</Typography>
                        </Stack>
                    </MenuItem>
                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    {actionsFor(contextMenu.node.kind).map((item, i) => (
                        <React.Fragment key={item.action}>
                            {item.divider && i > 0 && <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />}
                            <MenuItem onClick={() => handleAction(item.action, contextMenu.node)} sx={{ color: '#ccc', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}>
                                <ListItemIcon sx={{ color: '#88aacc' }}>{item.icon}</ListItemIcon>
                                <ListItemText>{item.label}</ListItemText>
                            </MenuItem>
                        </React.Fragment>
                    ))}
                </>}
            </Menu>
        </Box>
    )
}
