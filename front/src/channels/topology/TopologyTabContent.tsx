import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import {
    Box, Chip, CircularProgress, Divider, IconButton, ListItemIcon,
    ListItemText, Menu, MenuItem, Paper, Stack, Tooltip, Typography,
} from '@mui/material'
import {
    CenterFocusStrong, ContentCopy, Delete, Hub, Info,
    PlayArrow, Refresh, Stop, Terminal, ZoomIn, ZoomOut,
} from '@mui/icons-material'
import { IContentProps } from '../IChannel'
import {
    ETopologyNodeKind, ETopologyNodeStatus,
    ITopologyData, ITopologyNode,
} from './TopologyData'
import { ITopologyConfig } from './TopologyConfig'
import {
    EInstanceMessageAction, EInstanceMessageFlow,
    EInstanceMessageType,
} from '@kwirthmagnify/kwirth-common'

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

// ── Context menu ──────────────────────────────────────────────────────────────

interface ICtxAction { icon: React.ReactNode; label: string; action: string; divider?: boolean }

const COMMON_ACTIONS: ICtxAction[] = [
    { icon: <Info fontSize='small'/>,        label: 'View details',   action: 'details' },
    { icon: <ContentCopy fontSize='small'/>, label: 'Copy name',      action: 'copy-name', divider: true },
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
        { icon: <Refresh fontSize='small'/>,   label: 'Restart rollout', action: 'restart', divider: true },
    ],
    [ETopologyNodeKind.SERVICE]: [
        { icon: <Hub fontSize='small'/>,       label: 'Show endpoints',  action: 'endpoints', divider: true },
    ],
    [ETopologyNodeKind.INGRESS]: [
        { icon: <Info fontSize='small'/>,      label: 'Show rules',      action: 'ingress-rules', divider: true },
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateCamera(cam: THREE.PerspectiveCamera, sph: { theta: number; phi: number; radius: number }) {
    cam.position.set(
        sph.radius * Math.sin(sph.phi) * Math.sin(sph.theta),
        sph.radius * Math.cos(sph.phi),
        sph.radius * Math.sin(sph.phi) * Math.cos(sph.theta),
    )
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()
}

function geometryFor(kind: ETopologyNodeKind): THREE.BufferGeometry {
    const s = NODE_SIZE
    switch (kind) {
        case ETopologyNodeKind.POD:                    return new THREE.SphereGeometry(s, 16, 12)
        case ETopologyNodeKind.SERVICE:                return new THREE.CylinderGeometry(s, s, s * 1.6, 6)
        case ETopologyNodeKind.INGRESS:                return new THREE.CylinderGeometry(s * 1.3, s * 0.7, s * 1.2, 4)
        case ETopologyNodeKind.DEPLOYMENT:
        case ETopologyNodeKind.STATEFULSET:
        case ETopologyNodeKind.DAEMONSET:              return new THREE.BoxGeometry(s * 1.8, s * 1.8, s * 1.8)
        case ETopologyNodeKind.JOB:
        case ETopologyNodeKind.CRONJOB:                return new THREE.TetrahedronGeometry(s * 1.2)
        case ETopologyNodeKind.PERSISTENTVOLUMECLAIM:  return new THREE.CylinderGeometry(s * 0.6, s * 1.0, s * 0.8, 8)
        default:                                       return new THREE.OctahedronGeometry(s)
    }
}

function makeLabel(text: string, fontSize: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width  = 256
    canvas.height = 40
    const ctx = canvas.getContext('2d')!
    ctx.font      = `bold ${fontSize * 2}px sans-serif`
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
    // Position label ABOVE the mesh — offset in Y
    sprite.position.set(0, NODE_SIZE * 1.8, 0)
    return sprite
}

// Build an edge line between two nodes
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

// ── Main component ────────────────────────────────────────────────────────────

export const TopologyTabContent: React.FC<IContentProps> = ({ channelObject }) => {
    const mountRef     = useRef<HTMLDivElement>(null)
    const rendererRef  = useRef<THREE.WebGLRenderer>()
    const sceneRef     = useRef<THREE.Scene>()
    const cameraRef    = useRef<THREE.PerspectiveCamera>()
    const meshMapRef   = useRef<Map<string, THREE.Mesh>>(new Map())
    const edgeLinesRef = useRef<THREE.Line[]>([])
    const hlLinesRef   = useRef<THREE.Line[]>([])   // highlighted edge lines
    const animRef      = useRef<number>()
    const isDragging   = useRef(false)
    const prevMouse    = useRef({ x: 0, y: 0 })
    const spherical    = useRef({ theta: 0.4, phi: 1.1, radius: 700 })
    const selectedRef  = useRef<string | undefined>()

    const [selectedNode,  setSelectedNode]  = useState<ITopologyNode | undefined>()
    const [contextMenu,   setContextMenu]   = useState<{ x: number; y: number; node: ITopologyNode } | undefined>()
    const [hiddenKinds,   setHiddenKinds]   = useState<Set<ETopologyNodeKind>>(new Set())
    const [, forceUpdate] = useState(0)

    const topologyData: ITopologyData   = channelObject.data
    const topologyCfg:  ITopologyConfig = channelObject.config

    // Visible nodes (after kind filter)
    const visibleNodes = React.useMemo(
        () => Array.from(topologyData.nodes.values()).filter(n => !hiddenKinds.has(n.kind)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [topologyData.lastUpdated, hiddenKinds]
    )

    // ── Three.js scene init ───────────────────────────────────────────────────
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
        dir.position.set(200, 500, 300)
        dir.castShadow = true
        scene.add(dir)
        const point = new THREE.PointLight(0x4488ff, 0.4, 1400)
        point.position.set(-300, 150, 200)
        scene.add(point)

        const grid = new THREE.GridHelper(1600, 24, 0x1a2230, 0x1a2230)
        grid.position.y = -200
        scene.add(grid)

        // Layer label sprites
        const layers = [
            { z: 300,  label: 'Ingress' },
            { z: 150,  label: 'Services' },
            { z: 0,    label: 'Controllers' },
            { z: -150, label: 'Pods' },
            { z: -300, label: 'PVCs' },
        ]
        layers.forEach(({ z, label }) => {
            const cv = document.createElement('canvas')
            cv.width = 320; cv.height = 48
            const c = cv.getContext('2d')!
            c.fillStyle = 'rgba(255,255,255,0.04)'
            c.fillRect(0, 0, 320, 48)
            c.fillStyle = '#6688aa'
            c.font = '20px sans-serif'
            c.fillText(label, 10, 32)
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.6 }))
            sp.position.set(-700, 0, z)
            sp.scale.set(160, 24, 1)
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
            // Animate highlight lines
            hlLinesRef.current.forEach((line, i) => {
                const mat = line.material as THREE.LineBasicMaterial
                mat.opacity = 0.5 + 0.4 * Math.sin(Date.now() * 0.004 + i * 0.5)
            })
            renderer.render(scene, camera)
        }
        animate()

        const ro = new ResizeObserver(() => {
            const nw = el.clientWidth, nh = el.clientHeight
            renderer.setSize(nw, nh)
            camera.aspect = nw / nh
            camera.updateProjectionMatrix()
        })
        ro.observe(el)

        return () => {
            cancelAnimationFrame(animRef.current!)
            ro.disconnect()
            renderer.dispose()
            if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Rebuild meshes when data or visibility changes ────────────────────────
    useEffect(() => {
        const scene = sceneRef.current
        if (!scene) return

        meshMapRef.current.forEach(m => scene.remove(m))
        meshMapRef.current.clear()
        edgeLinesRef.current.forEach(l => scene.remove(l))
        edgeLinesRef.current = []
        hlLinesRef.current.forEach(l => scene.remove(l))
        hlLinesRef.current = []

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
            mesh.userData   = { uid: node.uid }
            mesh.add(makeLabel(node.name, topologyCfg.labelSize))
            scene.add(mesh)
            meshMapRef.current.set(node.uid, mesh)
        })

        // Draw normal edges (dimmed)
        visibleNodes.forEach(node => {
            if (!node.edges) return
            node.edges.forEach(edge => {
                if (!nodeSet.has(edge.targetUid)) return
                const target = topologyData.nodes.get(edge.targetUid)
                if (!target) return
                const line = buildEdgeLine(node, target, 0x3366aa, 0.5)
                scene.add(line)
                edgeLinesRef.current.push(line)
            })
        })

        // Rebuild highlight lines for current selection
        rebuildHighlightLines(scene, selectedRef.current, visibleNodes, nodeSet)

        forceUpdate(n => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topologyData.lastUpdated, topologyCfg.showOnlyRunning, topologyCfg.labelSize, topologyCfg.nodeSpacingFactor, hiddenKinds])

    // ── Highlight lines helper ────────────────────────────────────────────────
    const rebuildHighlightLines = useCallback((
        scene: THREE.Scene,
        selectedUid: string | undefined,
        nodes: ITopologyNode[],
        nodeSet: Set<string>
    ) => {
        hlLinesRef.current.forEach(l => scene.remove(l))
        hlLinesRef.current = []
        if (!selectedUid) return

        const selected = topologyData.nodes.get(selectedUid)
        if (!selected) return

        const highlightColor = 0xffdd44

        // Edges going OUT from selected node
        selected.edges?.forEach(edge => {
            if (!nodeSet.has(edge.targetUid)) return
            const target = topologyData.nodes.get(edge.targetUid)
            if (!target) return
            const line = buildEdgeLine(selected, target, highlightColor, 0.9)
            scene.add(line)
            hlLinesRef.current.push(line)
        })

        // Edges coming IN to selected node (other nodes pointing at selected)
        nodes.forEach(node => {
            if (node.uid === selectedUid) return
            node.edges?.forEach(edge => {
                if (edge.targetUid !== selectedUid) return
                const line = buildEdgeLine(node, selected, highlightColor, 0.9)
                scene.add(line)
                hlLinesRef.current.push(line)
            })
        })

        // Parent relationship: highlight edge to owner controller
        if (selected.ownerUids) {
            selected.ownerUids.forEach(ownerUid => {
                if (!nodeSet.has(ownerUid)) return
                const owner = topologyData.nodes.get(ownerUid)
                if (!owner) return
                const line = buildEdgeLine(owner, selected, 0x66ffaa, 0.85)
                scene.add(line)
                hlLinesRef.current.push(line)
            })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topologyData.nodes])

    // ── Mouse / touch controls ────────────────────────────────────────────────
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
        spherical.current.phi    = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.current.phi + dy * 0.005))
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }, [])

    const handleWheel = useCallback((e: React.WheelEvent) => {
        spherical.current.radius = Math.max(150, Math.min(2500, spherical.current.radius + e.deltaY * 0.6))
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }, [])

    const pickNode = useCallback((e: React.MouseEvent): ITopologyNode | undefined => {
        const renderer = rendererRef.current
        const camera   = cameraRef.current
        const el       = mountRef.current
        if (!renderer || !camera || !el) return undefined
        const rect  = el.getBoundingClientRect()
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width)  * 2 - 1,
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
        selectedRef.current = node?.uid
        setSelectedNode(node)

        // Rebuild highlight lines
        const scene = sceneRef.current
        if (scene) {
            const nodeSet = new Set(visibleNodes.map(n => n.uid))
            rebuildHighlightLines(scene, node?.uid, visibleNodes, nodeSet)
        }
    }, [pickNode, visibleNodes, rebuildHighlightLines])

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
                channel: 'topology',
                instance: channelObject.instanceId,
                type:   EInstanceMessageType.DATA,
                action: EInstanceMessageAction.NONE,
                flow:   EInstanceMessageFlow.REQUEST,
                topoAction,
                kind:      node.kind,
                name:      node.name,
                namespace: node.namespace,
                uid:       node.uid,
                ...extra,
            }))
        }

        switch (action) {
            case 'details':
                selectedRef.current = node.uid
                setSelectedNode(node)
                break
            case 'copy-name':
                navigator.clipboard.writeText(node.name)
                break
            case 'logs':
                channelObject.createTab?.({ clusterName: channelObject.clusterName, namespace: node.namespace, group: '', pod: node.name, container: '' } as any, true, { channelId: 'log' })
                break
            case 'shell':
                channelObject.createTab?.({ clusterName: channelObject.clusterName, namespace: node.namespace, group: '', pod: node.name, container: '' } as any, true, { channelId: 'ops' })
                break
            case 'scale-up':
                sendCmd('SCALE', { replicas: (node.replicas ?? 0) + 1 })
                break
            case 'scale-zero':
                sendCmd('SCALE', { replicas: 0 })
                break
            case 'restart':
                sendCmd('RESTART')
                break
            case 'delete-pod':
                sendCmd('DELETE_POD')
                break
            default:
                channelObject.notify?.('topology', 'info' as any, `${action} on ${node.name}`)
        }
    }, [channelObject])

    // ── Camera controls ───────────────────────────────────────────────────────
    const resetCamera = () => {
        spherical.current = { theta: 0.4, phi: 1.1, radius: 700 }
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }
    const zoomIn = () => {
        spherical.current.radius = Math.max(150, spherical.current.radius - 100)
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }
    const zoomOut = () => {
        spherical.current.radius = Math.min(2500, spherical.current.radius + 100)
        if (cameraRef.current) updateCamera(cameraRef.current, spherical.current)
    }

    // ── Kind toggle chips ─────────────────────────────────────────────────────
    const toggleKind = useCallback((kind: ETopologyNodeKind) => {
        setHiddenKinds(prev => {
            const next = new Set(prev)
            if (next.has(kind)) next.delete(kind)
            else next.add(kind)
            return next
        })
    }, [])

    const kindCount = (kind: ETopologyNodeKind) =>
        Array.from(topologyData.nodes.values()).filter(n => n.kind === kind).length

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

            {/* Loading overlay */}
            {topologyData.loading && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <Stack alignItems='center' spacing={1}>
                        <CircularProgress size={32} sx={{ color: '#378add' }} />
                        <Typography variant='caption' sx={{ color: '#889' }}>Loading cluster topology…</Typography>
                    </Stack>
                </Box>
            )}

            {/* Empty state */}
            {!topologyData.loading && topologyData.nodes.size === 0 && (
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <Typography variant='body2' sx={{ color: '#445' }}>No resources found. Start the channel to load the cluster topology.</Typography>
                </Box>
            )}

            {/* Error banner */}
            {topologyData.error && (
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bgcolor: 'rgba(180,0,0,0.8)', p: '4px 12px' }}>
                    <Typography variant='caption' sx={{ color: '#fff' }}>{topologyData.error}</Typography>
                </Box>
            )}

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

            {/* Kind toggle chips — bottom left */}
            <Box sx={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 0.75, flexWrap: 'wrap', maxWidth: '70%' }}>
                {(Object.values(ETopologyNodeKind) as ETopologyNodeKind[]).map(kind => {
                    const count = kindCount(kind)
                    if (!count) return null
                    const hex     = '#' + (KIND_COLOR[kind] ?? 0x888888).toString(16).padStart(6, '0')
                    const hidden  = hiddenKinds.has(kind)
                    const label   = kind === ETopologyNodeKind.PERSISTENTVOLUMECLAIM ? `PVC: ${count}` : `${kind}: ${count}`
                    return (
                        <Chip
                            key={kind}
                            label={label}
                            size='small'
                            onClick={() => toggleKind(kind)}
                            sx={{
                                cursor: 'pointer',
                                bgcolor: hidden ? 'rgba(255,255,255,0.04)' : hex + '22',
                                color:   hidden ? 'rgba(255,255,255,0.25)' : hex,
                                border:  `0.5px solid ${hidden ? 'rgba(255,255,255,0.1)' : hex + '44'}`,
                                fontSize: 11,
                                textDecoration: hidden ? 'line-through' : 'none',
                                transition: 'all 0.15s ease',
                                '&:hover': { bgcolor: hex + '33' },
                            }}
                        />
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
                            <MenuItem
                                onClick={() => handleAction(item.action, contextMenu.node)}
                                sx={{ color: '#ccc', '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
                            >
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
