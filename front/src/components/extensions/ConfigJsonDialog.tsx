import React, { useContext, useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

/*
    La configuracion de instalacion de un plugin: JSON libre que el plugin lee en runtime.

    Se edita en crudo, con exportar e importar, y no con un formulario: es un requisito del proyecto para
    los componentes que llevan configuracion (plugins, senders, providers), porque asi se puede llevar la
    misma configuracion de un Kwirth a otro sin volver a teclearla.

    ⚠️ Que un plugin ACEPTE configuracion lo dice el propio plugin con `configSchema` en su package.json;
    esta pantalla solo sale en esos. El schema todavia no se usa para pintar campos —el editor es libre—
    pero es lo que distingue un plugin configurable de uno que no lo es.
*/
const PluginConfigDialog: React.FC<{ pluginId: string, onClose: () => void }> = ({ pluginId, onClose }) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [texto, setTexto] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        const cargar = async () => {
            setBusy(true)
            try {
                const res = await fetch(`${backendUrl}/core/plugins/${pluginId}/config`, addGetAuthorization(accessString))
                const cfg = res.ok ? await res.json() : {}
                setTexto(JSON.stringify(cfg ?? {}, null, 2))
            }
            catch (err) { setError(`Failed to load config: ${err}`) }
            finally { setBusy(false) }
        }
        cargar()
    }, [backendUrl, accessString, pluginId])

    const guardar = async () => {
        setError(undefined)
        let parsed: unknown
        try { parsed = JSON.parse(texto || '{}') }
        catch (err) {
            // Se avisa ANTES de mandarlo: un JSON roto guardado deja al plugin sin configuracion y el
            // fallo aparece mucho despues, al arrancar.
            setError(`Invalid JSON: ${err}`)
            return
        }
        setBusy(true)
        try {
            const res = await fetch(`${backendUrl}/core/plugins/${pluginId}/config`, addPutAuthorization(accessString, JSON.stringify(parsed)))
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            onClose()
        }
        catch (err) { setError(`Failed to save config: ${err}`) }
        finally { setBusy(false) }
    }

    const exportar = () => {
        const blob = new Blob([texto], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${pluginId}-config.json`
        a.click()
        URL.revokeObjectURL(a.href)
    }

    const importar = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => setTexto(String(reader.result ?? ''))
        reader.readAsText(file)
        e.target.value = ''
    }

    return (
        <Dialog open={true} slotProps={{ paper: { sx: { width: 560, maxWidth: '95vw' } } }}>
            <DialogTitleHelp section='guide/extensions/plugins/index?id=managing-channel-plugins' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>Configure {pluginId}</DialogTitleHelp>
            <DialogContent>
                <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>Installation config (JSON) for this plugin — read by the plugin at runtime.</Typography>
                <TextField multiline minRows={8} fullWidth value={texto} onChange={e => setTexto(e.target.value)} disabled={busy}
                    slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }} />
                {error && <Typography variant='caption' color='error' sx={{ display: 'block', mt: 1 }}>{error}</Typography>}
                <Stack direction='row' spacing={1} sx={{ mt: 1 }}>
                    <Button size='small' onClick={exportar}>Export</Button>
                    <Button size='small' component='label'>Import<input type='file' accept='.json,application/json' hidden onChange={importar} /></Button>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={busy} onClick={guardar}>OK</Button>
                <Button variant='outlined' color='inherit' onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { PluginConfigDialog }
