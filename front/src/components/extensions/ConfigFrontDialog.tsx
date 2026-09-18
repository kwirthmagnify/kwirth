import React, { useContext, useEffect, useState } from 'react'
import { Dialog, DialogContent, Typography } from '@mui/material'
import { SessionContext, SessionContextType } from '../../model/SessionContext'

/*
    La configuracion que trae la PROPIA extension en su front.js. Es una de las cuatro formas de
    configurar una extension (ver ConfigFormDialog), y la usan providers y senders.

    Un provider basico se configura con un formulario que pinta el core a partir de su schema. Uno
    complejo —sugarless, syslog, service-flow— tiene varias configuraciones con nombre, listas y pruebas
    de conexion, y eso no cabe en un formulario plano: trae su UI y el core solo la monta, igual que hace
    con el SetupDialog de una homepage.

    ⚠️ El script se vuelve a cargar cada vez que se abre, con la marca de tiempo en la URL: si no, tras
    actualizar la extension seguiria montandose la UI vieja que quedo en la global, y se estaria
    configurando una version que ya no esta instalada.
*/

/** Lo que el core le pasa a la UI de la extension: con esto habla con su propio back. */
interface IExtensionConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

interface ILoadedExtensionFront {
    ConfigDialog?: React.ComponentType<IExtensionConfigDialogProps>
}

interface IConfigFrontDialogProps {
    extensionId: string
    /** Donde deja su UI la extension al cargarse: '__kwirth_providers__', '__kwirth_senders__'… */
    globalName: string
    /** Ruta del front.js, relativa al backendUrl: '/core/providers/<id>/front'. */
    frontPath: string
    /** Como se llama este tipo en el mensaje de error, en singular. */
    noun: string
    onClose: () => void
}

const registro = (globalName: string): Record<string, ILoadedExtensionFront> | undefined =>
    (window as unknown as Record<string, Record<string, ILoadedExtensionFront> | undefined>)[globalName]

const ConfigFrontDialog: React.FC<IConfigFrontDialogProps> = ({ extensionId, globalName, frontPath, noun, onClose }) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [cargado, setCargado] = useState(false)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        const scriptId = `kwirth-front-${globalName}-${extensionId}`
        const anterior = document.getElementById(scriptId)
        if (anterior) anterior.remove()
        const globals = registro(globalName)
        if (globals) delete globals[extensionId]

        const script = document.createElement('script')
        script.id = scriptId
        script.src = `${backendUrl}${frontPath}?t=${Date.now()}`
        script.crossOrigin = 'anonymous'
        script.onload = () => setCargado(true)
        script.onerror = () => setError(`Failed to load UI for ${noun} "${extensionId}"`)
        document.head.appendChild(script)
    }, [extensionId, globalName, frontPath, noun, backendUrl])

    if (error) {
        return (
            <Dialog open={true} maxWidth='xs' fullWidth>
                <DialogContent><Typography variant='body2' color='error'>{error}</Typography></DialogContent>
            </Dialog>
        )
    }

    const ConfigDialog = cargado ? registro(globalName)?.[extensionId]?.ConfigDialog : undefined
    if (!ConfigDialog) return null

    return <ConfigDialog onClose={onClose} backendUrl={backendUrl} accessString={accessString} />
}

export { ConfigFrontDialog }
