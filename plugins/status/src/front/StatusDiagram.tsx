import React from 'react'
import { Box, Chip, Stack, Typography, useTheme } from '@mui/material'
import { ReactFlow, Background, Controls, Node, Edge, MarkerType, Position } from '@xyflow/react'
import { EComponentHealth, EComponentKind, IStatusInventory } from '../common/StatusTypes'
import { countUnbrokeredConsumers } from './StatusData'

/*
    El mapa de quién produce y quién consume.

    Las dos puntas de cada arista vienen del CORE (ClusterInfo.getSubscriptions), no de los providers:
    la suscripción pasa por el core con el canal delante, así que ahí se conocen las dos. Un provider
    solo sabe cuántos suscriptores tiene, no quiénes son.

    React Flow y el motor de layout salen de los globales que publica el core, igual que en Iter: no
    añaden un byte al bundle de este plugin.
*/

/** Los colores del estado, alineados con los chips de la tabla para que no haya dos lenguajes. */
const COLOR: Record<EComponentHealth, string> = {
    [EComponentHealth.ACTIVE]: '#2e7d32',
    [EComponentHealth.IDLE]: '#616161',
    [EComponentHealth.INSTANTIATED]: '#2e7d32',
    [EComponentHealth.NOT_INSTANTIATED]: '#ed6c02',
    [EComponentHealth.PENDING_RESTART]: '#ed6c02',
    [EComponentHealth.FAILED]: '#d32f2f',
    [EComponentHealth.UNKNOWN]: '#616161'
}

interface IPosicion {
    x: number
    y: number
}

/**
 * Coloca el grafo con elk, que el core sirve con carga diferida (~1,4 MB en su propio chunk): quien no
 * abra esta vista no lo descarga nunca.
 *
 * Si falla —no carga, o el grafo es raro— se cae a dos columnas. Un diagrama mal colocado sigue diciendo
 * quién consume a quién; una pantalla en blanco, no.
 */
const colocar = async (nodos: Node[], aristas: Edge[]): Promise<Record<string, IPosicion>> => {
    const filas = (): Record<string, IPosicion> => {
        const pos: Record<string, IPosicion> = {}
        const productores = nodos.filter(n => n.data.esProductor)
        const consumidores = nodos.filter(n => !n.data.esProductor)
        productores.forEach((n, i) => { pos[n.id] = { x: i * 260, y: 0 } })
        consumidores.forEach((n, i) => { pos[n.id] = { x: i * 260, y: 220 } })
        return pos
    }

    const loadElk = (window as unknown as { __kwirth__?: { loadElk?: () => Promise<unknown> } }).__kwirth__?.loadElk
    if (!loadElk) return filas()

    try {
        const ELK = await loadElk() as new () => { layout(g: unknown): Promise<{ children?: { id: string, x: number, y: number }[] }> }
        const elk = new ELK()
        const g = await elk.layout({
            id: 'root',
            layoutOptions: {
                'elk.algorithm': 'layered',
                /*
                    De arriba abajo: los productores en la capa de arriba y los consumidores debajo.
                    Se lee como un diagrama de flujo —el dato cae— y aprovecha el ancho de la pantalla,
                    que es donde sobra sitio cuando hay muchos nodos.
                */
                'elk.direction': 'DOWN',
                'elk.spacing.nodeNode': '40',
                'elk.layered.spacing.nodeNodeBetweenLayers': '110'
            },
            children: nodos.map(n => ({ id: n.id, width: 230, height: 56 })),
            edges: aristas.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }))
        })
        const pos: Record<string, IPosicion> = {}
        for (const c of g.children ?? []) pos[c.id] = { x: c.x, y: c.y }
        return Object.keys(pos).length === nodos.length ? pos : filas()
    }
    catch {
        return filas()
    }
}

interface IDiagramProps {
    inventory: IStatusInventory
    /**
     * Componentes cuyo contador de entregas CAMBIO respecto al refresco anterior. Quien no esta aqui
     * es que no ha movido nada, o que no se puede saber.
     */
    active: Set<string>
    /** Segundos entre refrescos; 0 = manual. Marca cuánto dura el movimiento de las líneas vivas. */
    autoRefresh: number
}

