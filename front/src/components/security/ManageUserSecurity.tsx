import React, { useState, useEffect, useContext } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemButton, Stack, TextField, Typography } from '@mui/material'
import { MsgBoxButtons, MsgBoxYesNo } from '../../tools/MsgBox'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { IUser } from '@kwirthmagnify/kwirth-common'
import { ResourceEditor } from './ResourceEditor'
const copy = require('clipboard-copy')

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
   
    const getUsers = async () => {
        let response = await fetch(`${backendUrl}/user`, addGetAuthorization(accessString))
        let userList:string[] = await response.json()
        setUsers(userList)
    }

    useEffect( () => {
        getUsers()
    },[])

    const onClickUser = async (id:string) => {
        let user:IUser = (await (await fetch(`${backendUrl}/user/${id}`, addGetAuthorization(accessString))).json())
        setId(id)
        setSelectedUser(user)
        setName(user.name||'')
        setPassword(user.password||'')
        setAllResources(user.resources.split(';'))
    }

    const onClickCopyPassword = () => {
        if (password!!=='') copy(password)
    }

    const onClickSave= async () => {
        let user = { id, name, password, resources: allResources.join(';') }
        let payload = JSON.stringify(user)
        if (selectedUser !== undefined) {
            await fetch(`${backendUrl}/user/${user.id}`, addPutAuthorization(accessString, payload))
        }
        else {
            await fetch(`${backendUrl}/user`, addPostAuthorization(accessString, payload))
        }
        setSelectedUser(undefined)
        setId('')
        setName('')
        setPassword('')
        setAllResources([])
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
            getUsers()
        }
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='md'>
            <DialogTitle>User management</DialogTitle>
            <DialogContent>
                <Stack sx={{ display: 'flex', flexDirection: 'row' }}>
                    <List sx={{flexGrow:1, mr:3, width:'30vh' }}>
                        { users?.map(u => 
                        <ListItemButton key={u} onClick={() => onClickUser(u)} style={{backgroundColor:(u===selectedUser?.id?'lightgray':'')}}>
                            <ListItem>{u}</ListItem>
                        </ListItemButton>
                        )}
                    </List>
                    
                    <Stack spacing={1} style={{width:'100%'}}>
                        <Stack spacing={1} direction={'row'}>
                            <TextField value={id} onChange={(e) => setId(e.target.value)} variant='standard' fullWidth label='Id'></TextField>
                            <TextField value={name} onChange={(e) => setName(e.target.value)} variant='standard' fullWidth label='Name'></TextField>
                            <TextField value={password} onChange={(e) => setPassword(e.target.value)} variant='standard' fullWidth label='Password'></TextField>
                        </Stack>

                        <ResourceEditor resources={allResources} onUpdate={(r) => setAllResources(r)}/>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Stack direction='row' spacing={1}>
                    <Button onClick={onClickNew}>NEW</Button>
                    <Button onClick={onClickSave} disabled={id==='' || password===''}>SAVE</Button>
                    <Button onClick={onClickCopyPassword} disabled={password===''}>COPY PASSWORD</Button>
                    <Button onClick={onClickDelete} disabled={id==='admin'}>DELETE</Button>
                </Stack>
                <Typography sx={{flexGrow:1}}></Typography>
                <Button onClick={() => props.onClose()}>CLOSE</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { ManageUserSecurity }