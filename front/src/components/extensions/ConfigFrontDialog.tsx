import React, { useContext, useEffect, useState } from 'react'
import { Dialog, DialogContent, Typography } from '@mui/material'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { ensureDcesLoaded } from '../../tools/DceLoader'

/*
    The configuration the extension ITSELF brings in its front.js. It is one of the four ways of
    configuring an extension (see ConfigFormDialog), and providers and senders use it.

    A basic provider is configured with a form the core paints from its schema. A complex one —sugarless,
    syslog, service-flow— has several named configurations, lists and connection tests, and that does not
    fit in a flat form: it brings its UI and the core merely mounts it, just as it does with a homepage's
    SetupDialog.

    ⚠️ The script is loaded again every time it opens, with the timestamp in the URL: otherwise, after
    updating the extension the old UI left in the global would go on being mounted, and a version that is
    no longer installed would be the one being configured.
*/

/** What the core passes to the extension's UI: with this it talks to its own back end. */
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
    /** Where the extension leaves its UI on loading: '__kwirth_providers__', '__kwirth_senders__'… */
    globalName: string
    /** The front.js route, relative to backendUrl: '/core/providers/<id>/front'. */
    frontPath: string
    /** What this type is called in the error message, in the singular. */
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

        /*
            The DCEs first (plan: plans/completed/dce/PRD.md, RF7). An extension's own UI may call getDce() while
            its script is being evaluated, and this dialog is the one path that reaches a front.js
            without going through App's loaders — so it has to await the very same promise they do.
        */
        let cancelled = false
        void ensureDcesLoaded(backendUrl, accessString).then(() => {
            if (cancelled) return
            const script = document.createElement('script')
            script.id = scriptId
            script.src = `${backendUrl}${frontPath}?t=${Date.now()}`
            script.crossOrigin = 'anonymous'
            script.onload = () => setCargado(true)
            script.onerror = () => setError(`Failed to load UI for ${noun} "${extensionId}"`)
            document.head.appendChild(script)
        })
        return () => { cancelled = true }
    }, [extensionId, globalName, frontPath, noun, backendUrl, accessString])

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
