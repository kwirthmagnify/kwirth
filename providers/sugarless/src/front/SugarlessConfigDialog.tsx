import React, { useEffect, useRef, useState } from 'react'
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    Stack, TextField, Typography
} from '@mui/material'
import {
    DEFAULT_CLIENT_VERSION, DEFAULT_INTERVAL_SECONDS, DEFAULT_MAX_SAMPLES, ESugarlessErrorKind,
    ISugarlessConfig, ISugarlessTestResult, MIN_INTERVAL_SECONDS, newSugarlessConfig
} from '../common/Sugarless'
import { validateConfig } from '../common/Validation'
import SecretField from './SecretField'

interface ISugarlessConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

// El provider es dueño de su configuracion: este dialogo habla con SU router, que el core monta detras
// de validacion de accessKey, y no con el endpoint de config generico del core (que guardaria la
// contraseña en claro en un ConfigMap).
const CONFIG_URL = (backendUrl: string) => `${backendUrl}/core/providerconfig/sugarless/config`
const TEST_URL = (backendUrl: string) => `${backendUrl}/core/providerconfig/sugarless/test`

const authHeaders = (accessString: string) => ({
    Authorization: accessString ? `Bearer ${accessString}` : '',
    'Content-Type': 'application/json',
    'X-Kwirth-App': 'true'
})

/*
    Convierte una respuesta fallida en algo que se pueda accionar.

    El 404 tiene tratamiento propio porque es el fallo mas probable y el mas desconcertante: el front
    del provider se sirve desde dist y se pinta igual, pero su router del back solo se monta al
    arrancar el core. Sin reinicio, el dialogo aparece entero y NADA de lo que haces funciona.
*/
const describeFailure = async (response: Response): Promise<string> => {
    const body: { errors?: string[] } = await response.json().catch(() => ({}))
    if (body.errors && body.errors.length > 0) return body.errors.join('; ')
    if (response.status === 404) {
        return 'HTTP 404: the Sugarless backend is not mounted. A provider that owns its configuration ' +
            'only gets its endpoints registered when the core starts, so a freshly installed one needs ' +
            'a Kwirth core restart (this provider declares requiresRestart).'
    }
    if (response.status === 403) return 'HTTP 403: the access key was rejected.'
    return `HTTP ${response.status}`
}

/*
    Desactiva el autofill del navegador en todos los campos, no solo en el de la contraseña.

    Va en 'htmlInput' porque es el atributo del <input> real lo que mira Chrome, que es el criterio que
    ya sigue el resto del front (IdpManagerDialog, ProviderManagerDialog). Y va en TODOS los campos
    porque Chrome no solo tiñe el fondo de azul: mete el usuario y la contraseña guardados en cualquier
    campo que le parezca un login. Aqui eso significaria guardar como credencial de LibreLinkUp algo
    que el usuario nunca escribio -- y pisando de paso la contraseña buena que venia del back.
*/
const NO_AUTOFILL = { htmlInput: { autoComplete: 'off' } }

// El fallo mas probable de todos merece una explicacion, no un mensaje de error a secas.
const FOLLOWER_HINT =
    'LibreLinkUp reports the patients an account FOLLOWS, not your own sensors. Use the credentials ' +
    'of a follower account: invite a follower by email from the patient LibreLink app, accept the ' +
    'invitation in the LibreLinkUp app, and enter those credentials here.'

