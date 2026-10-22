import React, { useState, useEffect, useContext } from 'react'
import { sha256 as sha256js } from 'js-sha256'
import { Alert, Box, Button, Checkbox, Chip, Divider, Dialog, DialogActions, DialogContent, FormControl, FormControlLabel, InputLabel, List, ListItem, ListItemButton, ListSubheader, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { MsgBoxButtons, MsgBoxOkError, MsgBoxYesNo } from '../../tools/MsgBox'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { DialogTitleHelp, docsUrl } from '@kwirthmagnify/kwirth-common-front'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { IUser, IExtensionScope, ESignupStatus, ISignupApproval, ISignupRequest } from '@kwirthmagnify/kwirth-common'
import { ResourceEditor } from './ResourceEditor'
import copy from 'clipboard-copy'

interface IManageUserSecurityProps {
    onClose:() => void
}

const ManageUserSecurity: React.FC<IManageUserSecurityProps> = (props:IManageUserSecurityProps) => {
    const {accessString, backendUrl} = useContext(SessionContext) as SessionContextType
    const [users, setUsers] = useState<string[]>([])
    const [selectedUser, setSelectedUser] = useState<IUser|undefined>(undefined)
    const [msgBox, setMsgBox] = useState(<></>)

    const [id, setId] = useState<string>('')
    const [name, setName] = useState<string>('')
    const [password, setPassword] = useState<string>('')
    const [allResources, setAllResources] = useState<string[]>([])
    const [idp, setIdp] = useState<string>('')
    const [startChannel, setStartChannel] = useState<string>('')
    const [exitFullScreen, setExitFullScreen] = useState<boolean>(true)
    const [enabledChannels, setEnabledChannels] = useState<string>('')
    const [idps, setIdps] = useState<{id:string, label:string}[]>([])
    const [scopeCatalog, setScopeCatalog] = useState<IExtensionScope[]>([])
    // signup requests (plan: plans/completed/signup). While one is selected the editor is reviewing it, not a user:
    // the id, name and IdP are the request's and what is edited is what the new user will get.
    const [signups, setSignups] = useState<ISignupRequest[]>([])
    const [selectedSignup, setSelectedSignup] = useState<ISignupRequest|undefined>(undefined)

    const getSignups = async () => {
        try {
            let response = await fetch(`${backendUrl}/core/signups`, addGetAuthorization(accessString))
            if (response.ok) setSignups(await response.json())
        }
        catch {}
    }

    const clearEditor = () => {
        setSelectedUser(undefined)
        setSelectedSignup(undefined)
        setId('')
        setName('')
        setPassword('')
        setAllResources([])
        setIdp('')
        setStartChannel('')
        setExitFullScreen(true)
        setEnabledChannels('')
    }

    const onClickSignup = (request: ISignupRequest) => {
        clearEditor()
        setSelectedSignup(request)
        setId(request.id)
        setName(request.name)
        setIdp(request.idp)
    }

    const onClickApprove = async () => {
        if (!selectedSignup) return
        const approval: ISignupApproval = {
            resources: allResources.join(';'),
            startChannel: startChannel || undefined,
            exitFullScreen,
            enabledChannels: enabledChannels ? enabledChannels.split(',').map(s => s.trim()).filter(Boolean) : undefined
        }
        try {
            const res = await fetch(`${backendUrl}/core/signups/${encodeURIComponent(selectedSignup.id)}/approve`, addPostAuthorization(accessString, JSON.stringify(approval)))
            if (!res.ok) {
                const detail = await res.json().catch(() => ({}))
                setMsgBox(MsgBoxOkError('User management', `Could not approve the request (${detail.error ?? `HTTP ${res.status}`}).`, setMsgBox))
                return
            }
        }
        catch (err) {
            setMsgBox(MsgBoxOkError('User management', `Error approving the request: ${err}`, setMsgBox))
            return
        }
        clearEditor()
        getUsers()
        getSignups()
    }

    const onClickReject = () => {
        if (!selectedSignup) return
        setMsgBox(MsgBoxYesNo('Reject request', `Reject the access request of ${selectedSignup.id}? They will be told it was rejected, and will not be able to ask again until you delete the request.`, setMsgBox, (a:MsgBoxButtons) => a===MsgBoxButtons.Yes ? onConfirmReject() : {}))
    }

    const onClickDeleteSignup = () => {
        if (!selectedSignup) return
        setMsgBox(MsgBoxYesNo('Delete request', `Delete the access request of ${selectedSignup.id}? They will be able to ask again.`, setMsgBox, (a:MsgBoxButtons) => a===MsgBoxButtons.Yes ? onConfirmDeleteSignup() : {}))
    }

    const signupUrl = (request: ISignupRequest) => `${backendUrl}/core/signups/${encodeURIComponent(request.id)}`

    // what reject and delete share: run the call, report a failure, and on success leave the editor empty
    const runSignupAction = async (call: () => Promise<Response>, what: string) => {
        try {
            const res = await call()
            if (!res.ok) {
                setMsgBox(MsgBoxOkError('User management', `Could not ${what} the request (HTTP ${res.status}).`, setMsgBox))
                return
            }
        }
        catch (err) {
            setMsgBox(MsgBoxOkError('User management', `Error: ${err}`, setMsgBox))
            return
        }
        clearEditor()
        getSignups()
    }

    const onConfirmReject = () => {
        if (selectedSignup) runSignupAction(() => fetch(`${signupUrl(selectedSignup)}/reject`, addPostAuthorization(accessString, '{}')), 'reject')
    }

    const onConfirmDeleteSignup = () => {
        if (selectedSignup) runSignupAction(() => fetch(signupUrl(selectedSignup), addDeleteAuthorization(accessString)), 'delete')
    }

    // the global catalogue of RBAC scopes (built-in + plugins), served by the core → it populates the resource editor
    const getScopeCatalog = async () => {
        try {
            let response = await fetch(`${backendUrl}/core/scopes`, addGetAuthorization(accessString))
            if (response.ok) setScopeCatalog(await response.json())
        }
        catch {}
    }

    const getUsers = async () => {
        let response = await fetch(`${backendUrl}/user`, addGetAuthorization(accessString))
        let userList:string[] = await response.json()
        setUsers(userList)
    }

    // enabled IdP instances, for assigning a user to an IdP (the IUser.idp binding)
    const getIdps = async () => {
        try {
            let response = await fetch(`${backendUrl}/core/idps/instances`, addGetAuthorization(accessString))
            if (response.ok) {
                let list:{id:string, label:string, enabled:boolean}[] = await response.json()
                setIdps(list.filter(i => i.enabled).map(i => ({ id: i.id, label: i.label })))
            }
        }
        catch {}
    }

    useEffect( () => {
        getUsers()
        getIdps()
        getScopeCatalog()
        getSignups()
    },[])

    const sha256 = (s: string): string => sha256js(s)

    const onClickUser = async (id:string) => {
        let user:IUser = (await (await fetch(`${backendUrl}/user/${id}`, addGetAuthorization(accessString))).json())
        setSelectedSignup(undefined)
        setId(id)
        setSelectedUser(user)
        setName(user.name||'')
        setPassword('')
        setAllResources(user.resources.split(';'))
        setIdp(user.idp||'')
        setStartChannel(user.startChannel||'')
        setExitFullScreen(user.exitFullScreen !== false)
        setEnabledChannels(user.enabledChannels?.join(',') || '')
    }

    const onClickCopyPassword = () => {
        if (password!!=='') copy(password)
    }

    const onClickSave= async () => {
        let user = {
            id,
            name,
            password: password !== '' ? sha256(password) : '',
            resources: allResources.join(';'),
            idp,
            startChannel: startChannel || undefined,
            exitFullScreen,
            enabledChannels: enabledChannels ? enabledChannels.split(',').map(s => s.trim()).filter(Boolean) : undefined
        }
        let payload = JSON.stringify(user)
        try {
            let res
            if (selectedUser !== undefined) {
                res = await fetch(`${backendUrl}/user/${user.id}`, addPutAuthorization(accessString, payload))
            }
            else {
                res = await fetch(`${backendUrl}/user`, addPostAuthorization(accessString, payload))
            }
            if (!res.ok) {
                setMsgBox(MsgBoxOkError('User management', `Could not save user (HTTP ${res.status}).`, setMsgBox))
                return
            }
        }
        catch (err) {
            setMsgBox(MsgBoxOkError('User management', `Error saving user: ${err}`, setMsgBox))
            return
        }
        setSelectedUser(undefined)
        setId('')
        setName('')
        setPassword('')
        setAllResources([])
        setIdp('')
        setStartChannel('')
        setExitFullScreen(true)
        setEnabledChannels('')
        getUsers()
    }

    const onClickNew= () => {
        setSelectedUser(undefined)
        setSelectedSignup(undefined)
        setId('')
        var pwd=''
        for (var i=0;i<8;i++) {
            var pos = Math.random()*60
            pwd+='ABCDEFGHJKMNOPQRSTUVWXYZabcdefghjkmnopqrstuvwxyz23456789.-#$'.substring(pos,pos+1)
        }
        setName('')
        setPassword(pwd)
        setAllResources([])
        setIdp('')
        setStartChannel('')
        setExitFullScreen(true)
        setEnabledChannels('')
    }

    const onClickDelete= () => {
        setMsgBox(MsgBoxYesNo('Delete user',`Are you sure you want to delete user ${selectedUser?.id}?`, setMsgBox, (a:MsgBoxButtons)=> a===MsgBoxButtons.Yes? onConfirmDelete() : {}))
    }

    const onConfirmDelete= async () => {
        if (selectedUser!==undefined) {
            await fetch(`${backendUrl}/user/${selectedUser.id}`, addDeleteAuthorization(accessString))
            setId('')
            setName('')
            setPassword('')
            setAllResources([])
            setIdp('')
            setStartChannel('')
            setExitFullScreen(true)
            setEnabledChannels('')
            getUsers()
        }
    }

    return (<>
        <Dialog open={true} maxWidth={false} disableEnforceFocus PaperProps={{ sx: { width: 1080 } }}>
            <DialogTitleHelp section='guide/admin/03-user-management?id=user-fields' docsUrl={docsUrl(backendUrl, 'core', 'kwirth')}>User management</DialogTitleHelp>
            <DialogContent>
                <Stack sx={{ display: 'flex', flexDirection: 'row' }}>
                    {/* The dialog takes the size of its content, and the content has a fixed shape. The editor
                        on the right sets the height; the left column only stretches to it: the list scrolls
                        inside (flex-basis 0, so it never pushes) and the request's detail has a slot of its
                        own at the foot, reserved even when empty. Selecting anything moves nothing. */}
                    <Stack sx={{ mr: 3, width: '30vh', flexShrink: 0 }}>
                    <List sx={{ flex: '1 1 0', overflowY: 'auto', minHeight: 0 }}>
                        { users?.map(u =>
                        <ListItemButton key={u} selected={u===selectedUser?.id} onClick={() => onClickUser(u)}>
                            <ListItem>{u}</ListItem>
                        </ListItemButton>
                        )}
                        { signups.length > 0 && <>
                            <ListSubheader disableSticky data-testid='signup-requests-header'>
                                Access requests ({signups.filter(r => r.status === ESignupStatus.PENDING).length} pending)
                            </ListSubheader>
                            { signups.map(r =>
                            <ListItemButton key={`signup-${r.id}`} selected={r.id===selectedSignup?.id} onClick={() => onClickSignup(r)} data-testid={`signup-request-${r.id}`}>
                                <ListItem sx={{ gap: 1 }}>
                                    <Typography noWrap sx={{ flexGrow: 1, minWidth: 0 }}>{r.id}</Typography>
                                    <Chip size='small' variant='outlined' label={r.status} color={r.status === ESignupStatus.PENDING ? 'warning' : 'default'} />
                                </ListItem>
                            </ListItemButton>
                            )}
                        </>}
                    </List>
                    <Box sx={{ height: 110, mt: 1, flexShrink: 0, overflowY: 'auto' }}>
                    { selectedSignup &&
                        <Alert severity={selectedSignup.status === ESignupStatus.PENDING ? 'info' : 'warning'} variant='outlined' data-testid='signup-request-detail'
                            sx={{ py: 0, px: 1, fontSize: '0.75rem', '& .MuiAlert-icon': { fontSize: 18, mr: 1 } }}>
                            {selectedSignup.status === ESignupStatus.PENDING
                                ? 'Access request: give it resources and approve it, or reject it.'
                                : 'Rejected. Delete it to let them ask again, or approve it anyway.'}
                            <br/>{`Requested ${new Date(selectedSignup.requestedAt).toLocaleString()}`}
                            { selectedSignup.comment && <><br/><i>"{selectedSignup.comment}"</i></> }
                        </Alert>
                    }
                    </Box>
                    </Stack>

                    <Stack spacing={1} sx={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                        <Stack spacing={1} direction='row'>
                            <TextField value={id} onChange={(e) => setId(e.target.value)} variant='standard' fullWidth label={idp!=='' ? 'Id (email)' : 'Id'} disabled={selectedSignup !== undefined} />
                            <TextField value={name} onChange={(e) => setName(e.target.value)} variant='standard' fullWidth label='Name' disabled={selectedSignup !== undefined} />
                            <TextField value={password} onChange={(e) => setPassword(e.target.value)} type='password' variant='standard' fullWidth label='Password' disabled={idp!==''} placeholder={selectedUser !== undefined ? 'Leave blank to keep current' : ''} />
                            <FormControl variant='standard' fullWidth disabled={selectedSignup !== undefined}>
                                <InputLabel>IdP</InputLabel>
                                <Select value={idp} label='IdP' onChange={(e) => setIdp(e.target.value)}>
                                    <MenuItem value=''>Local (user/password)</MenuItem>
                                    { idps.map(i => <MenuItem key={i.id} value={i.id}>{i.label || i.id}</MenuItem>) }
                                </Select>
                            </FormControl>
                        </Stack>
                        <Stack direction='row' spacing={2} alignItems='center'>
                            <TextField value={startChannel} onChange={(e) => setStartChannel(e.target.value)} variant='standard' label='Auto-start channel' placeholder='e.g. magnify' sx={{ width: '30%' }} />
                            <TextField value={enabledChannels} onChange={(e) => setEnabledChannels(e.target.value)} variant='standard' label='Enabled channels' placeholder='e.g. magnify,ops (empty = all)' sx={{ width: '30%' }} />
                            <FormControlLabel control={<Checkbox checked={exitFullScreen} onChange={(e) => setExitFullScreen(e.target.checked)} />} label='Can exit fullscreen' />
                        </Stack>

                        <ResourceEditor resources={allResources} onUpdate={(r) => setAllResources(r)} scopeCatalog={scopeCatalog}/>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                {/* Every button is always there, in the same place: what is selected only enables or
                    disables them. The user ones act on a user; the request ones on an access request. */}
                <Stack direction='row' spacing={1} alignItems='center' sx={{ '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
                    <Button variant='outlined' size='small' onClick={onClickNew}>New</Button>
                    <Button variant='outlined' size='small' onClick={onClickSave} disabled={selectedSignup !== undefined || id==='' || (idp==='' && password==='' && selectedUser===undefined)}>Save</Button>
                    <Button variant='outlined' size='small' onClick={onClickCopyPassword} disabled={selectedSignup !== undefined || password===''}>Copy password</Button>
                    <Button variant='outlined' size='small' onClick={onClickDelete} disabled={selectedUser === undefined || id==='admin'}>Delete</Button>
                    <Divider orientation='vertical' flexItem />
                    <Button variant='outlined' size='small' onClick={onClickApprove} disabled={selectedSignup === undefined || allResources.length === 0}>Approve</Button>
                    <Button variant='outlined' size='small' onClick={onClickReject} disabled={selectedSignup?.status !== ESignupStatus.PENDING}>Reject</Button>
                    <Button variant='outlined' size='small' onClick={onClickDeleteSignup} disabled={selectedSignup === undefined}>Delete request</Button>
                </Stack>
                <Typography sx={{ flexGrow: 1 }} />
                <Button variant='outlined' size='small' onClick={() => props.onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { ManageUserSecurity }
