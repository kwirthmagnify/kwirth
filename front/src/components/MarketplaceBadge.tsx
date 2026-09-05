import React from 'react'
import { Chip, Tooltip } from '@mui/material'

// Indicador de procedencia en las tarjetas del catalogo: que marketplace sirve esa extension.
// No es decorativo. Con la precedencia por id, un marketplace privado puede publicar su propio 'log' y
// tapar al publico, asi que esto es lo unico que distingue CUAL de los dos estas viendo.
//
// label undefined = viene del marketplace publico OSS.
interface IMarketplaceBadgeProps {
    label?: string
}

// Se pinta SIEMPRE, tambien para el publico. Marcar solo las privadas dejaba a las publicas sin ningun
// indicador, y no habia forma de distinguir "viene del marketplace publico" de "no se ha marcado" —
// sobre todo en dialogos cuya tarjeta ya lleva un candado como icono, que se lee como 'privado'.
const MarketplaceBadge: React.FC<IMarketplaceBadgeProps> = (props: IMarketplaceBadgeProps) => {
    if (!props.label) {
        return (
            <Tooltip title='Served by the public Kwirth marketplace'>
                <Chip label='Kwirth' size='small' variant='outlined' />
            </Tooltip>
        )
    }
    // relleno, no perfilado: el chip 'dev' de estos dialogos ya es naranja perfilado y se confundirian
    return (
        <Tooltip title={`Served by the '${props.label}' marketplace, which takes precedence over the public Kwirth one`}>
            <Chip label={props.label} size='small' color='warning' />
        </Tooltip>
    )
}

export { MarketplaceBadge }
