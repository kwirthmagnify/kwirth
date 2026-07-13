import { useState } from 'react'
import { Stack, Button, Dialog, DialogActions, DialogContent, TextField } from '@mui/material'
import { DialogTitleHelp } from '../DialogTitleHelp'

interface ISaveWorkspaceProps {
    onClose:(name?:string, description?:string) => void
    name:string
    description:string
    values:IValue[]
}

interface IValue {
    name:string,
    description:string
}

const SaveWorkspace: React.FC<ISaveWorkspaceProps> = (props:ISaveWorkspaceProps) => {
    const [newname, setNewname] = useState(props.name)
    const [desc, setDesc] = useState(props.description)

    return (
        <Dialog open={true} disableRestoreFocus={true}>
            <DialogTitleHelp section='guide/user/06-workspaces?id=saving-your-work'>Save workspace as...</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' spacing={2} sx={{width:'40vh'}}>
                    <TextField value={newname} onChange={(e) => setNewname(e.target.value)} variant='standard' label='New name' autoFocus ></TextField>
                    <TextField value={desc} onChange={(e) => setDesc(e.target.value)} variant='standard' label='Description' ></TextField>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onClose(newname, desc)} disabled={Boolean(props.values.find(b => b.name === newname))}>OK</Button>
                <Button onClick={() => props.onClose()}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { SaveWorkspace }