interface INodoPintado {
    firma: string
    nodo: Node
}

/** Velocidad de arranque de la línea viva, la misma que la animación de serie de React Flow (10 px en 0,5 s). */
const VELOCIDAD_INICIAL = 20

const StatusDiagram: React.FC<IDiagramProps> = ({ inventory, active, autoRefresh }) => {
    const theme = useTheme()
    /*
        Cuántas fotos se han pintado. Solo importa su PARIDAD: una animación CSS no vuelve a empezar
        porque se repinte el elemento, sino cuando cambia su nombre. Alternando entre dos keyframes
        idénticos, cada refresco relanza el movimiento aunque la línea ya estuviera viva en el anterior.
    */
    const vueltas = React.useRef({ inventario: inventory, n: 0 })
    if (vueltas.current.inventario !== inventory) vueltas.current = { inventario: inventory, n: vueltas.current.n + 1 }
    const frenada = `statusFrenada${vueltas.current.n % 2}`
    // Último objeto entregado a React Flow por cada nodo, con la firma de lo que pinta (ver 'colocados').
    const nodosPintados = React.useRef(new Map<string, INodoPintado>())
    const [posiciones, setPosiciones] = React.useState<Record<string, IPosicion> | undefined>(undefined)
    /*
        Nodo seleccionado. Con muchos nodos, la pregunta deja de ser "¿qué hay?" y pasa a ser "¿y ESTO
        con quién habla?" — resaltar su vecindad es lo que hace legible un grafo denso. Mismo lenguaje
        visual que el mapa de Iter: la arista resaltada engorda, lleva sombra y sube de capa.
    */
    const [seleccionado, setSeleccionado] = React.useState<string | undefined>(undefined)

    /*
        Nodos y aristas se derivan del inventario en cada render, sin memo: el inventario solo cambia
        cuando llega una foto nueva, y son unas decenas de elementos. Un useMemo aquí escondería el
        bug de "la foto cambió y el grafo no" a cambio de nada medible.
    */
    /*
        Los colores salen del tema, no de constantes: esta pantalla se mira en claro y en oscuro, y unos
        nodos negros sobre fondo blanco se ven como un error aunque sean legibles.
    */
    const colores = {
        fondoNodo: theme.palette.background.paper,
        fondoCanal: theme.palette.mode === 'dark' ? '#12233a' : '#e8f0fb',
        texto: theme.palette.text.primary,
        bordeCanal: theme.palette.primary.main
    }

    const { nodos, aristas, canalesSueltos } = React.useMemo(() => {
        const productores = inventory.components.filter(c => c.kind === EComponentKind.PROVIDER || c.kind === EComponentKind.PLUVIDER)
        const idsProductores = new Set(productores.map(p => p.id))

        // Los canales no salen en el inventario: se deducen de las aristas, que es donde aparecen.
        const canales = [...new Set(inventory.edges.map(e => e.channelId))]

        /*
            La vecindad del nodo seleccionado: el propio nodo y todo lo que toca, en los dos sentidos.
            Lo de fuera no se esconde, se ATENUA: sigue estando y se ve que hay más grafo alrededor.
        */
        /*
            La actividad se ve en las LINEAS, no en el nodo.

            El borde del nodo llego a engordar con el acumulado de entregas, y eso decia poco: un
            provider que movio un millon el lunes y lleva dos dias parado seguia siendo el mas gordo
            del grafo. Lo que interesa es que se mueve AHORA, y eso son las lineas por las que sale.
        */
        const vecinos = new Set<string>()
        if (seleccionado) {
            vecinos.add(seleccionado)
            for (const e of inventory.edges) {
                const origen = e.providerId
                const destino = `channel:${e.channelId}`
                if (origen === seleccionado) vecinos.add(destino)
                if (destino === seleccionado) vecinos.add(origen)
            }
        }
        const apagado = (id: string): number => (!seleccionado || vecinos.has(id)) ? 1 : 0.25

        const nodos: Node[] = [
            ...productores.map(p => ({
                id: p.id,
                position: { x: 0, y: 0 },
                /*
                    SOLO lo que se pinta (o lo que usa el layout). Aquí llegaron a ir los suscriptores y la
                    salud sin que nadie los leyera, y como el nodo se rehace cuando cambia su data (ver
                    'colocados'), un contador que variaba entre fotos hacía parpadear nodos idénticos.
                */
                data: { label: p.displayName, esProductor: true },
                // Con el grafo en vertical, la arista tiene que salir por ABAJO y entrar por ARRIBA; si
                // no, React Flow las saca por los lados y los cables dan un rodeo absurdo.
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                style: {
                    background: colores.fondoNodo,
                    color: colores.texto,
                    border: `${seleccionado === p.id ? 3 : 2}px solid ${COLOR[p.health]}`,
                    borderRadius: 8,
                    width: 230,
                    fontSize: 12,
                    padding: 8,
                    opacity: apagado(p.id),
                    boxShadow: seleccionado === p.id ? `0 0 10px ${COLOR[p.health]}` : undefined
                }
            })),
            ...canales.map(id => ({
                id: `channel:${id}`,
                position: { x: 0, y: 0 },
                data: { label: id, esProductor: false },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                style: {
                    background: colores.fondoCanal,
                    color: colores.texto,
                    border: `${seleccionado === `channel:${id}` ? 3 : 2}px solid ${colores.bordeCanal}`,
                    borderRadius: 8,
                    width: 230,
                    fontSize: 12,
                    padding: 8,
                    opacity: apagado(`channel:${id}`),
                    boxShadow: seleccionado === `channel:${id}` ? `0 0 10px ${colores.bordeCanal}` : undefined
                }
            }))
        ]

        const aristas: Edge[] = inventory.edges.map(e => ({
            id: `${e.providerId}->${e.channelId}`,
            source: e.providerId,
            target: `channel:${e.channelId}`,
            /*
                Una línea en movimiento se lee como "por aquí está pasando algo ahora mismo", así que
                solo se mueve cuando eso se ha MEDIDO (ver 'viva'). Quieta, lo único que dice es que la
                suscripción existe. Cómo frena con auto-refresco está en el contenedor del ReactFlow.
            */
            ...(() => {
                const tocaAlSeleccionado = Boolean(seleccionado) && (e.providerId === seleccionado || `channel:${e.channelId}` === seleccionado)
                /*
                    Viva = el contador de su productor CAMBIO entre el refresco anterior y este. Se
                    animan todas sus salientes.

                    ⚠️ Lo que NO dice: por cual de ellas fue. Eso exigiria contar por arista, y hoy el
                    contador es del provider entero. Una linea viva significa "este componente ha
                    entregado algo y tu eres uno de sus consumidores", no "por aqui han pasado N".
                */
                const viva = active.has(e.providerId)
                const color = tocaAlSeleccionado ? '#7fd8b0' : viva ? '#5fc79a' : '#4a8'
                const ancho = tocaAlSeleccionado ? 3 : viva ? 2 : 1
                /*
                    El tamaño del marcador se compensa con el grosor de la linea.

                    React Flow dibuja la punta con markerUnits="strokeWidth", asi que su tamaño se
                    MULTIPLICA por el ancho del trazo: con la linea fina la flecha salia diminuta y al
                    resaltarla se triplicaba de golpe. Dividiendo entre el grosor, la punta mide lo
                    mismo en pantalla —unos 16 px— y lo que cambia al seleccionar es la LINEA, que es
                    justo lo que se quiere resaltar.
                */
                const punta = 16 / ancho
                return {
                    // Mismo realce que el mapa de Iter: mas grosor, sombra y por delante de las demás.
                    style: tocaAlSeleccionado
                        ? { stroke: color, strokeWidth: ancho, filter: `drop-shadow(0 0 3px ${color})`, opacity: 1 }
                        : { stroke: color, strokeWidth: ancho, opacity: seleccionado ? 0.2 : 1 },
                    animated: viva,
                    zIndex: tocaAlSeleccionado ? 1000 : viva ? 500 : 0,
                    markerEnd: { type: MarkerType.ArrowClosed, color, width: punta, height: punta }
                }
            })()
        })).filter(e => idsProductores.has(e.source))

        // Aristas cuyo productor ya no está en el inventario: se descartan, pero se cuentan para decirlo.
        const canalesSueltos = inventory.edges.length - aristas.length

        return { nodos, aristas, canalesSueltos }
        // 'active' entra en las dependencias: si no, el grafo se quedaria con el ultimo reparto de
        // animaciones y las lineas no se apagarian nunca.
    }, [inventory, active, seleccionado, colores.fondoNodo, colores.fondoCanal, colores.texto, colores.bordeCanal])

    /*
        El layout depende del INVENTARIO, no de la selección: recalcularlo al hacer clic movería los
        nodos de sitio bajo el ratón, que es de las cosas más desorientadoras que puede hacer un grafo.
        Por eso la dependencia es la lista de ids, no los nodos (que cambian de estilo al seleccionar).
    */
    const firmaGrafo = nodos.map(n => n.id).join('|') + '#' + aristas.map(a => a.id).join('|')
    React.useEffect(() => {
        let vigente = true
        colocar(nodos, aristas).then(pos => { if (vigente) setPosiciones(pos) })
        return () => { vigente = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firmaGrafo])

    // Consumidores que el core no intermedió: se dicen, no se dibujan — no se sabe quiénes son.
    const anonimos = countUnbrokeredConsumers(inventory.components)

    /*
        Sin aristas hay dos situaciones MUY distintas y decir la misma frase en las dos es mentir en
        una de ellas: que de verdad no consuma nadie, o que quien consume se haya suscrito hablando
        directamente con el provider, sin pasar por el core. En el segundo caso el dato existe —los
        providers reconocen a sus suscriptores— y lo unico que falta es saber QUIENES son, que es
        justo lo que el core no vio.
    */
    if (inventory.edges.length === 0) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant='body2' color='text.secondary'>
                    {anonimos > 0
                        ? `There is consumption right now — ${anonimos} subscriber${anonimos > 1 ? 's' : ''} — but no graph to draw: `
                          + 'they subscribed straight to the provider instead of going through the core, so nobody knows who they are. '
                          + 'The table still shows how much each producer is delivering.'
                        : 'Nothing is subscribed to anything right now, so there is no graph to draw.'}
                </Typography>
            </Box>
        )
    }

    if (!posiciones) {
        return <Box sx={{ p: 3 }}><Typography variant='body2' color='text.secondary'>Laying out the graph…</Typography></Box>
    }

    /*
        Sin esto, cada refresco era un FLASH del grafo entero aunque no hubiera cambiado nada.

        React Flow reutiliza un nodo solo si recibe el MISMO objeto; si le llega uno nuevo, le borra las
        medidas y lo esconde hasta volver a medirlo — y cada foto regenera todos los nodos. Así que el
        objeto se conserva mientras lo que se pinta de él (datos, estilo, posición) sea igual, y solo se
        rehace el nodo que de verdad ha cambiado.
    */
    const colocados = nodos.map(n => {
        const position = posiciones[n.id] ?? { x: 0, y: 0 }
        const firma = JSON.stringify([n.data, n.style, position])
        const previo = nodosPintados.current.get(n.id)
        if (previo?.firma === firma) return previo.nodo
        const nodo = { ...n, position }
        nodosPintados.current.set(n.id, { firma, nodo })
        return nodo
    })

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 1 }}>
                {/*
                    La leyenda no es adorno: sin ella, cada quien decide por su cuenta qué significa una
                    línea, y lo natural es suponer que significa tráfico.
                */}
                <Typography variant='caption' color='text.secondary'>
                    A line means <b>an active subscription</b>. A <b>moving line</b> means its producer is
                    delivering right now — but not how much goes to each consumer: that is measured per
                    component, not per line.
                    {' '}Click a node to highlight what it is connected to; click the background to clear.
                </Typography>
            </Stack>
            {(anonimos > 0 || canalesSueltos > 0) && (
                <Stack direction='row' spacing={1} sx={{ mb: 1 }}>
                    {anonimos > 0 && (
                        <Chip size='small' variant='outlined' color='default'
                            label={`${anonimos} consumer${anonimos > 1 ? 's' : ''} not shown — they subscribed without going through the core`} />
                    )}
                    {canalesSueltos > 0 && (
                        <Chip size='small' variant='outlined' label={`${canalesSueltos} subscription${canalesSueltos > 1 ? 's' : ''} to something no longer installed`} />
                    )}
                </Stack>
            )}
            {/*
                Los controles de React Flow vienen con fondo y flechas BLANCOS de su propia hoja de
                estilos, que el core carga tal cual. Sobre el tema oscuro eso es un cuadrado blanco con
                iconos invisibles. Se repintan con los colores del tema —no con valores fijos— para que
                sirvan igual en claro y en oscuro.
            */}
            <Box sx={{
                flex: 1, minHeight: 0, border: 1, borderColor: 'divider', borderRadius: 1,
                '& .react-flow__controls': { boxShadow: 'none' },
                '& .react-flow__controls-button': {
                    background: theme.palette.background.paper,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    fill: theme.palette.text.primary
                },
                '& .react-flow__controls-button:hover': { background: theme.palette.action.hover },
                '& .react-flow__controls-button svg': { fill: theme.palette.text.primary },
                '& .react-flow__attribution': { display: 'none' },
                /*
                    Con auto-refresco, la línea viva arranca a la velocidad de serie y va FRENANDO hasta
                    pararse justo cuando llega la siguiente foto: lo que se ha visto moverse es lo que
                    pasó en ese intervalo, y la línea no sigue diciendo "ahora" cuando el dato ya es viejo.
                    En manual no hay intervalo que agotar, así que se queda la animación continua de serie.

                    El recorrido sale de la curva: con ease-out cuadrática la velocidad inicial es 2·D/T,
                    así que D = VELOCIDAD_INICIAL·T/2 arranca igual que la de serie, sin tirón.
                */
                ...(autoRefresh > 0 ? {
                    [`@keyframes ${frenada}`]: {
                        from: { strokeDashoffset: VELOCIDAD_INICIAL * autoRefresh / 2 },
                        to: { strokeDashoffset: 0 }
                    },
                    '& .react-flow__edge.animated path': {
                        animation: `${frenada} ${autoRefresh}s cubic-bezier(0.5, 1, 0.89, 1) 1 forwards`
                    }
                } : {})
            }}>
                {/*
                    SOLO VISUALIZACION. React Flow es un editor de grafos, asi que de serie deja tirar
                    de un nodo y crear una arista, reengancharlas y borrarlas con Supr. Aqui eso no
                    significa nada —la topologia la deciden las suscripciones reales, no este dibujo— y
                    peor aun: sugiere que se esta cambiando algo. Se desactiva todo lo que edita.

                    Mover y hacer zoom SI se dejan: no alteran nada y son justo lo que hace falta para
                    leer un grafo con muchos nodos.
                */}
                <ReactFlow
                    nodes={colocados}
                    edges={aristas}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    nodesConnectable={false}
                    edgesReconnectable={false}
                    connectOnClick={false}
                    deleteKeyCode={null}
                    onNodeClick={(_e, nodo) => setSeleccionado(nodo.id)}
                    // Clic en el fondo = quitar la selección. Sin esto no habría forma de volver a
                    // verlo todo sin cerrar la pestaña.
                    onPaneClick={() => setSeleccionado(undefined)}
                >
                    <Background />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </Box>
        </Box>
    )
}

export { StatusDiagram }
