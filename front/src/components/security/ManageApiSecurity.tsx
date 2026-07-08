import React, { useState, useEffect, useContext } from 'react'
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, List, ListItemButton, MenuItem, Select, Stack, TextField, Typography} from '@mui/material'
import { MsgBoxButtons, MsgBoxYesNo } from '../../tools/MsgBox'
import { SessionContext, SessionContextType } from '../../model/SessionContext'
import { AccessKey, accessKeySerialize, ApiKey, IExtensionScope } from '@kwirthmagnify/kwirth-common'
import { addDeleteAuthorization, addGetAuthorization, addPostAuthorization, addPutAuthorization } from '../../tools/AuthorizationManagement'
import { ResourceEditor } from './ResourceEditor'
import { v4 as uuid } from 'uuid'
import copy from 'clipboard-copy'

interface IManageApiSecurityProps {
    onClose:() => void
}

const ManageApiSecurity: React.FC<IManageApiSecurityProps> = (props:IManageApiSecurityProps) => {
    const {accessString, backendUrl} = useContext(SessionContext) as SessionContextType
    const [msgBox, setMsgBox] = useState(<></>)
    const [keys, setKeys] = useState<ApiKey[]>([])
    const [selectedKey, setSelectedKey] = useState<ApiKey>()
    const [description, setDescrition] = useState<string>('')
    const [days, setDays] = useState(0)
    const [keyType, setKeyType] = useState('volatile')
    const [showPermanent, setShowPermanent] = useState<boolean>(true)
    const [showVolatile, setShowVolatile] = useState<boolean>(false)
    const [allResources, setAllResources] = useState<string[]>([])
    const [scopeCatalog, setScopeCatalog] = useState<IExtensionScope[]>([])

    const getKeys = async () => {
        let response = await fetch(`${backendUrl}/key`, addGetAuthorization(accessString))
        let data = await response.json()
        setKeys(data)
    }

    // catálogo global de scopes RBAC (built-in + plugins), servido por el core → puebla el editor de recursos
    const getScopeCatalog = async () => {
        try {
            let response = await fetch(`${backendUrl}/core/scopes`, addGetAuthorization(accessString))
            if (response.ok) setScopeCatalog(await response.json())
        }
        catch {}
    }

    useEffect( () => {
        getKeys()
        getScopeCatalog()
    },[])

    const onKeySelected = (kselected:AccessKey|null) => {
        var key = keys?.find(k => k.accessKey===kselected)
        if (key) {
            setSelectedKey(key)
            setDescrition(key.description)
            setDays(key.days)
            setAllResources(key.accessKey.resources.split(';'))
        }
    }

    const onClickCopy = () => {
        if (selectedKey) copy(accessKeySerialize(selectedKey.accessKey))
    }

    const onClickSave= async () => {
        let resources = allResources.join(';')
        let payload
        if (selectedKey) {
            selectedKey.accessKey.type=keyType
            selectedKey.accessKey.resources=resources
            let apiKey:ApiKey = { accessKey: selectedKey.accessKey, description, expire: Date.now() + days*24*60*60*1000, days }
            payload = JSON.stringify(apiKey)
            await fetch(`${backendUrl}/key/${selectedKey?.accessKey.id}`, addPutAuthorization(accessString, payload))
        }
        else {
            let accessKey:AccessKey = { type: keyType, resources, id: uuid() }
            let apiKey:ApiKey = { accessKey, description, expire: Date.now() + days*24*60*60*1000, days }
            payload = JSON.stringify(apiKey)
            await fetch(`${backendUrl}/key`, addPostAuthorization(accessString, payload))
        }
        setDescrition('')
        setDays(30)
        setAllResources([])
        await getKeys()
    }

    const onClickNew= () => {
        setSelectedKey(undefined)
        setDescrition('')
        setDays(30)
        setKeyType('permanent')
        setAllResources([])
    }

    const onClickDelete= () => {
        setMsgBox(MsgBoxYesNo('Delete API Key',`Are you sure you want to delete API Key ${selectedKey?.accessKey.id}?`, setMsgBox, (a:MsgBoxButtons)=> a===MsgBoxButtons.Yes? onConfirmDelete() : {}))
    }

    const onConfirmDelete= async () => {
        if (selectedKey) {
            await fetch(`${backendUrl}/key/${selectedKey?.accessKey.id}`, addDeleteAuthorization(accessString))
            setDescrition('')
            setDays(30)
            setAllResources([])
            getKeys()
        }
    }

    return (<>
        <Dialog open={true} fullWidth maxWidth='md'>
            <DialogTitle>API Key management</DialogTitle>
            <DialogContent sx={{ display: 'flex', height: '100%' }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: 'calc(50% - 8px)' }}>
                    <Box alignSelf='center'>
                        <Stack flexDirection='row' alignItems='center'>
                            <Checkbox checked={showPermanent} onChange={() => setShowPermanent(!showPermanent)} /><Typography variant='body2'>Permanent</Typography>
                            <Checkbox checked={showVolatile} onChange={() => setShowVolatile(!showVolatile)} /><Typography variant='body2'>Volatile</Typography>
                        </Stack>
                    </Box>

                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        <div style={{ flex: 0.9, overflowY: 'auto', overflowX: 'hidden' }}>
                            <List sx={{ flexGrow: 1, mr: 2, width: '50vh', overflowY: 'auto' }}>
                                { keys?.filter(k => (showPermanent && k.accessKey.type==='permanent') || (showVolatile && k.accessKey.type==='volatile')).map( (k,index) =>
                                    <ListItemButton key={index} selected={k.accessKey.id===selectedKey?.accessKey.id} onClick={() => onKeySelected(k.accessKey)}>
                                        <Stack direction='column'>
                                            <Typography variant='body2'>{k.accessKey.id}</Typography>
                                            <Typography variant='caption' color='text.secondary'>{`${k.description}`}<b>{` (expires: ${new Date(k.expire).toDateString()})`}</b></Typography>
                                        </Stack>
                                    </ListItemButton>
                                )}
                            </List>
                        </div>
                    </Box>
                </Box>

                <Box sx={{ flex: 1, display: 'flex', alignItems: 'start', pl: 2 }}>
                    <Stack spacing={1} sx={{ width: '100%' }}>
                        <TextField value={description} onChange={(e) => setDescrition(e.target.value)} variant='standard' label='Description' />
                        <Stack direction='row' spacing={1}>
                            <FormControl variant='standard' fullWidth>
                                <InputLabel>Lease time (days)</InputLabel>
                                <Select value={days} onChange={(e) => setDays(+e.target.value)}>
                                    { [1,2,3,4,7,30,365,36524].map( (value) => {
                                        return <MenuItem key={value} value={value}>{value}</MenuItem>
                                    })}
                                </Select>
                            </FormControl>
                            <FormControl variant='standard' fullWidth>
                                <InputLabel>Key type</InputLabel>
                                <Select labelId='keytype' value={keyType} onChange={(e) => setKeyType(e.target.value)} disabled={true}>
                                    { ['volatile','permanent'].map( (value:string) => {
                                        return <MenuItem key={value} value={value}>{value}</MenuItem>
                                    })}
                                </Select>
                            </FormControl>
                        </Stack>

                        <ResourceEditor resources={allResources} onUpdate={(r) => setAllResources(r)} scopeCatalog={scopeCatalog}/>
                    </Stack>
                </Box>
            </DialogContent>
            <DialogActions>
                <Stack direction='row' spacing={1}>
                    <Button variant='outlined' onClick={onClickNew}>New</Button>
                    <Button variant='outlined' onClick={onClickSave} disabled={
                        description==='' ||
                        days===0 ||
                        selectedKey?.accessKey.type==='volatile' ||
                        (selectedKey?.accessKey && accessKeySerialize(selectedKey.accessKey) === accessString) ||
                        allResources.length===0
                        }>Save</Button>
                    <Button variant='outlined' onClick={onClickCopy} disabled={ !selectedKey || selectedKey.accessKey.resources.length===0 }>Copy</Button>
                    <Button variant='outlined' onClick={onClickDelete} disabled={
                        selectedKey===undefined ||
                        accessKeySerialize(selectedKey?.accessKey!)===accessString ||
                        selectedKey.accessKey.type==='volatile'
                        }>Delete</Button>
                </Stack>
                <Typography sx={{ flexGrow: 1 }} />
                <Button variant='outlined' onClick={() => props.onClose()}>Close</Button>
            </DialogActions>
        </Dialog>
        {msgBox}
    </>)
}

export { ManageApiSecurity }
