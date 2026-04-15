import { Dispatch, SetStateAction, useEffect, useRef } from 'react'
import { Tooltip, Stack, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography,  Box, TextField } from '@mui/material'
import { InfoOutlined } from '@mui/icons-material'

interface ITextToolTipProps {
    name:string,
    help:JSX.Element
}

const TextToolTip: React.FC<ITextToolTipProps> = (props:ITextToolTipProps) => {
    return (
        <Box display="flex" alignItems="center" mt={2}>
            <Typography variant="body1">{props.name}&nbsp;</Typography>
            <Tooltip title={props.help}>
                <InfoOutlined fontSize="inherit" />
            </Tooltip>
        </Box>
    )
}

interface IInputBoxProps {
    title: string
    default?: any
    message: string|JSX.Element
    password?: boolean
    width: string
    onClose: Dispatch<SetStateAction<JSX.Element>>
    onResult?: (result:any) => void
}

const InputBox: React.FC<IInputBoxProps> = (props:IInputBoxProps) => {
    const inputRef = useRef<HTMLInputElement>(null)

    // useEffect( () => {
    //     // this is needed for not affecting other mounted components
    //     const handleKeyDown = (event: KeyboardEvent) => event.stopPropagation()
    //     window.addEventListener('keydown', handleKeyDown, true)
    //     return () => {
    //         window.removeEventListener('keydown', handleKeyDown, true)
    //     }
    // })

    if (!props.title) return <></>

    return (
        <Dialog open={true} onClose={() => { props.onClose(<></>); if (props.onResult) props.onResult(undefined)}}>
            <DialogTitle>
                {props.title}
            </DialogTitle>
            <DialogContent>
                <Stack sx={{mt:2}} direction='column' alignItems={'top'}>
                    { typeof(props.message)==='string' ?
                        <Typography component={'div'} sx={{ml:2}}><div dangerouslySetInnerHTML={{__html: props.message}}/></Typography>
                        :
                        props.message
                        }
                        {/* key forces rerender */}
                        <TextField key={props.message?.toString()} inputRef={inputRef} sx={{width:props.width}}></TextField>
                        {/* Type = 'password' does not work well */}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => { props.onClose(<></>); if (props.onResult) props.onResult(inputRef.current?.value)}}>ok</Button>
                <Button onClick={() => { props.onClose(<></>)}}>cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { InputBox, TextToolTip }