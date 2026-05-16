import { ILogLine, ILogData, LogData } from './LogData'
import { Box, Card, CardContent, CardHeader, InputAdornment, Stack, TextField, Typography, useTheme } from '@mui/material'
import { IContentProps } from '../IChannel'
import { useEffect, useRef, useState } from 'react'
import { Error, Warning } from '@mui/icons-material'
import { ILogConfig, LogConfig } from './LogConfig'

const cleanANSI = (text: string): string => {
    const regexAnsi = /\x1b\[[0-9;]*[mKHVfJrcegH]|\x1b\[\d*n/g;
    return text.replace(regexAnsi, '') // replace all matches with empty strings
}

const LogTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    let logData:ILogData = props.channelObject.data || new LogData()
    let logConfig:ILogConfig = props.channelObject.config || new LogConfig()
    const theme = useTheme()

    const logBoxRef = useRef<HTMLDivElement | null>(null)
    const [logBoxTop, setLogBoxTop] = useState(0)
    const [isAtBottom, setIsAtBottom] = useState(true)

    const [filter, setFilter] = useState<string>('')
    const [filterCasing, setFilterCasing] = useState(false)
    const [filterRegex, setFilterRegex] = useState(false)

    const adornmentSelected= { margin: 0, borderWidth:1, borderStyle:'solid', borderColor: theme.palette.divider, paddingLeft:3, paddingRight:3, color:theme.palette.background.default, backgroundColor:theme.palette.text.primary, cursor: 'pointer'}
    const adornmentNotSelected = { margin: 0, borderWidth:1, borderStyle: 'solid', borderColor: theme.palette.divider, backgroundColor:theme.palette.background.default, color:theme.palette.text.primary, paddingLeft:3, paddingRight:3, cursor:'pointer'}

    useEffect(() => {
        if (logBoxRef.current) setLogBoxTop(logBoxRef.current.getBoundingClientRect().top)
    })

    useEffect(() => {
        if (isAtBottom && logBoxRef.current) {
            logBoxRef.current.scrollTo({
                top: logBoxRef.current.scrollHeight,
                behavior: 'auto', // 'smooth'
            })
        }
    }, [isAtBottom, logData.messages.length])

    if (!logData) return <pre></pre>

    const formatLogLine = (logLine:ILogLine) => {
        if (!logLine.pod) {
            return <span>{cleanANSI(logLine.text)}</span>
        }

        if (filter!=='') {
            if (filterCasing) {
                if (filterRegex) {
                    try {
                        const regex=new RegExp(filter)
                        if (!regex.test(logLine.text) && !regex.test(logLine.pod) && !regex.test(logLine.container)) return <></>
                    }
                    catch { return <></> }
                }
                else {
                    if (!logLine.text.includes(filter) && !logLine.pod?.includes(filter) && !logLine.container?.includes(filter)) return <></>
                }
            }
            else {
                if (filterRegex) {
                    try {
                        const regex=new RegExp(filter.toLocaleLowerCase())
                        if (!regex.test(logLine.text.toLocaleLowerCase()) && !regex.test(logLine.pod?.toLocaleLowerCase()) && !regex.test(logLine.container?.toLocaleLowerCase())) return <></>
                    }
                    catch { return <></> }
                }
                else {
                    if (!logLine.text.toLocaleLowerCase().includes(filter.toLowerCase()) && !logLine.pod?.toLocaleLowerCase().includes(filter.toLocaleLowerCase()) && !logLine.container?.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) return <></>
                }
            }
        }

        if (logConfig.showNames) {
            return <>
                <span style={{color:'green'}}>{logLine.pod+' '}</span>
                <span style={{color:'blue'}}>{logLine.container+' '}</span>
                <span>{cleanANSI(logLine.text)}</span>
            </>
        }
        else {
            return <span>{cleanANSI(logLine.text)}</span>
        }
    }

    const onChangeFilter = (event: any) => {
        setFilter(event.target?.value)
    }

    const handleScroll = () => {
        if (logBoxRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = logBoxRef.current
            const distanceToBottom = scrollHeight - scrollTop - clientHeight
            const atBottom = distanceToBottom < 25
            setIsAtBottom(atBottom)
        }
    }

    return (<>
        { logData.started &&
            <Card sx={{display: 'flex', flexDirection: 'column', flex: 1, width: '98%', alignSelf: 'center', mt: 1, minHeight: 0}}>
                <CardHeader title={
                    <Stack direction={'row'} alignItems={'center'}>
                        <Typography mr={4}><b>Lines:</b> {logData.messages.length}</Typography>
                        <Typography mr={4}><Warning fontSize='small' sx={{mb: 0.25, color: 'warning.main'}} /><b>&nbsp;Warning:</b> {logData.messages.filter(m => m.text.includes('WARNING')).length}</Typography>
                        <Typography mr={4}><Error fontSize='small' sx={{mb: 0.25, color: 'error.main'}}/><b>&nbsp;Error:</b> {logData.messages.filter(m => m.text.includes('ERROR')).length}</Typography>
                        <Typography sx={{flexGrow:1}}></Typography>
                        <TextField value={filter} onChange={onChangeFilter} disabled={!logData.started} size='small' variant='standard' placeholder='Filter...'
                            InputProps={{ endAdornment:
                                <>
                                    <InputAdornment position='start' onClick={() => logData.started && setFilterRegex(!filterRegex)} sx={{m: 0}}>
                                        <Typography sx={filterRegex? adornmentSelected : adornmentNotSelected}>.*</Typography>
                                    </InputAdornment>
                                    <InputAdornment position='start' onClick={() => logData.started && setFilterCasing(!filterCasing)} sx={{m: 0, ml: 1}}>
                                        <Typography sx={filterCasing? adornmentSelected : adornmentNotSelected}>Aa</Typography>
                                    </InputAdornment>
                                </>
                            }}
                        />
                    </Stack>}>
                </CardHeader>
                <CardContent sx={{flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, p: 0, "&:last-child": { pb: 0 } }}>
                    <Box ref={logBoxRef} sx={{ display:'flex', flexDirection:'column', width:'100%', overflowY:'auto', flexGrow:1, height: `calc(100vh - ${logBoxTop}px - 16px)`}} onScroll={handleScroll}>
                        <pre style={{fontSize: '0.75rem'}}>
                            {logData.messages.map((message, index) => { return <div key={index}>{formatLogLine(message)}</div> })}
                        </pre>
                    </Box>
                </CardContent>
            </Card>}
    </>)
}

export { LogTabContent }