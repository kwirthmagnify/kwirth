import { Stack, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, List , ListItemButton , ListItem } from '@mui/material'
import { PickListConfig } from '../../model/PickListConfig'

interface IPickListProps {
    config:PickListConfig
}

const PickList: React.FC<IPickListProps> = (props:IPickListProps) => {
    return (
        <Dialog open={true}>
            <DialogTitle>
                {props.config.title}
            </DialogTitle>
            <DialogContent>
                <Stack direction='column' sx={{width:'50vh'}}>
                    <Typography>{props.config.message}</Typography>
                    <List>
                        {props.config.values?.map(v => <ListItemButton onClick={() => props.config.onClose(v)}><ListItem key={v}>{v}</ListItem></ListItemButton>)}
                    </List>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => props.config.onClose(null)}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export default PickList