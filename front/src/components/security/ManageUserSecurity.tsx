import React, { useState, useEffect, useContext } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItem, ListItemButton, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { MsgBoxButtons, MsgBoxOkError, MsgBoxYesNo } from '../../tools/MsgBox'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { IUser, IExtensionScope } from '@kwirthmagnify/kwirth-common'
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
    const [idps, setIdps] = useState<{id:string, label:string}[]>([])
    const [scopeCatalog, setScopeCatalog] = useState<IExtensionScope[]>([])

    // catálogo global de scopes RBAC (built-in + plugins), servido por el core → puebla el editor de recursos
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

    // instancias de IdP habilitadas, para asignar un usuario a un IdP (binding IUser.idp)
    const getIdps = async () => {
        try {
            let response = await fetch(`${backendUrl}/idp`, addGetAuthorization(accessString))
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
    },[])

    const onClickUser = async (id:string) => {
        let user:IUser = (await (await fetch(`${backendUrl}/user/${id}`, addGetAuthorization(accessString))).json())
        setId(id)
        setSelectedUser(user)
        setName(user.name||'')
        setPassword(user.password||'')
        setAllResources(user.resources.split(';'))
        setIdp(user.idp||'')
    }

    const onClickCopyPassword = () => {
        if (password!!=='') copy(password)
    }

    const onClickSave= async () => {
        let user = { id, name, password, resources: allResources.join(';'), idp }
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
        getUsers()
    }

    const onClickNew= () => {
        setSelectedUser(undefined)
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
            getUsers()
        }
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='md'>
            <DialogTitle>User management</DialogTitle>
            <DialogContent>
                <Stack sx={{ display: 'flex', flexDirection: 'row' }}>
                    <List sx={{ flexGrow: 1, mr: 3, width: '30vh' }}>
                        { users?.map(u =>
                        <ListItemButton key={u} selected={u===selectedUser?.id} onClick={() => onClickUser(u)}>
                            <ListItem>{u}</ListItem>
                        </ListItemButton>
                        )}
                    </List>

                    <Stack spacing={1} sx={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                        <Stack spacing={1} direction='row'>
                            <TextField value={id} onChange={(e) => setId(e.target.value)} variant='standard' fullWidth label={idp!=='' ? 'Id (email)' : 'Id'} />
                            <TextField value={name} onChange={(e) => setName(e.target.value)} variant='standard' fullWidth label='Name' />
                            <TextField value={password} onChange={(e) => setPassword(e.target.value)} type='password' variant='standard' fullWidth label='Password' disabled={idp!==''} />
                            <FormControl variant='standard' fullWidth>
                                <InputLabel>IdP</InputLabel>
                                <Select value={idp} label='IdP' onChange={(e) => setIdp(e.target.value)}>
                                    <MenuItem value=''>Local (user/password)</MenuItem>
                                    { idps.map(i => <MenuItem key={i.id} value={i.id}>{i.label || i.id}</MenuItem>) }
                                </Select>
                            </FormControl>
                        </Stack>

                        <ResourceEditor resources={allResources} onUpdate={(r) => setAllResources(r)} scopeCatalog={scopeCatalog}/>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Stack direction='row' spacing={1}>
                    <Button variant='outlined' onClick={onClickNew}>New</Button>
                    <Button variant='outlined' onClick={onClickSave} disabled={id==='' || (idp==='' && password==='')}>Save</Button>
                    <Button variant='outlined' onClick={onClickCopyPassword} disabled={password===''}>Copy password</Button>
                    <Button variant='outlined' onClick={onClickDelete} disabled={id==='admin'}>Delete</Button>
                </Stack>
                <Typography sx={{ flexGrow: 1 }} />
                <Button variant='outlined' onClick={() => props.onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { ManageUserSecurity }
