import React, { useState, useContext } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem, Stack, TextField, Typography} from '@mui/material'
import { ExpandMore } from '../tools/KwirthIcons'
import { MsgBoxOkError, MsgBoxOkWarning } from '../tools/MsgBox'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addPostAuthorization } from '../tools/AuthorizationManagement'
import { EAuthMethodKind, IAuthMethod, ILoginResponse, IUser } from '@kwirthmagnify/kwirth-common'

interface ILoginProps {
    methods: IAuthMethod[]
    onClose:(user:IUser|undefined, firstTime:boolean) => void
}

const Login: React.FC<ILoginProps> = (props:ILoginProps) => {
    const {backendUrl} = useContext(SessionContext) as SessionContextType
    const [msgBox, setMsgBox] = useState(<></>)
    const [user, setUser] = useState('')
    const [changingPassword, setChangingPassword] = useState(false)
    const [firstTime, setFirstTime] = useState(false)
    const [password, setPassword] = useState('')
    const [newPassword1, setNewPassword1] = useState('')
    const [newPassword2, setNewPassword2] = useState('')
    const [idpAnchor, setIdpAnchor] = useState<null | HTMLElement>(null)

    const login = async (user:string, password:string, newpassword:string='') => {
        let response = undefined
        if (newpassword!=='') {
            try {
                response = await fetch(backendUrl+'/login/password', addPostAuthorization('', JSON.stringify({user, password, newpassword})))
            }
            catch {}
        }
        else {
            try {
                response = await fetch(backendUrl+'/login', addPostAuthorization('', JSON.stringify({user, password})))
            }
            catch {}
        }
        return response
    }

    const loginOk = (response:ILoginResponse) => {
        let user:IUser={
            id: response.id,
            name: response.name,
            password: '',
            accessKey: response.accessKey,
            resources: ''
        }
        props.onClose(user, firstTime)
    }

    const onClickCancel = async () => {
        props.onClose(undefined, firstTime)
    }

    const onClickOk = async () => {
        let result
        if(changingPassword) {
            if (newPassword1 === newPassword2) {
                result = await login(user,password,newPassword1)
                if (result && result.status===200) {
                    setUser('')
                    setPassword('')
                    loginOk(await result.json())
                }
                else {
                    setMsgBox(MsgBoxOkWarning('Login',`Password could not be changesd.`, setMsgBox))
                    setUser('')
                    setPassword('')
                    setChangingPassword(false)
                }
            }
        }
        else {
            result = await login(user.trim(),password)
            if (result) {
                switch (result.status) {
                    case 200:
                        setUser('')
                        setPassword('')
                        loginOk(await result.json())
                        break
                    case 201:
                        if (user==='admin' && password==='password') setFirstTime(true)
                        setNewPassword1('')
                        setNewPassword2('')
                        setChangingPassword(true)
                        break
                    case 401:
                        setMsgBox(MsgBoxOkError('Login',`You have entered invalid credentials.`, setMsgBox))
                        break
                    case 403:
                        setMsgBox(MsgBoxOkError('Login',`Access has been denied.`, setMsgBox))
                        break
                    case 503:
                        setMsgBox(MsgBoxOkError('Login',`Backend seems to be starting or in error (error 503).`, setMsgBox))
                        break
                    default:
                        setMsgBox(MsgBoxOkError('Login',`Unknown error.`, setMsgBox))
                        break
                }
            }
            else {
                setMsgBox(MsgBoxOkError('Login',`Error validating credentials, cannot access Kwirth backend.`, setMsgBox))
            }
        }
    }

    const onClickChangePassword = async () => {
        var result=await login(user,password)
        if (result && result.status === 200) setChangingPassword(true)
    }

    // si no llegan metodos (back antiguo) mantenemos el formulario user/pass por compatibilidad
    const hasPassword = props.methods.length === 0 || props.methods.some(m => m.kind === EAuthMethodKind.PASSWORD)
    const redirectMethods = props.methods.filter(m => m.kind === EAuthMethodKind.REDIRECT)
    const onClickIdp = (method:IAuthMethod) => {
        if (!method.startUrl) return
        // el front aporta a dónde volver (su propia URL); el back solo la respeta si es localhost o mismo-origen
        const returnTo = window.location.origin + window.location.pathname
        window.location.href = `${backendUrl}${method.startUrl}?returnTo=${encodeURIComponent(returnTo)}`
    }

    const okDisabled = (changingPassword && (newPassword1 !== newPassword2 || newPassword1 === '')) || user === '' || password === ''

    return (<>
        <Dialog open={true} disableRestoreFocus={true} fullWidth maxWidth={'xs'}
            onKeyDown={e => { if (e.key === 'Enter' && !okDisabled) onClickOk() }}>
            <DialogTitle>Enter credentials</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column'}}>
                    { !changingPassword && hasPassword && <>
                        <TextField value={user} onChange={(ev) => setUser(ev.target.value)} variant='standard'label='User' autoFocus></TextField>
                        <TextField value={password} onChange={(ev) => setPassword(ev.target.value)} type='password' variant='standard'label='Password'></TextField>
                    </>}
                    { changingPassword && <>
                        <Typography>Your login has been succesful, you can now change your password.</Typography>
                        <TextField value={newPassword1} onChange={(ev) => setNewPassword1(ev.target.value)} type='password' variant='standard' label='New Password' autoFocus></TextField>
                        <TextField value={newPassword2} onChange={(ev) => setNewPassword2(ev.target.value)} type='password' variant='standard' label='Repeat New Password'></TextField>
                    </>}
                    { !changingPassword && redirectMethods.length > 0 && <>
                        { hasPassword && <Typography variant='caption' sx={{ textAlign:'center', color:'text.secondary' }}>or</Typography> }
                        { redirectMethods.length === 1
                            ? <Button variant='outlined' onClick={() => onClickIdp(redirectMethods[0])}>{redirectMethods[0].label}</Button>
                            : <>
                                <Button variant='outlined' fullWidth endIcon={<ExpandMore/>} onClick={(e) => setIdpAnchor(e.currentTarget)} sx={{ justifyContent: 'space-between' }}>Log in with...</Button>
                                <Menu anchorEl={idpAnchor} open={Boolean(idpAnchor)} onClose={() => setIdpAnchor(null)}
                                    PaperProps={{ sx: { minWidth: idpAnchor?.offsetWidth } }}>
                                    { redirectMethods.map(m => <MenuItem key={m.id} onClick={() => { setIdpAnchor(null); onClickIdp(m) }}>{m.label}</MenuItem>) }
                                </Menu>
                            </>
                        }
                    </>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Stack direction='row' flex={1} sx={{ml:2, mr:2}}>
                    { hasPassword && <Button variant='outlined' onClick={onClickChangePassword} disabled={user === '' || password === ''} sx={{display:changingPassword?'none':'block'}}>Change Password</Button> }
                    <Typography sx={{ flexGrow:1}}></Typography>
                    { hasPassword && <Button variant='outlined' onClick={onClickOk} disabled={okDisabled}>OK</Button> }
                    {
                        changingPassword && <Button variant='outlined' onClick={onClickCancel}>Cancel</Button>
                    }
                </Stack>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { Login }
