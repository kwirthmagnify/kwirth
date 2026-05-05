import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { IContentProps } from '../IChannel'
import {
    ETopologyNodeKind, ETopologyNodeStatus,
    ITopologyData, ITopologyNode,
} from './TopologyData'
import { ITopologyConfig } from './TopologyConfig'
import {
    EInstanceConfigView,
    EInstanceMessageAction, EInstanceMessageFlow,
    EInstanceMessageType,
} from '@kwirthmagnify/kwirth-common'
import { ELogSortOrder, ILogConfig, ILogInstanceConfig } from '../log/LogConfig'

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
    [ETopologyNodeKind.POD]:                   1,
    [ETopologyNodeKind.REPLICASET]:            2,
    [ETopologyNodeKind.JOB]:                   2,
    [ETopologyNodeKind.CRONJOB]:               2,
    [ETopologyNodeKind.DEPLOYMENT]:            3,
    [ETopologyNodeKind.STATEFULSET]:           3,
    [ETopologyNodeKind.DAEMONSET]:             3,
    [ETopologyNodeKind.SERVICE]:               4,
    [ETopologyNodeKind.INGRESS]:               5,
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface ICtxAction { icon: React.ReactNode; label: string; action: string; divider?: boolean }

const COMMON_ACTIONS: ICtxAction[] = [
    { icon: <Timeline fontSize='small'/>,    label: 'View path',    action: 'view-path', divider: true },
    { icon: <Info fontSize='small'/>,        label: 'View details', action: 'details' },
    { icon: <ContentCopy fontSize='small'/>, label: 'Copy name',    action: 'copy-name', divider: true },
]

