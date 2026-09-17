import React, { useContext, useEffect, useState } from 'react'
import { Button, CircularProgress, Divider, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { CheckCircle, ContentCopy, Refresh } from '@kwirthmagnify/kwirth-common-front/icons'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addGetAuthorization, addPostAuthorization } from '../../tools/AuthorizationManagement'
import { IPerConfigPanelProps } from './ExtensionConfigsDialog'

/*
    La URL de ingesta de una configuracion de webhook, que es lo unico que webhooks añade al gestor comun
    de configuraciones.

    Es lo que se pega en el sistema que va a llamar (Jira Automation → Send web request), y lleva el token
    dentro: quien tenga la URL puede meter eventos, asi que se avisa de que es un secreto y se puede
    regenerar sin rehacer la configuracion.

    Solo tiene sentido con la configuracion ya guardada: el token lo acuña el back al crearla.
*/
const WebhookUrlPanel: React.FC<IPerConfigPanelProps> = ({ basePath, configName }) => {
    const { accessString, backendUrl } = useContext(SessionContext) as SessionContextType
    const [url, setUrl] = useState<string | undefined>()
    const [rotating, setRotating] = useState(false)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
        const cargar = async () => {
            setUrl(undefined)
            try {
                const res = await fetch(`${backendUrl}${basePath}/configs/${encodeURIComponent(configName)}/url`, addGetAuthorization(accessString))
                if (res.ok) setUrl((await res.json()).url)
            }
            catch { /* la configuracion puede no existir aun */ }
        }
        cargar()
    }, [backendUrl, accessString, basePath, configName])

    const regenerar = async () => {
        setRotating(true)
        setError(undefined)
        try {
            const res = await fetch(`${backendUrl}${basePath}/configs/${encodeURIComponent(configName)}/rotate`, addPostAuthorization(accessString, JSON.stringify({})))
            if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
            setUrl((await res.json()).url)
        }
        catch (err) { setError(`Rotate failed: ${err}`) }
        finally { setRotating(false) }
    }

    if (!url) return null

    // El back devuelve la ruta; la direccion completa es la suya. Es lo que hay que pegar fuera de Kwirth.
    const completa = url.startsWith('http') ? url : `${backendUrl}${url}`

    const copiar = () => {
        navigator.clipboard.writeText(completa).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }

    return (<>
        <Divider />
        <Typography variant='caption' color='text.secondary' fontWeight='bold'>Webhook URL</Typography>
        <Typography variant='caption' color='text.disabled'>Paste this URL into the provider (e.g. Jira Automation → Send web request). Keep it secret — it authenticates the caller.</Typography>
        <TextField size='small' fullWidth value={completa}
            slotProps={{ input: {
                readOnly: true,
                endAdornment: (
                    <InputAdornment position='end'>
                        <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                            <IconButton size='small' edge='end' aria-label='Copy webhook URL' onClick={copiar}>
                                {copied ? <CheckCircle fontSize='small' color='success' /> : <ContentCopy fontSize='small' />}
                            </IconButton>
                        </Tooltip>
                    </InputAdornment>
                )
            } }} />
        <Stack direction='row' justifyContent='flex-end' alignItems='center' spacing={1}>
            {error && <Typography variant='caption' color='error' sx={{ flex: 1 }}>{error}</Typography>}
            <Button size='small' startIcon={rotating ? <CircularProgress size={14} /> : <Refresh fontSize='small' />} disabled={rotating} onClick={regenerar}>
                Regenerate
            </Button>
        </Stack>
    </>)
}

export { WebhookUrlPanel }
