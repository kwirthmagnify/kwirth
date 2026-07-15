import React, { useState, useContext } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, Divider, FormControlLabel, Stack, Typography } from '@mui/material'
import { DialogTitleHelp } from '@kwirthmagnify/kwirth-common-front'
import { SessionContext, SessionContextType } from '../../model/SessionContext'

interface IWorkspacePickerDialogProps {
    title: string
    workspaceNames: string[]
    onConfirm: (selected: string[]) => void
    onCancel: () => void
}

const WorkspacePickerDialog: React.FC<IWorkspacePickerDialogProps> = ({ title, workspaceNames, onConfirm, onCancel }) => {
    const [selected, setSelected] = useState<string[]>([...workspaceNames])
    const { backendUrl } = useContext(SessionContext) as SessionContextType

    const toggle = (name: string) =>
        setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])

    const allChecked = selected.length === workspaceNames.length
    const toggleAll = () => setSelected(allChecked ? [] : [...workspaceNames])

    return (
        <Dialog open maxWidth='xs' fullWidth>
            <DialogTitleHelp section='guide/user/06-workspaces?id=the-workspaces-menu' docsUrl={backendUrl + '/docs/core/kwirth'}>{title}</DialogTitleHelp>
            <DialogContent>
                <Stack spacing={0.5}>
                    <FormControlLabel
                        control={<Checkbox checked={allChecked} indeterminate={selected.length > 0 && !allChecked} onChange={toggleAll} size='small' />}
                        label={<Typography variant='body2' fontWeight={500}>Select all</Typography>}
                    />
                    <Divider />
                    {workspaceNames.map(name => (
                        <FormControlLabel
                            key={name}
                            control={<Checkbox checked={selected.includes(name)} onChange={() => toggle(name)} size='small' />}
                            label={<Typography variant='body2'>{name}</Typography>}
                        />
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>Cancel</Button>
                <Button onClick={() => onConfirm(selected)} variant='contained' disabled={selected.length === 0}>
                    Confirm
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export { WorkspacePickerDialog }