const SugarlessConfigDialog: React.FC<ISugarlessConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [form, setForm] = useState<ISugarlessConfig>(newSugarlessConfig())
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [errors, setErrors] = useState<string[]>([])
    const [notice, setNotice] = useState<string | undefined>()
    const [testResult, setTestResult] = useState<ISugarlessTestResult | undefined>()
    const feedbackRef = useRef<HTMLDivElement>(null)

    /*
        El resultado se pinta al final del formulario, que con la altura fija del dialogo puede quedar
        por debajo del borde. Sin esto, pulsar Test parece no hacer nada: el Alert esta, pero fuera de
        la vista.
    */
    useEffect(() => {
        if (testResult || errors.length > 0) feedbackRef.current?.scrollIntoView({ block: 'nearest' })
    }, [testResult, errors])

    useEffect(() => {
        fetch(CONFIG_URL(backendUrl), { headers: authHeaders(accessString) })
            .then(async r => r.ok ? r.json() : Promise.reject(await describeFailure(r)))
            .then((stored: ISugarlessConfig) => {
                setForm({
                    email: stored.email ?? '',
                    // La contraseña llega entera y se pre-rellena: el ojo del campo la revela.
                    password: stored.password ?? '',
                    region: stored.region ?? '',
                    intervalSeconds: stored.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS,
                    maxSamples: stored.maxSamples ?? DEFAULT_MAX_SAMPLES,
                    clientVersion: stored.clientVersion ?? DEFAULT_CLIENT_VERSION
                })
            })
            .catch(err => setErrors([`Failed to load the configuration: ${err}`]))
            .finally(() => setLoading(false))
    }, [])

    const localErrors = (): string[] => validateConfig(form)

    const set = <K extends keyof ISugarlessConfig>(key: K, value: ISugarlessConfig[K]): void => {
        setForm(previous => ({ ...previous, [key]: value }))
        setTestResult(undefined)
        setNotice(undefined)
    }

    const save = async (): Promise<void> => {
        const found = localErrors()
        setErrors(found)
        setNotice(undefined)
        if (found.length > 0) return

        setSaving(true)
        try {
            const response = await fetch(CONFIG_URL(backendUrl), {
                method: 'PUT',
                headers: authHeaders(accessString),
                body: JSON.stringify(form)
            })
            if (!response.ok) {
                setErrors([await describeFailure(response)])
                return
            }
            onClose()
        }
        catch (err) {
            setErrors([String(err)])
        }
        finally {
            setSaving(false)
        }
    }

    /*
        La prueba la ejecuta el BACK, no el navegador: es el back quien tiene la red, los certificados
        y la salida a internet con las que se hara el polling de verdad. Probar desde aqui no
        demostraria nada.
    */
    const test = async (): Promise<void> => {
        const found = localErrors()
        setErrors(found)
        setNotice(undefined)
        if (found.length > 0) return

        setTesting(true)
        setTestResult(undefined)
        try {
            const response = await fetch(TEST_URL(backendUrl), {
                method: 'POST',
                headers: authHeaders(accessString),
                body: JSON.stringify(form)
            })
            /*
                Se comprueba el 'ok' ANTES de parsear: un 404 devuelve HTML, y sin esta rama el
                usuario veria un error de JSON invalido en vez de por que ha fallado de verdad.
            */
            if (!response.ok) {
                setTestResult({ ok: false, durationMs: 0, error: await describeFailure(response) })
                return
            }
            setTestResult(await response.json() as ISugarlessTestResult)
        }
        catch (err) {
            setTestResult({ ok: false, durationMs: 0, error: String(err) })
        }
        finally {
            setTesting(false)
        }
    }

    const busy = loading || saving || testing

    const testFeedback = (): React.ReactNode => {
        if (!testResult) return undefined
        if (!testResult.ok) {
            return <Alert severity='error'>
                <Typography variant='body2'>{testResult.error}</Typography>
                {testResult.errorKind === ESugarlessErrorKind.NO_FOLLOWED_PATIENT &&
                    <Typography variant='caption'>{FOLLOWER_HINT}</Typography>}
            </Alert>
        }
        // Conectar y no tener lectura actual no es un fallo, pero tampoco es un exito redondo: se
        // dice con claridad para que nadie se quede esperando una grafica que no va a llegar.
        return <Alert severity={testResult.hasReading ? 'success' : 'warning'}>
            <Typography variant='body2'>
                {`Connected in ${testResult.durationMs} ms · region '${testResult.region}' · `}
                {`${testResult.connections} followed patient(s) · unit ${testResult.unit}`}
            </Typography>
            <Typography variant='caption'>
                {testResult.hasReading
                    ? 'A current reading is available.'
                    : 'No current reading right now: the patient device has not synced recently. This is not a failure.'}
            </Typography>
        </Alert>
    }

    return <Dialog open={true} onClose={onClose} maxWidth='sm' fullWidth>
        <DialogTitle>Sugarless — LibreLinkUp account</DialogTitle>
        <DialogContent sx={{ height: 480, display: 'flex', flexDirection: 'column', gap: 2, pt: 1, overflowY: 'auto' }}>
            {loading
                ? <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}><CircularProgress /></Box>
                : <>
                    <Alert severity='info'>
                        <Typography variant='caption'>{FOLLOWER_HINT}</Typography>
                    </Alert>

                    <Stack direction='row' spacing={2}>
                        <TextField size='small' label='Email' sx={{ width: 320 }} value={form.email} disabled={busy}
                            slotProps={NO_AUTOFILL}
                            onChange={e => set('email', e.target.value)} />
                    </Stack>

                    <SecretField label='Password' value={form.password} disabled={busy}
                        onChange={value => set('password', value)}
                        helperText='Required' />

                    <Divider />

                    <Stack direction='row' spacing={2}>
                        <TextField size='small' label='Region' sx={{ width: 150 }} slotProps={NO_AUTOFILL}
                            value={form.region} disabled={busy}
                            helperText='Empty = auto'
                            onChange={e => set('region', e.target.value)} />
                        <TextField size='small' label='Interval (s)' type='number' sx={{ width: 150 }}
                            slotProps={NO_AUTOFILL}
                            value={form.intervalSeconds} disabled={busy}
                            helperText={`Minimum ${MIN_INTERVAL_SECONDS}`}
                            onChange={e => set('intervalSeconds', Number(e.target.value))} />
                    </Stack>

                    <Stack direction='row' spacing={2}>
                        <TextField size='small' label='Max samples' type='number' sx={{ width: 150 }}
                            slotProps={NO_AUTOFILL}
                            value={form.maxSamples} disabled={busy}
                            helperText='In-memory history'
                            onChange={e => set('maxSamples', Number(e.target.value))} />
                        <TextField size='small' label='Client version' sx={{ width: 150 }}
                            slotProps={NO_AUTOFILL}
                            value={form.clientVersion} disabled={busy}
                            helperText='Raise it if the API asks'
                            onChange={e => set('clientVersion', e.target.value)} />
                    </Stack>

                    <Box ref={feedbackRef}>
                        {errors.length > 0 && <Alert severity='error'>
                            {errors.map((message, index) => <Typography key={index} variant='body2'>{message}</Typography>)}
                        </Alert>}
                        {notice && <Alert severity='info'><Typography variant='body2'>{notice}</Typography></Alert>}
                        {testFeedback()}
                    </Box>
                </>}
        </DialogContent>
        <DialogActions>
            <Button onClick={test} disabled={busy}>Test</Button>
            <Button onClick={save} disabled={busy} variant='contained'>Save</Button>
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
        </DialogActions>
    </Dialog>
}

export default SugarlessConfigDialog
