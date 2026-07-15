import React, { useEffect, useState } from 'react'
import { Box, Button, CircularProgress, Menu, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { ExpandMore } from '@kwirthmagnify/kwirth-common-front/icons'
import { addPostAuthorization } from '../tools/AuthorizationManagement'
import { EAuthMethodKind, IAuthMethod, ILoginResponse, IUser } from '@kwirthmagnify/kwirth-common'

interface ILoginExtensionPageProps {
    slug: string
    backendUrl: string
    methods: IAuthMethod[]
    initialError?: string
    onClose: (user: IUser | undefined, firstTime: boolean) => void
}

interface ILoginConfig {
    top?: string
    left?: string
    width?: string
    height?: string
    pageBackground?: string
    dialogBackground?: string
    textColor?: string
    title?: string
    userLabel?: string
    passwordLabel?: string
    newPasswordLabel?: string
    repeatPasswordLabel?: string
    changePasswordMessage?: string
    changePasswordButton?: string
    okButton?: string
    orSeparator?: string
    idpButton?: string
    startChannel?: string
    allowedIdps?: string[]
    hasBackground?: boolean
}

const LoginExtensionPage: React.FC<ILoginExtensionPageProps> = (props) => {
    const [config, setConfig] = useState<ILoginConfig | null>(null)
    const [backgroundUrl, setBackgroundUrl] = useState<string | undefined>()
    const [loading, setLoading] = useState(true)

    const [userName, setUserName] = useState('')
    const [password, setPassword] = useState('')
    const [newPassword1, setNewPassword1] = useState('')
    const [newPassword2, setNewPassword2] = useState('')
    const [changingPassword, setChangingPassword] = useState(false)
    const [error, setError] = useState(props.initialError ?? '')
    const [busy, setBusy] = useState(false)
    const [idpAnchor, setIdpAnchor] = useState<null | HTMLElement>(null)

    useEffect(() => {
        if (props.initialError) setError(props.initialError)
    }, [props.initialError])

    useEffect(() => {
        const load = async () => {
            let cfg: ILoginConfig | undefined
            try {
                const cfgRes = await fetch(`${props.backendUrl}/logins/${props.slug}/config`)
                if (!cfgRes.ok) { props.onClose(undefined, false); return }
                cfg = await cfgRes.json()
                setConfig(cfg!)
            }
            catch {
                props.onClose(undefined, false)
                return
            }
            if (cfg?.hasBackground) {
                try {
                    const bgRes = await fetch(`${props.backendUrl}/logins/${props.slug}/background`)
                    if (bgRes.ok) setBackgroundUrl(URL.createObjectURL(await bgRes.blob()))
                }
                catch {}
            }
            setLoading(false)
        }
        load()
    }, [props.slug])

    const buildUser = (login: ILoginResponse): IUser => ({
        id: login.id,
        name: login.name,
        password: '',
        accessKey: login.accessKey,
        resources: '',
        startChannel: config?.startChannel ?? login.startChannel,
        exitFullScreen: login.exitFullScreen,
        enabledChannels: login.enabledChannels
    })

    const doLogin = async () => {
        setBusy(true)
        setError('')
        try {
            const res = await fetch(`${props.backendUrl}/login`, addPostAuthorization('', JSON.stringify({ user: userName, password })))
            switch (res.status) {
                case 200: {
                    const loginData = await res.json()
                    const u = buildUser(loginData)
                    const requiredChannel = config?.startChannel
                    if (requiredChannel && u.enabledChannels != null && !u.enabledChannels.includes(requiredChannel)) {
                        setError(`Your account does not have access to the '${requiredChannel}' channel required by this login page.`)
                        break
                    }
                    props.onClose(u, false)
                    break
                }
                case 201:
                    setChangingPassword(true)
                    break
                case 401:
                    setError('Invalid credentials.')
                    break
                case 403:
                    setError('Access denied.')
                    break
                default:
                    setError(`Login failed (${res.status}).`)
            }
        }
        catch { setError('Could not connect to Kwirth backend.') }
        finally { setBusy(false) }
    }

    const doChangePassword = async () => {
        if (!changingPassword) {
            // validate current credentials then enter change-password mode (same as Login.tsx onClickChangePassword)
            setBusy(true)
            try {
                const res = await fetch(`${props.backendUrl}/login`, addPostAuthorization('', JSON.stringify({ user: userName, password })))
                if (res.ok) { setNewPassword1(''); setNewPassword2(''); setChangingPassword(true) }
                else setError('Invalid credentials.')
            }
            catch { setError('Could not connect to Kwirth backend.') }
            finally { setBusy(false) }
            return
        }
        if (newPassword1 !== newPassword2) { setError('Passwords do not match.'); return }
        setBusy(true)
        setError('')
        try {
            const res = await fetch(`${props.backendUrl}/login/password`, addPostAuthorization('', JSON.stringify({ user: userName, password, newpassword: newPassword1 })))
            if (res.ok) props.onClose(buildUser(await res.json()), false)
            else { setError('Could not change password.'); setChangingPassword(false) }
        }
        catch { setError('Could not connect to Kwirth backend.') }
        finally { setBusy(false) }
    }

    const onClickIdp = (method: IAuthMethod) => {
        if (!method.startUrl) return
        const returnTo = `${window.location.origin}${window.location.pathname}?loginExt=${props.slug}`
        window.location.href = `${props.backendUrl}${method.startUrl}?returnTo=${encodeURIComponent(returnTo)}`
    }

    if (loading) {
        return (
            <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress />
            </Box>
        )
    }

    if (!config) return null

    const hasPassword = props.methods.length === 0 || props.methods.some(m => m.kind === EAuthMethodKind.PASSWORD)
    const allRedirectMethods = props.methods.filter(m => m.kind === EAuthMethodKind.REDIRECT)
    const redirectMethods = config.allowedIdps
        ? allRedirectMethods.filter(m => config.allowedIdps!.includes(m.id))
        : allRedirectMethods
    const textColor = config.textColor ?? undefined
    const centered = !config.top && !config.left
    const canSubmit = !busy && userName !== '' && password !== ''
    const btnSx = textColor
        ? { color: textColor, borderColor: textColor, '&.Mui-disabled': { color: `${textColor}60`, borderColor: `${textColor}40` }, '&:hover': { borderColor: textColor } }
        : undefined

    return (
        <Box sx={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: config.pageBackground ?? '#1a1a2e',
            backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        }}>
            <Box sx={{
                position: 'absolute',
                top: centered ? '50%' : (config.top ?? 'auto'),
                left: centered ? '50%' : (config.left ?? 'auto'),
                transform: centered ? 'translate(-50%, -50%)' : undefined,
                width: config.width ?? 320,
                height: config.height ?? undefined,
                backgroundColor: config.dialogBackground ?? 'transparent',
                borderRadius: 1,
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                gap: 2
            }}>
                {config.title && <Typography variant='h6' sx={{ color: textColor, mb: 1 }}>{config.title}</Typography>}

                {/* content area: fields then IdP — same order as Login.tsx */}
                <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column' }}>
                    {!changingPassword && hasPassword && <>
                        <TextField label={config.userLabel ?? 'User'} value={userName} onChange={e => setUserName(e.target.value)}
                            variant='standard' size='small' autoFocus disabled={busy}
                            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) doLogin() }}
                            InputLabelProps={{ style: { color: textColor } }} inputProps={{ style: { color: textColor } }} />
                        <TextField label={config.passwordLabel ?? 'Password'} value={password} type='password' onChange={e => setPassword(e.target.value)}
                            variant='standard' size='small' disabled={busy}
                            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) doLogin() }}
                            InputLabelProps={{ style: { color: textColor } }} inputProps={{ style: { color: textColor } }} />
                    </>}

                    {changingPassword && <>
                        <Typography variant='body2' sx={{ color: textColor }}>{config.changePasswordMessage ?? 'Your login has been successful, you can now change your password.'}</Typography>
                        <TextField label={config.newPasswordLabel ?? 'New password'} value={newPassword1} type='password'
                            onChange={e => setNewPassword1(e.target.value)} variant='standard' size='small' autoFocus disabled={busy}
                            InputLabelProps={{ style: { color: textColor } }} inputProps={{ style: { color: textColor } }} />
                        <TextField label={config.repeatPasswordLabel ?? 'Repeat new password'} value={newPassword2} type='password'
                            onChange={e => setNewPassword2(e.target.value)} variant='standard' size='small' disabled={busy}
                            InputLabelProps={{ style: { color: textColor } }} inputProps={{ style: { color: textColor } }} />
                    </>}

                    {!changingPassword && redirectMethods.length > 0 && <>
                        {hasPassword && (
                            <Typography variant='caption' sx={{ color: textColor, textAlign: 'center' }}>{config.orSeparator ?? 'or'}</Typography>
                        )}
                        {redirectMethods.length === 1
                            ? <Button variant='outlined' fullWidth disabled={busy} onClick={() => onClickIdp(redirectMethods[0])} sx={{ color: textColor, borderColor: textColor }}>
                                {config.idpButton ? config.idpButton.replace('{provider}', redirectMethods[0].label) : redirectMethods[0].label}
                              </Button>
                            : <>
                                <Button variant='outlined' fullWidth disabled={busy} endIcon={<ExpandMore />} onClick={e => setIdpAnchor(e.currentTarget)} sx={{ color: textColor, borderColor: textColor, justifyContent: 'space-between' }}>
                                    {config.idpButton ?? 'Log in with...'}
                                </Button>
                                <Menu anchorEl={idpAnchor} open={Boolean(idpAnchor)} onClose={() => setIdpAnchor(null)} PaperProps={{ sx: { minWidth: idpAnchor?.offsetWidth } }}>
                                    {redirectMethods.map(m => (
                                        <MenuItem key={m.id} disabled={busy} onClick={() => { setIdpAnchor(null); onClickIdp(m) }}>{m.label}</MenuItem>
                                    ))}
                                </Menu>
                              </>
                        }
                    </>}
                </Stack>

                {error && <Typography variant='caption' color='error' sx={{ mt: 1 }}>{error}</Typography>}

                {/* actions row: Change Password (left) | spacer | OK | Cancel — same as Login.tsx DialogActions */}
                <Stack direction='row' sx={{ mt: 1 }}>
                    {hasPassword && !changingPassword && (
                        <Button variant='outlined' size='small' disabled={busy || userName === '' || password === ''} onClick={doChangePassword} sx={btnSx}>
                            {config.changePasswordButton ?? 'Change password'}
                        </Button>
                    )}
                    <Typography sx={{ flexGrow: 1 }} />
                    {hasPassword && !changingPassword && (
                        <Button variant='outlined' size='small' disabled={!canSubmit} onClick={doLogin} sx={btnSx}>
                            {busy ? <CircularProgress size={16} /> : (config.okButton ?? 'Login')}
                        </Button>
                    )}
                    {changingPassword && <>
                        <Button variant='outlined' size='small' disabled={busy || !newPassword1 || newPassword1 !== newPassword2} onClick={doChangePassword} sx={btnSx}>
                            {busy ? <CircularProgress size={16} /> : (config.okButton ?? 'OK')}
                        </Button>
                        <Button variant='outlined' size='small' onClick={() => setChangingPassword(false)} sx={{ ml: 1, ...btnSx }}>Cancel</Button>
                    </>}
                </Stack>
            </Box>
        </Box>
    )
}

export { LoginExtensionPage }
