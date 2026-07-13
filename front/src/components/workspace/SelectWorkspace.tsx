import { Stack, Button, Dialog, DialogActions, DialogContent, Typography, List, ListItemButton, ListItem } from '@mui/material'
import { DialogTitleHelp } from '../DialogTitleHelp'

interface ISelectWorkspaceProps {
    onSelect:(action:string, a?:string) => {},
    values:IValue[]
    action:string
}

interface IValue {
    name:string,
    description:string
}

const SelectWorkspace: React.FC<ISelectWorkspaceProps> = (props:ISelectWorkspaceProps) => {
   return (
        <Dialog open={true}>
            <DialogTitleHelp section='guide/user/06-workspaces?id=reopening-a-workspace'>Select workspace</DialogTitleHelp>
            <DialogContent>
                <Stack direction='column' sx={{width:'50vh'}}>
                    <Typography>{
                        props.action === 'delete'? 'Select workspace to delete' : 'Select workspace to load'
                    }</Typography>
                    <List>
                        {props.values?.map(v => <ListItemButton onClick={() => props.onSelect(props.action, v.name)} key={v.name}>
                            <ListItem>
                                <Stack direction={'column'}>
                                    <Typography>{v.name}</Typography>
                                    <Typography color={'darkgray'} fontSize={12}>{v.description}</Typography>
                                </Stack>
                            </ListItem>
                        </ListItemButton>)}
                    </List>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.onSelect(props.action)}>{props.action === 'load'? 'CANCEL':'CLOSE'}</Button>
            </DialogActions>
        </Dialog>
    )
}

export { SelectWorkspace }