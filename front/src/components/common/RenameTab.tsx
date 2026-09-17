import React, { useState, ChangeEvent } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { ITabObject } from '../../model/ITabObject'

interface IRenameTabProps {
    onClose:(a:string|undefined) => void
    tabs: ITabObject[]
    oldname?: string
}

const RenameTab: React.FC<IRenameTabProps> = (props:IRenameTabProps) => {
    const [newname, setNewname] = useState(props.oldname)

    const onChangeNewname = (event:ChangeEvent<HTMLInputElement>) => {
        setNewname(event.target.value)
    }

    return (<>
        <Dialog open={true} disableRestoreFocus={true}>
            <DialogTitle>Rename tab</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ display: 'flex', flexDirection: 'column', width: '50vh' }}>
                    <Typography>Old name: {props.oldname}</Typography>
                    <TextField value={newname} onChange={onChangeNewname} variant='standard'label='New name' autoFocus></TextField>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onClose(newname)} disabled={props.tabs.some(t => t.name===newname)}>OK</Button>
                <Button onClick={() => props.onClose(undefined)}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    </>)
}

export { RenameTab }