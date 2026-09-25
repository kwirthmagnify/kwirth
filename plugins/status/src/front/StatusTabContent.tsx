import React from 'react'
import { Box, Chip, IconButton, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material'
import { Refresh, ViewList, Hub } from '@kwirthmagnify/kwirth-common-front/icons'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { EComponentHealth, EComponentKind, EStatusCommand, IStatusComponent } from '../common/StatusTypes'
import { IStatusData } from './StatusData'
import { StatusDiagram } from './StatusDiagram'

/*
    Cómo se dice cada estado, y de qué color.

    El texto va aquí y no en el back a propósito: el back informa de HECHOS (started, router montado) y el
    front decide cómo contarlos. Así el día que haya que cambiar una palabra no hay que republicar el back
    ni reiniciar el servidor.
*/
const HEALTH_LABEL: Record<EComponentHealth, { label: string, color: 'success' | 'warning' | 'error' | 'default' }> = {
    [EComponentHealth.ACTIVE]: { label: 'Active', color: 'success' },
    // Ocioso NO es un error, es información: funciona, pero no le sirve a nadie. De ahí 'default' y no
    // 'warning' — quien mire tiene que poder distinguir "hay que arreglar esto" de "esto sobra".
    [EComponentHealth.IDLE]: { label: 'Idle', color: 'default' },
    [EComponentHealth.INSTANTIATED]: { label: 'Running', color: 'success' },
    [EComponentHealth.NOT_INSTANTIATED]: { label: 'Not started', color: 'warning' },
    [EComponentHealth.PENDING_RESTART]: { label: 'Needs restart', color: 'warning' },
    [EComponentHealth.FAILED]: { label: 'Failed', color: 'error' },
    [EComponentHealth.UNKNOWN]: { label: 'Not reported', color: 'default' }
}

const KIND_LABEL: Record<EComponentKind, string> = {
    [EComponentKind.PROVIDER]: 'Provider',
    [EComponentKind.PLUVIDER]: 'Pluvider',
    [EComponentKind.SENDER]: 'Sender',
    [EComponentKind.WEBHOOK]: 'Webhook',
    [EComponentKind.CHANNEL]: 'Channel'
}

interface IEmptyStateProps {
    title: string
    detail: string
}

/*
    Mismo patron que situs, iter y asteroids: decir solo "not started" deja al usuario sin saber que lo
    que falta es darle a Start. El detalle lleva SIEMPRE la accion.

    ⚠️ La altura se MIDE, no se hereda. El contenedor que el core da al contenido de una pestaña no
    tiene altura definida, asi que 'height: 100%' no resuelve a nada y el mensaje se quedaba pegado
    arriba en vez de centrado. Se mide donde empieza la caja y se le da el resto del viewport — lo
    mismo que hace la tabla, y que hacen los demas canales en su estado vacio.
*/
const EmptyState: React.FC<IEmptyStateProps> = ({ title, detail }) => {
    const ref = React.useRef<HTMLDivElement | null>(null)
    const [top, setTop] = React.useState(0)
    React.useEffect(() => {
        if (ref.current) setTop(ref.current.getBoundingClientRect().top)
    })
    return (
        <Stack ref={ref} alignItems='center' justifyContent='center' spacing={1}
            sx={{ flex: 1, width: '100%', minHeight: `calc(100vh - ${top}px - 8px)`, px: 4, textAlign: 'center' }}>
            <Typography variant='h6' color='text.secondary'>{title}</Typography>
            <Typography variant='body2' color='text.secondary'>{detail}</Typography>
        </Stack>
    )
}

const StatusTabContent: React.FC<IContentProps> = (props) => {
    const data: IStatusData = props.channelObject.data
    /*
        El estado que debe sobrevivir a cambiar de pestaña se guarda en 'data', que es del canal. Como
        mutarlo no dispara un render por si solo, se fuerza uno a mano — es el mismo patron que usan
        los demas canales del proyecto.
    */
    const [, forzarRender] = React.useState(0)
    const repintar = () => forzarRender(n => n + 1)
    const filter = data.filter
    const setFilter = (v: string) => { data.filter = v; repintar() }
    /*
        La altura del area que scrollea se calcula, no se hereda.

        El contenedor que el core da al contenido de una pestaña no tiene altura definida, asi que un
        'height: 100%' no resuelve a nada y la tabla crece hasta salirse de la pantalla sin barra. Es el
        mismo patron que usan los demas canales: se mide donde EMPIEZA la caja y se le da el resto del
        viewport. Se remide en cada render porque la barra de herramientas de arriba cambia de alto.
    */
    /*
        Tabla o diagrama. Arranca en TABLA a proposito: responder "¿esta todo bien?" es lo que se hace
        diez veces al dia, y el grafo es para cuando ya sabes que algo pasa y quieres ver a quien
        arrastra. Ademas el diagrama descarga el motor de layout, y quien no lo abra no lo paga.
    */
    const vista = data.view
    const setVista = (v: 'table' | 'graph') => { data.view = v; repintar() }
    const boxRef = React.useRef<HTMLDivElement | null>(null)
    const [boxTop, setBoxTop] = React.useState(0)
    React.useEffect(() => {
        if (boxRef.current) setBoxTop(boxRef.current.getBoundingClientRect().top)
    })

    /*
        Pedir otra foto. Es lo ÚNICO que hace trabajar a este canal: no hay refresco automático, porque
        un temporizador repitiendo esto sería recolección continua con otro nombre.

        ⚠️ El accessKey va en el propio comando: sin él, el core lo descarta antes de que llegue al
        plugin y lo único que se ve es que no pasa nada.
    */
    const refresh = () => {
        props.channelObject.webSocket?.send(JSON.stringify({
            msgtype: 'statusmessage',
            channel: 'status',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            command: EStatusCommand.REFRESH
        }))
    }

    /*
        Auto-refresco. El temporizador se monta con el componente y se limpia al desmontarlo, asi que
        cambiar de pestaña o cerrar el canal lo apaga SIN que nadie tenga que acordarse — con el canal
        cerrado no queda nada corriendo, que es el requisito que manda en este plugin.

        Se pide una foto al back, no se recalcula en el front: lo que interesa es el estado de AHORA.
    */
    React.useEffect(() => {
        if (!data.autoRefresh) return
        const id = setInterval(() => refresh(), data.autoRefresh * 1000)
        return () => clearInterval(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.autoRefresh, props.channelObject.instanceId])

    const inventory = data.inventory

    /*
        Entregas por segundo entre la foto anterior y esta. Solo se puede dar si hay dos fotos, si el
        componente informaba en las dos, y si el contador no ha ido hacia atrás — que pasa cuando el
        provider se reinicia y empieza de cero: ahí no hay tasa que calcular, hay que decir que no se sabe.
    */
    const tasaDe = (id: string, ahora?: number): number | undefined => {
        if (ahora === undefined || !data.previous || !inventory) return undefined
        const antes = data.previous.components.find(c => c.id === id)?.events
        if (antes === undefined || ahora < antes) return undefined
        const segundos = (inventory.takenAt - data.previous.takenAt) / 1000
        if (segundos <= 0) return undefined
        return (ahora - antes) / segundos
    }
    const componentes = (inventory?.components ?? []).filter(c => {
        if (!filter) return true
        const f = filter.toLowerCase()
        return c.id.toLowerCase().includes(f) || KIND_LABEL[c.kind].toLowerCase().includes(f)
    })

    /*
        Que componentes han ENTREGADO ALGO entre el refresco anterior y este.

        Es una comparacion de valores, no una tasa: si el contador es distinto al de la foto anterior,
        ese componente ha movido algo y sus lineas se animan. Si es el mismo, no. Nada de dividir por
        el tiempo — la tasa sirve para el numerito de la tabla, pero para decidir si algo se mueve lo
        unico que hace falta es saber si el valor cambio.

        Un componente que no informa, o que aun no tiene foto anterior con la que compararse, no entra:
        no se sabe, y no se anima.
    */
    const activos = new Set<string>()
    for (const c of inventory?.components ?? []) {
        if (c.events === undefined || !data.previous) continue
        const antes = data.previous.components.find(p => p.id === c.id)?.events
        if (antes !== undefined && c.events !== antes) activos.add(c.id)
    }

    /*
        Lo que necesita atención primero, y dentro de cada estado por tipo e id.

        Primero lo ROTO, después lo que SOBRA (ocioso: funciona, pero no le sirve a nadie), luego lo que
        no informa, y al final lo que va bien.

        ⚠️ Es un Record y no un array a propósito: con un array, un estado que alguien añada y olvide
        meter aquí devuelve -1 en indexOf y se cuela ENCIMA de los fallos — justo al revés de lo que se
        quiere. Con Record, TypeScript obliga a decidir su sitio.
    */
    const ORDEN: Record<EComponentHealth, number> = {
        [EComponentHealth.FAILED]: 0,
        [EComponentHealth.PENDING_RESTART]: 1,
        [EComponentHealth.NOT_INSTANTIATED]: 2,
        [EComponentHealth.IDLE]: 3,
        [EComponentHealth.UNKNOWN]: 4,
        [EComponentHealth.INSTANTIATED]: 5,
        [EComponentHealth.ACTIVE]: 6
    }
    componentes.sort((a, b) => {
        const d = ORDEN[a.health] - ORDEN[b.health]
        if (d !== 0) return d
        return a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)
    })

    const fila = (c: IStatusComponent) => {
        const estado = HEALTH_LABEL[c.health]
        return (
            <TableRow key={`${c.kind}-${c.id}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{KIND_LABEL[c.kind]}</TableCell>
                <TableCell><Typography variant='body2' sx={{ fontWeight: 500 }}>{c.displayName}</Typography></TableCell>
                <TableCell><Chip size='small' label={estado.label} color={estado.color} variant={c.health === EComponentHealth.ACTIVE ? 'outlined' : 'filled'} /></TableCell>
                {/*
                    Un guion cuando no se sabe, nunca un 0: el cero diria "nadie lo consume" y quien lo
                    lea puede ir a desinstalar algo que en realidad si se usa. Lo mismo vale para las
                    entregas de la columna siguiente.
                */}
                <TableCell align='right'>
                    <Typography variant='body2' sx={{ fontVariantNumeric: 'tabular-nums' }} color={c.subscribers === undefined ? 'text.disabled' : 'text.primary'}>
                        {c.subscribers === undefined ? '—' : c.subscribers}
                    </Typography>
                </TableCell>
                <TableCell align='right'>
                    <Typography variant='body2' sx={{ fontVariantNumeric: 'tabular-nums' }} color={c.events === undefined ? 'text.disabled' : 'text.primary'}>
                        {c.events === undefined ? '—' : c.events.toLocaleString()}
                    </Typography>
                    {(() => {
                        const t = tasaDe(c.id, c.events)
                        if (t === undefined) return null
                        return <Typography variant='caption' color='text.secondary' display='block'>{t < 1 && t > 0 ? t.toFixed(2) : Math.round(t)}/s</Typography>
                    })()}
                </TableCell>
                {/* El porqué es la columna que justifica la pantalla: sin ella esto es otra lista más. */}
                <TableCell><Typography variant='body2' color='text.secondary'>{c.reason ?? ''}</Typography></TableCell>
            </TableRow>
        )
    }

    /*
        Los dos estados vacios son distintos y hay que distinguirlos: sin arrancar, lo que falta es una
        accion del usuario; arrancado y sin foto, lo que falta es que llegue — y no hay nada que hacer
        salvo esperar un segundo.
    */
    if (!data.started) {
        return <EmptyState title='Kwirth Status not started'
            detail='Start the channel (tab settings ⚙ → Start) to see what this Kwirth has inside.' />
    }
    if (!inventory) {
        return <EmptyState title='Waiting for the first snapshot'
            detail='The channel is running; the inventory should appear in a moment.' />
    }

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                <Typography variant='subtitle2'>What this Kwirth has inside</Typography>
                <Chip size='small' variant='outlined' label={`${inventory.components.length} components`} />
                <Box sx={{ flexGrow: 1 }} />
                <TextField size='small' placeholder='Filter…' value={filter} onChange={e => setFilter(e.target.value)} sx={{ width: 220 }} />
                <Tooltip title='Table view'>
                    <IconButton size='small' color={vista === 'table' ? 'primary' : 'default'} aria-label='Table view' onClick={() => setVista('table')}><ViewList fontSize='small' /></IconButton>
                </Tooltip>
                <Tooltip title='Graph view'>
                    <IconButton size='small' color={vista === 'graph' ? 'primary' : 'default'} aria-label='Graph view' onClick={() => setVista('graph')}><Hub fontSize='small' /></IconButton>
                </Tooltip>
                {/*
                    Sin Tooltip a proposito: el Select ya ENSEÑA su valor ('Manual', 'Every 5s'), asi
                    que la ayuda sobraba — y al desplegarse, el tooltip se quedaba flotando ENCIMA del
                    menu y tapaba las opciones. El aria-label cubre al lector de pantalla.
                */}
                <Select size='small' value={data.autoRefresh} aria-label='Auto refresh'
                        onChange={e => { data.autoRefresh = Number(e.target.value); repintar() }}
                        sx={{ minWidth: 104, '& .MuiSelect-select': { py: 0.5, fontSize: '0.8rem' } }}>
                        <MenuItem value={0}>Manual</MenuItem>
                        <MenuItem value={5}>Every 5s</MenuItem>
                        <MenuItem value={15}>Every 15s</MenuItem>
                        <MenuItem value={30}>Every 30s</MenuItem>
                        <MenuItem value={60}>Every minute</MenuItem>
                    </Select>
                <Tooltip title='Take a new snapshot'>
                    <IconButton size='small' onClick={refresh}><Refresh fontSize='small' /></IconButton>
                </Tooltip>
            </Stack>

            {/* Que la foto es de un instante concreto se dice, no se insinúa: esto no se actualiza solo. */}
            <Typography variant='caption' color='text.secondary' sx={{ mb: 1 }}>
                Snapshot taken at {new Date(inventory.takenAt).toLocaleTimeString()}
                {data.autoRefresh ? ` — refreshing every ${data.autoRefresh}s while this tab is open` : ' — it does not refresh on its own'}.
                {' '}Delivered counts since each component started; the rate is measured against your previous snapshot.
            </Typography>

            <Box ref={boxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: vista === 'table' ? 'auto' : 'hidden', overflowX: 'hidden', width: '100%', flexGrow: 1, height: `calc(100vh - ${boxTop}px - 35px)` }}>
                {vista === 'graph' && <StatusDiagram inventory={inventory} active={activos} autoRefresh={data.autoRefresh} />}
                {vista === 'table' && <Table size='small' stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Kind</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>State</TableCell>
                            <TableCell align='right'>Consumers</TableCell>
                            <TableCell align='right'>Delivered</TableCell>
                            <TableCell>Why</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>{componentes.map(fila)}</TableBody>
                </Table>}
            </Box>

            {data.signals.length > 0 && (
                <Box sx={{ mt: 1 }}>
                    {data.signals.map((s, i) => <Typography key={i} variant='caption' color='error' display='block'>{s}</Typography>)}
                </Box>
            )}
        </Box>
    )
}

export { StatusTabContent }
