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

// Solo se pinta cuando la sirve un marketplace privado: si no hay ninguno configurado todo viene del
// publico y marcar cada tarjeta con 'public' seria ruido sin informacion.
const MarketplaceBadge: React.FC<IMarketplaceBadgeProps> = (props: IMarketplaceBadgeProps) => {
    if (!props.label) return null
    return (
        <Tooltip title={`Served by the '${props.label}' marketplace, which takes precedence over the public Kwirth one`}>
            <Chip label={props.label} size='small' variant='outlined' color='primary' />
        </Tooltip>
    )
}

export { MarketplaceBadge }
