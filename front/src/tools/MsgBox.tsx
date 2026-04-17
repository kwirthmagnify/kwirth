import { Info, Warning, Error, HelpOutline } from '@mui/icons-material';
import { Stack, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, CircularProgress, Box } from '@mui/material';
import { Dispatch, SetStateAction } from 'react';

enum MsgBoxButtons {
    None=0,
    Ok=1,
    Yes=2,
    YesToAll=4,
    No=8,
    NoToAll=16,
    Cancel=32
}

const MsgBoxWait = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxWaitShow(title,message,onClose, MsgBoxButtons.None, <Info fontSize='large' color='info'/>, onResult)
const MsgBoxWaitCancel = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxWaitShow(title,message,onClose, MsgBoxButtons.Cancel, <Info fontSize='large' color='info'/>, onResult)
const MsgBoxOk = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxShow(title,message,onClose, MsgBoxButtons.Ok, <Info fontSize='large' color='info'/>, onResult)
const MsgBoxOkWarning = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxShow(title,message,onClose, MsgBoxButtons.Ok, <Warning fontSize='large' color='warning'/>, onResult)
const MsgBoxOkError = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxShow(title,message,onClose, MsgBoxButtons.Ok, <Error fontSize='large' color='error'/>, onResult)
const MsgBoxOkCancel = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxShow(title,message,onClose, MsgBoxButtons.Ok+MsgBoxButtons.Cancel, <HelpOutline fontSize='large' color='primary'/>, onResult)
const MsgBoxYesNo = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxShow(title,message,onClose, MsgBoxButtons.Yes+MsgBoxButtons.No, <HelpOutline fontSize='large' color='primary'/>, onResult)
const MsgBoxYesNoCancel = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, onResult?:(a:MsgBoxButtons)=>void) => MsgBoxShow(title,message,onClose, MsgBoxButtons.Yes+MsgBoxButtons.No+MsgBoxButtons.Cancel, <HelpOutline  fontSize='large' color='primary'/>, onResult)

const MsgBoxShow = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, buttons:MsgBoxButtons, icon:JSX.Element, onResult?:(a:MsgBoxButtons)=>void) => {
    return (
        <Dialog open={true} onClose={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.Cancel)}}>
            <DialogTitle>
                {title}
            </DialogTitle>
            <DialogContent>
                <Stack sx={{mt:2}} direction='row' alignItems={'center'}>
                    {icon}
                    <Box sx={{width:'12px'}}/>
                    { typeof(message)==='string' ?
                        <Typography component={'div'}><div dangerouslySetInnerHTML={{__html: message}}/></Typography>
                        :
                        message
                        }                        
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: '4px 4px' }}>
                { (buttons & MsgBoxButtons.Ok)? <Button onClick={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.Ok)}}>ok</Button>:<></>}
                { (buttons & MsgBoxButtons.Yes)? <Button onClick={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.Yes)}}>yes</Button>:<></>}
                { (buttons & MsgBoxButtons.No)? <Button onClick={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.No)}}>no</Button>:<></>}
                { (buttons & MsgBoxButtons.Cancel)? <Button onClick={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.Cancel)}}>cancel</Button>:<></>}
            </DialogActions>
        </Dialog>
    )
}

const MsgBoxWaitShow = (title:string, message:string|JSX.Element, onClose:Dispatch<SetStateAction<JSX.Element>>, buttons:MsgBoxButtons, icon:JSX.Element, onResult?:(a:MsgBoxButtons)=>void) => {
    return (
        <Dialog open={true}>
            <DialogTitle>
                {title}
            </DialogTitle>
            <DialogContent>
                <Stack direction={'row'} alignItems={'center'} alignContent={'center'} sx={{m:2}}>
                    <Box>
                        <CircularProgress size={50} />
                    </Box>
                        { typeof(message)==='string' ?
                            <Typography sx={{ml:4}} component={'div'}>
                                <div dangerouslySetInnerHTML={{__html: message}}/>
                            </Typography>
                            :
                            message
                        }
                </Stack>                
            </DialogContent>
            <DialogActions>
                { (buttons & MsgBoxButtons.Cancel)? <Button onClick={() => { onClose(<></>); if (onResult) onResult(MsgBoxButtons.Cancel)}}>cancel</Button>:<></> }
            </DialogActions>
        </Dialog>
    )
}

export { MsgBoxButtons, MsgBoxOk, MsgBoxOkWarning, MsgBoxOkError, MsgBoxOkCancel, MsgBoxYesNo, MsgBoxYesNoCancel, MsgBoxWait, MsgBoxWaitCancel }