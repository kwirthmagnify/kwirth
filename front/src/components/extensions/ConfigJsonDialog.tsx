import React, { useContext, useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'

/*
    Una configuracion en JSON LIBRE, con exportar e importar. Es una de las cuatro formas de configurar
    una extension (ver ConfigFormDialog).

    Se edita en crudo y no con un formulario porque es un requisito del proyecto para los componentes que
    llevan configuracion: asi la misma configuracion se lleva de un Kwirth a otro sin volver a teclearla.

    Hoy la usan los plugins, cuya configuracion de instalacion la lee el plugin en runtime y el core no
    interpreta. ⚠️ Que un plugin ACEPTE configuracion lo dice el propio plugin con `configSchema` en su
    package.json, y el gestor solo deja viva la rueda en esos; el schema todavia no se usa para pintar
    campos, pero es lo que distingue un plugin configurable de uno que no lo es.
*/
interface IConfigJsonDialogProps {
    /** Titulo del diálogo, ya redactado por quien lo abre. */
    title: string
    /** Que es esta configuracion, en una linea, para quien la ve por primera vez. */
    hint: string
    /** Ruta del back, relativa al backendUrl: GET para leer y PUT para guardar. */
    endpoint: string
    /** Nombre del fichero al exportar, sin extension. */
    exportName: string
    onClose: () => void
}

const ConfigJsonDialog: React.FC<IConfigJsonDialogProps> = ({ title, hint, endpoint, exportName, onClose }) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [texto, setTexto] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        const cargar = async () => {
            setBusy(true)
            try {
                const res = await fetch(`${backendUrl}${endpoint}`, addGetAuthorization(accessString))
                const cfg = res.ok ? await res.json() : {}
                setTexto(JSON.stringify(cfg ?? {}, null, 2))
            }
            catch (err) { setError(`Failed to load config: ${err}`) }
            finally { setBusy(false) }
        }
        cargar()
    }, [backendUrl, accessString, endpoint])

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
            const res = await fetch(`${backendUrl}${endpoint}`, addPutAuthorization(accessString, JSON.stringify(parsed)))
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
        a.download = `${exportName}-config.json`
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
            <DialogTitleHelp section='guide/extensions/plugins/index?id=managing-channel-plugins' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>{title}</DialogTitleHelp>
            <DialogContent>
                <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>{hint}</Typography>
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

export { ConfigJsonDialog }