const KIND_ACTIONS: Partial<Record<ETopologyNodeKind, ICtxAction[]>> = {
    [ETopologyNodeKind.POD]: [
        { icon: <Terminal fontSize='small'/>,  label: 'Open shell',      action: 'shell' },
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
    canvas.width = 256; canvas.height = 40
    const ctx = canvas.getContext('2d')!
    ctx.font = `bold ${fontSize * 2}px sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'
    ctx.lineWidth = 3
    ctx.textAlign = 'center'
    const display = text.length > 22 ? text.slice(0, 20) + '…' : text
    ctx.strokeText(display, 128, 30)
    ctx.fillText(display, 128, 30)
    const tex = new THREE.CanvasTexture(canvas)
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(72, 14, 1)
    sprite.position.set(0, NODE_SIZE * 1.8, 0)
    return sprite
}

function buildEdgeLine(from: ITopologyNode, to: ITopologyNode, color: number, opacity: number): THREE.Line {
    const pts = [
        new THREE.Vector3(from.x, from.y, from.z),
        new THREE.Vector3(to.x,   to.y,   to.z),
    ]
    return new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, opacity, transparent: true, linewidth: 2 })
    )
}

// Thicker highlighted path line — uses multiple offset lines to simulate width
function buildPathLine(from: ITopologyNode, to: ITopologyNode, color: number, opacity: number): THREE.Group {
    const group = new THREE.Group()
    const offsets = [
        [0, 0, 0], [1.2, 0, 0], [-1.2, 0, 0], [0, 1.2, 0], [0, -1.2, 0],
    ]
    offsets.forEach(([dx, dy, dz]) => {
        const pts = [
            new THREE.Vector3(from.x + dx, from.y + dy, from.z + dz),
            new THREE.Vector3(to.x   + dx, to.y   + dy, to.z   + dz),
        ]
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
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
    const involved = new Set<string>()
    const edges: IHighlightEdge[] = []
    const queue: string[] = [rootUid]
    involved.add(rootUid)

    // Precompute reverse maps: targetUid → list of nodes whose .edges point to it
    const incomingEdges = new Map<string, ITopologyNode[]>()
    // ownerUid → list of pods/resources owned
    const ownedBy = new Map<string, ITopologyNode[]>()

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

    while (queue.length > 0) {
        const uid = queue.shift()!
        const node = allNodes.get(uid)
        if (!node || !nodeSet.has(uid)) continue

        const isIngress = node.kind === ETopologyNodeKind.INGRESS

        // ── UP: follow node.edges (e.g. Deployment → Service → Ingress) ───────
        if (!isIngress) {
            node.edges?.forEach(edge => {
                if (!nodeSet.has(edge.targetUid)) return
                const target = allNodes.get(edge.targetUid)
                if (!target) return
                edges.push({ from: node, to: target, color: 0xffdd44 })
                if (!involved.has(target.uid)) {
                    involved.add(target.uid)
                    queue.push(target.uid)
                }
            })

            // UP via ownerUids: pod → replicaset/deployment
            node.ownerUids?.forEach(oid => {
                if (!nodeSet.has(oid)) return
                const owner = allNodes.get(oid)
                if (!owner) return
                edges.push({ from: owner, to: node, color: 0x66ffaa })
                if (!involved.has(owner.uid)) {
                    involved.add(owner.uid)
                    queue.push(owner.uid)
                }
            })
        }

        // ── DOWN: follow reverse edges (nodes that point at this node) ─────────
        incomingEdges.get(uid)?.forEach(src => {
            if (!nodeSet.has(src.uid)) return
            edges.push({ from: src, to: node, color: 0xffdd44 })
            if (!involved.has(src.uid)) {
                involved.add(src.uid)
                queue.push(src.uid)
            }
        })

        // ── DOWN via ownedBy: deployment → pods
        ownedBy.get(uid)?.forEach(child => {
            if (!nodeSet.has(child.uid)) return
            edges.push({ from: node, to: child, color: 0x66ffaa })
            if (!involved.has(child.uid)) {
                involved.add(child.uid)
                queue.push(child.uid)
            }
        })

        // ── DOWN: pod → PVCs it mounts (via pod.edges which now include PVC targets)
        // Already covered by node.edges traversal above — PVC edges are in pod.edges.
        // But if current node IS a PVC, find pods that mount it (reverse of pod.edges → pvc)
        if (node.kind === ETopologyNodeKind.PERSISTENTVOLUMECLAIM) {
            allNodes.forEach(n => {
                if (!nodeSet.has(n.uid) || n.kind !== ETopologyNodeKind.POD) return
                const mountsThis = n.edges?.some(e => e.targetUid === uid)
                if (!mountsThis) return
                edges.push({ from: n, to: node, color: 0xe06b6b })
                if (!involved.has(n.uid)) {
                    involved.add(n.uid)
                    queue.push(n.uid)
                }
            })
        }
    }   // end while

    return { involvedUids: involved, edges }
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
    const prevMouse    = useRef({ x: 0, y: 0 })
    const spherical    = useRef({ theta: 0.4, phi: 1.1, radius: 700, tx: 0, ty: 0, tz: 0 })
    const selectedRef  = useRef<string | undefined>()
    const pathModeRef  = useRef<string | undefined>()   // uid of node in path mode

    const [selectedNode,  setSelectedNode]  = useState<ITopologyNode | undefined>()
    const [contextMenu,   setContextMenu]   = useState<{ x: number; y: number; node: ITopologyNode } | undefined>()
    const [hiddenKinds,   setHiddenKinds]   = useState<Set<ETopologyNodeKind>>(new Set())
    const [searchQuery,   setSearchQuery]   = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [pathModeNode,  setPathModeNode]  = useState<ITopologyNode | undefined>()
    const [, forceUpdate] = useState(0)

    const topologyData: ITopologyData   = channelObject.data
    const topologyCfg:  ITopologyConfig = channelObject.config

    const visibleNodes = React.useMemo(
        () => Array.from(topologyData.nodes.values()).filter(n => !hiddenKinds.has(n.kind)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [topologyData.lastUpdated, hiddenKinds]
    )

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
            { z: 0, label: 'Controllers' }, { z: -150, label: 'Pods' }, { z: -300, label: 'PVCs' },
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

        // Normal (dim) edges
        visibleNodes.forEach(node => {
            node.edges?.forEach(edge => {
                if (!nodeSet.has(edge.targetUid)) return
                const target = topologyData.nodes.get(edge.targetUid)
                if (!target) return
                const line = buildEdgeLine(node, target, 0x2255aa, 0.45)
                scene.add(line); edgeLinesRef.current.push(line)
            })
        })

        // ownerUid edges (dim)
        visibleNodes.forEach(node => {
            node.ownerUids?.forEach(oid => {
                if (!nodeSet.has(oid)) return
                const owner = topologyData.nodes.get(oid)
                if (!owner) return
                const line = buildEdgeLine(owner, node, 0x224422, 0.3)
                scene.add(line); edgeLinesRef.current.push(line)
            })
        })

        rebuildHighlightLines(scene, selectedRef.current, visibleNodes, nodeSet)
        forceUpdate(n => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topologyData.lastUpdated, topologyCfg.showOnlyRunning, topologyCfg.labelSize, topologyCfg.nodeSpacingFactor, hiddenKinds])

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

        pathModeRef.current = node.uid
        setPathModeNode(node)

        const nodeSet = new Set(visibleNodes.map(n => n.uid))
        const { involvedUids, edges } = collectSubgraph(node.uid, topologyData.nodes, nodeSet)

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
            const involved = Array.from(involvedUids).map(u => topologyData.nodes.get(u)).filter(Boolean) as ITopologyNode[]
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

        pathModeRef.current = undefined
        setPathModeNode(undefined)

        // Restore all meshes
        meshMapRef.current.forEach((mesh, uid) => {
            const mat = mesh.material as THREE.MeshPhongMaterial
            mat.transparent = false
            mat.opacity     = 1.0
            mat.emissiveIntensity = selectedRef.current === uid ? 0.5 : 0.15
            mat.needsUpdate = true
        })

        // Restore normal edge lines
        edgeLinesRef.current.forEach(l => {
            const m = l.material as THREE.LineBasicMaterial
            m.opacity = 0.45; m.needsUpdate = true
        })

        // Remove thick path lines
        pathGroupRef.current.forEach(g => scene.remove(g))
        pathGroupRef.current = []
    }, [])
    const focusNode = useCallback((node: ITopologyNode) => {
        const scene = sceneRef.current
        const camera = cameraRef.current
        if (!scene || !camera) return

        selectedRef.current = node.uid
        setSelectedNode(node)

        const nodeSet = new Set(visibleNodes.map(n => n.uid))
        rebuildHighlightLines(scene, node.uid, visibleNodes, nodeSet)

        // Collect all involved nodes to compute bounding box for zoom
        const { involvedUids } = collectSubgraph(node.uid, topologyData.nodes, nodeSet)
        const involvedNodes = Array.from(involvedUids)
            .map(uid => topologyData.nodes.get(uid))
            .filter(Boolean) as ITopologyNode[]

        if (involvedNodes.length === 0) return

        // Compute centroid of involved nodes
        const cx = involvedNodes.reduce((s, n) => s + n.x, 0) / involvedNodes.length
        const cy = involvedNodes.reduce((s, n) => s + n.y, 0) / involvedNodes.length
        const cz = involvedNodes.reduce((s, n) => s + n.z, 0) / involvedNodes.length

        // Compute bounding sphere radius
        let maxDist = 100
        involvedNodes.forEach(n => {
            const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2 + (n.z - cz) ** 2)
            if (d > maxDist) maxDist = d
        })
        const targetRadius = Math.max(250, maxDist * 2.2)

        animateCameraTo(camera, spherical, new THREE.Vector3(cx, cy, cz), targetRadius, spherical.current.theta, spherical.current.phi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleNodes, rebuildHighlightLines, topologyData.nodes])

    // ── Mouse controls ────────────────────────────────────────────────────────
    const handleMouseDown  = useCallback((e: React.MouseEvent) => {
        if (e.button === 0) { isDragging.current = true; prevMouse.current = { x: e.clientX, y: e.clientY } }
    }, [])
    const handleMouseUp    = useCallback(() => { isDragging.current = false }, [])
    const handleMouseLeave = useCallback(() => { isDragging.current = false }, [])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current) return
        const dx = e.clientX - prevMouse.current.x
        const dy = e.clientY - prevMouse.current.y
        prevMouse.current = { x: e.clientX, y: e.clientY }
        spherical.current.theta -= dx * 0.005
        spherical.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.current.phi + dy * 0.005))
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
            // Click on empty space: deselect
            selectedRef.current = undefined
            setSelectedNode(undefined)
            const scene = sceneRef.current
            if (scene) { hlLinesRef.current.forEach(l => scene.remove(l)); hlLinesRef.current = [] }
            return
        }
        focusNode(node)
    }, [pickNode, focusNode])

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        const node = pickNode(e)
        if (node) setContextMenu({ x: e.clientX, y: e.clientY, node })
    }, [pickNode])

    // ── Context menu actions ──────────────────────────────────────────────────
    const handleAction = useCallback((action: string, node: ITopologyNode) => {
        setContextMenu(undefined)
        const ws = channelObject.webSocket

        const sendCmd = (topoAction: string, extra: Record<string, any> = {}) => {
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
            case 'view-path':  applyPathMode(node); break
            case 'details':   selectedRef.current = node.uid; setSelectedNode(node); break
            case 'copy-name': navigator.clipboard.writeText(node.name); break
            case 'logs':      
                // let logConfig:ILogConfig = {
                //     startDiagnostics: false,
                //     follow: true,
                //     showNames: false,
                //     maxMessages: 5000,
                //     maxPerPodMessages: 5000,
                //     sortOrder: ELogSortOrder.TIME
                // }
                // let logInstanceConfig:ILogInstanceConfig = {
                //     previous: false,
                //     timestamp: false,
                //     fromStart: false
                // }
                // let logSettings ={
                //     config: logConfig,
                //     instanceConfig: logInstanceConfig
                // }
                channelObject.createTab?.({clusterName: channelObject.clusterName, namespaces: [node.namespace], controllers: [], pods: [node.name], containers: [], channelId: 'log', view: EInstanceConfigView.POD, name: node.name}, true, undefined)
                break
            case 'shell':     channelObject.createTab?.({ clusterName: channelObject.clusterName, namespaces: [node.namespace], controllers: [], pods: [node.name], containers: [], channelId: 'ops', view: EInstanceConfigView.POD, name: node.name }, true, {}); break
            case 'scale-up':  sendCmd('SCALE', { replicas: (node.replicas ?? 0) + 1 }); break
            case 'scale-zero':sendCmd('SCALE', { replicas: 0 }); break
            case 'restart':   sendCmd('RESTART'); break
            case 'delete-pod':sendCmd('DELETE_POD'); break
            default:          channelObject.notify?.('topology', 'info' as any, `${action} on ${node.name}`)
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
        focusNode(node)
    }, [focusNode])

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <Box sx={{ width: '100%', height: '100%', position: 'relative', bgcolor: '#0a0c14', overflow: 'hidden' }}>

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

            {/* ── Path mode banner ── */}
            {pathModeNode && (
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    bgcolor: 'rgba(30,18,60,0.94)', borderBottom: '1px solid rgba(180,140,255,0.3)',
                    p: '5px 14px', display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 6,
                }}>
                    <Timeline sx={{ color: '#bb88ff', fontSize: 18 }} />
                    <Typography variant='caption' sx={{ color: '#cc99ff', flex: 1 }}>
                        Path view: <strong>{pathModeNode.name}</strong> ({pathModeNode.kind})
                    </Typography>
                    <Chip
                        label='Exit path view'
                        size='small'
                        onClick={exitPathMode}
                        sx={{
                            cursor: 'pointer', fontSize: 11,
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

            {/* Kind chips — bottom left */}
            <Box sx={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 0.75, flexWrap: 'wrap', maxWidth: '70%' }}>
                {(Object.values(ETopologyNodeKind) as ETopologyNodeKind[]).map(kind => {
                    const count = kindCount(kind)
                    if (!count) return null
                    const hex    = '#' + (KIND_COLOR[kind] ?? 0x888888).toString(16).padStart(6, '0')
                    const hidden = hiddenKinds.has(kind)
                    const label  = kind === ETopologyNodeKind.PERSISTENTVOLUMECLAIM ? `PVC: ${count}` : `${kind}: ${count}`
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

            {/* Selected node info — top left */}
            {selectedNode && (
                <Box sx={{ position: 'absolute', top: 12, left: 12 }}>
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
