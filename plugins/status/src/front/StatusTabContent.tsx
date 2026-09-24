import React from 'react'
import { Box, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material'
import { Refresh } from '@kwirthmagnify/kwirth-common-front/icons'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { EComponentHealth, EComponentKind, EStatusCommand, IStatusComponent } from '../common/StatusTypes'
import { IStatusData } from './StatusData'

/*
    Cómo se dice cada estado, y de qué color.

    El texto va aquí y no en el back a propósito: el back informa de HECHOS (started, router montado) y el
    front decide cómo contarlos. Así el día que haya que cambiar una palabra no hay que republicar el back
    ni reiniciar el servidor.
*/
const HEALTH_LABEL: Record<EComponentHealth, { label: string, color: 'success' | 'warning' | 'error' | 'default' }> = {
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

const StatusTabContent: React.FC<IContentProps> = (props) => {
    const data: IStatusData = props.channelObject.data
    const [filter, setFilter] = React.useState('')
    /*
        La altura del area que scrollea se calcula, no se hereda.

        El contenedor que el core da al contenido de una pestaña no tiene altura definida, asi que un
        'height: 100%' no resuelve a nada y la tabla crece hasta salirse de la pantalla sin barra. Es el
        mismo patron que usan los demas canales: se mide donde EMPIEZA la caja y se le da el resto del
        viewport. Se remide en cada render porque la barra de herramientas de arriba cambia de alto.
    */
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

    const inventory = data.inventory
    const componentes = (inventory?.components ?? []).filter(c => {
        if (!filter) return true
        const f = filter.toLowerCase()
        return c.id.toLowerCase().includes(f) || KIND_LABEL[c.kind].toLowerCase().includes(f)
    })

    // Lo que necesita atención primero: se ordena por estado y, dentro de cada estado, por tipo e id.
    const ORDEN: EComponentHealth[] = [
        EComponentHealth.FAILED,
        EComponentHealth.PENDING_RESTART,
        EComponentHealth.NOT_INSTANTIATED,
        EComponentHealth.UNKNOWN,
        EComponentHealth.INSTANTIATED
    ]
    componentes.sort((a, b) => {
        const d = ORDEN.indexOf(a.health) - ORDEN.indexOf(b.health)
        if (d !== 0) return d
        return a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)
    })

    const fila = (c: IStatusComponent) => {
        const estado = HEALTH_LABEL[c.health]
        return (
            <TableRow key={`${c.kind}-${c.id}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{KIND_LABEL[c.kind]}</TableCell>
                <TableCell><Typography variant='body2' sx={{ fontWeight: 500 }}>{c.displayName}</Typography></TableCell>
                <TableCell><Chip size='small' label={estado.label} color={estado.color} variant={c.health === EComponentHealth.INSTANTIATED ? 'outlined' : 'filled'} /></TableCell>
                {/* El porqué es la columna que justifica la pantalla: sin ella esto es otra lista más. */}
                <TableCell><Typography variant='body2' color='text.secondary'>{c.reason ?? ''}</Typography></TableCell>
            </TableRow>
        )
    }

    if (!inventory) {
        return <Box sx={{ p: 2 }}><Typography variant='body2' color='text.secondary'>Waiting for the inventory…</Typography></Box>
    }

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 1 }}>
                <Typography variant='subtitle2'>What this Kwirth has inside</Typography>
                <Chip size='small' variant='outlined' label={`${inventory.components.length} components`} />
                <Box sx={{ flexGrow: 1 }} />
                <TextField size='small' placeholder='Filter…' value={filter} onChange={e => setFilter(e.target.value)} sx={{ width: 220 }} />
                <Tooltip title='Take a new snapshot'>
                    <IconButton size='small' onClick={refresh}><Refresh fontSize='small' /></IconButton>
                </Tooltip>
            </Stack>

            {/* Que la foto es de un instante concreto se dice, no se insinúa: esto no se actualiza solo. */}
            <Typography variant='caption' color='text.secondary' sx={{ mb: 1 }}>
                Snapshot taken at {new Date(inventory.takenAt).toLocaleTimeString()} — it does not refresh on its own
            </Typography>

            <Box ref={boxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', width: '100%', flexGrow: 1, height: `calc(100vh - ${boxTop}px - 35px)` }}>
                <Table size='small' stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Kind</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>State</TableCell>
                            <TableCell>Why</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>{componentes.map(fila)}</TableBody>
                </Table>
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
