import React, { useContext, useEffect, useState } from 'react'
import { Dialog, DialogContent, Typography } from '@mui/material'
import { SessionContext, SessionContextType } from '../../model/SessionContext'

/*
    El diálogo de configuracion que trae el PROPIO provider en su front.js.

    Un provider basico se configura con un formulario que pinta el core a partir de su schema. Uno
    complejo —sugarless, syslog, service-flow— tiene varias configuraciones con nombre, listas y pruebas
    de conexion, y eso no cabe en un formulario plano: trae su UI y el core solo la monta, igual que hace
    con el SetupDialog de una homepage.

    ⚠️ El script se vuelve a cargar cada vez que se abre, con la marca de tiempo en la URL: si no, tras
    actualizar el provider seguiria montandose la UI vieja que quedo en la global, y el usuario estaria
    configurando una version que ya no esta instalada.
*/

/** Lo que el core le pasa a la UI del provider: con esto habla con su propio back. */
interface IProviderConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

interface ILoadedProvider {
    ConfigDialog?: React.ComponentType<IProviderConfigDialogProps>
}

const loadedProvider = (id: string): ILoadedProvider | undefined =>
    (window as unknown as { __kwirth_providers__?: Record<string, ILoadedProvider> }).__kwirth_providers__?.[id]

const ProviderFrontDialog: React.FC<{ providerId: string, onClose: () => void }> = ({ providerId, onClose }) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [cargado, setCargado] = useState(false)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        const anterior = document.getElementById(`kwirth-provider-front-${providerId}`)
        if (anterior) anterior.remove()
        const globals = (window as unknown as { __kwirth_providers__?: Record<string, ILoadedProvider> }).__kwirth_providers__
        if (globals) delete globals[providerId]

        const script = document.createElement('script')
        script.id = `kwirth-provider-front-${providerId}`
        script.src = `${backendUrl}/core/providers/${providerId}/front?t=${Date.now()}`
        script.crossOrigin = 'anonymous'
        script.onload = () => setCargado(true)
        script.onerror = () => setError(`Failed to load UI for provider "${providerId}"`)
        document.head.appendChild(script)
    }, [providerId, backendUrl])

    if (error) {
        return (
            <Dialog open={true} maxWidth='xs' fullWidth>
                <DialogContent><Typography variant='body2' color='error'>{error}</Typography></DialogContent>
            </Dialog>
        )
    }

    const ConfigDialog = cargado ? loadedProvider(providerId)?.ConfigDialog : undefined
    if (!ConfigDialog) return null

    return <ConfigDialog onClose={onClose} backendUrl={backendUrl} accessString={accessString} />
}

export { ProviderFrontDialog }
