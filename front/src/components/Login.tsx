import React, { useState, useContext } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography} from '@mui/material'
import { MsgBoxOkError, MsgBoxOkWarning } from '../tools/MsgBox'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { addPostAuthorization } from '../tools/AuthorizationManagement'
import { ILoginResponse, IUser } from '@kwirthmagnify/kwirth-common'

interface ILoginProps {
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

    return (<>
        <Dialog open={true} disableRestoreFocus={true} fullWidth maxWidth={'xs'}>
            <DialogTitle>Enter credentials</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column'}}>
                    { !changingPassword && <>
                        <TextField value={user} onChange={(ev) => setUser(ev.target.value)} variant='standard'label='User' autoFocus></TextField>
                        <TextField value={password} onChange={(ev) => setPassword(ev.target.value)} type='password' variant='standard'label='Password'></TextField>
                    </>}
                    { changingPassword && <>
                        <Typography>Your login has been succesful, you can now change your password.</Typography>
                        <TextField value={newPassword1} onChange={(ev) => setNewPassword1(ev.target.value)} type='password' variant='standard' label='New Password' autoFocus></TextField>
                        <TextField value={newPassword2} onChange={(ev) => setNewPassword2(ev.target.value)} type='password' variant='standard' label='Repeat New Password'></TextField>
                    </>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Stack direction='row' flex={1} sx={{ml:2, mr:2}}>
                    <Button onClick={onClickChangePassword} sx={{display:changingPassword?'none':'block'}}>Change Password</Button>
                    <Typography sx={{ flexGrow:1}}></Typography>
                    <Button onClick={onClickOk} disabled={((changingPassword && (newPassword1!==newPassword2 || newPassword1==='')) || user==='' || password==='')}>OK</Button>
                    {
                        changingPassword && <Button onClick={onClickCancel}>Cancel</Button>
                    }
                </Stack>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { Login }
