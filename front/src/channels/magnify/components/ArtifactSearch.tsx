import { Checkbox, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, TextField, Typography } from '@mui/material'
import { IFileObject } from '@jfvilas/react-file-manager'
import { ChangeEvent, useState } from 'react'
import { Close, Fullscreen, FullscreenExit, Minimize, PinDrop, Place, Search } from '@mui/icons-material'
import { objectClone, objectSearch } from '../Tools'
import { getIconFromKind } from '../../../tools/Constants-React'
// @ts-ignore
import './ResizableDialog.css'
import { ResizableDialog } from './ResizableDialog'
import { IContentWindow } from '../MagnifyTabContent'
import { useEscape } from '../../../tools/useEscape'

export interface IArtifactSearchData {
    scope: string
    selectedFiles: IFileObject[]
    onLink: (kind:string, name:string, namespace:string) => void
    searchText: string
    includeStatus: boolean
    merge: boolean
    matchCase: boolean
}

export interface IArtifactSearchProps extends IContentWindow {
    data: IArtifactSearchData
}

const ArtifactSearch: React.FC<IArtifactSearchProps> = (props:IArtifactSearchProps) => {
    const [searchText, setSearchText] = useState(props.data.searchText)
    const [includeStatus, setIncludeStatus] = useState(props.data.includeStatus)
    const [merge, setMerge] = useState(props.data.merge)
    const [matchCase, setMatchCase] = useState(props.data.matchCase)

    const [isMaximized, setIsMaximized] = useState(props.isMaximized)
    let artifactSearchData:IArtifactSearchData = props.data
    useEscape(props.onClose, props.id)

	const onFocus = () => {
		if (props.onFocus) props.onFocus()
	}

	const handleIsMaximized = () => {
		props.onWindowChange(props.id, !isMaximized, props.x, props.y, props.width, props.height)
		setIsMaximized(!isMaximized)
	}

    const onSearchChange = (event:ChangeEvent<HTMLInputElement>) => {
        setSearchText(event.target.value)
        props.data.searchText = event.target.value
    }

    const onIncludeStatusChange = () => {
        setIncludeStatus(!includeStatus)
        props.data.includeStatus = !props.data.includeStatus
    }

    const onMatchCaseChange = () => {
        setMatchCase(!matchCase)
        props.data.matchCase = !props.data.matchCase
    }

    const onMergeChange = () => {
        setMerge(!merge)
        props.data.merge = !props.data.merge
    }

    function getDeepValue(obj: any, pathString: string) {
        if (!obj || !pathString) return undefined

        // "spec.containers[0].env[7].value" -> ["spec", "containers", "0", "env", "7", "value"]
        const parts = pathString
            .replace(/\[(\d+)\]/g, '.$1') // change [0] into .0
            .split('.')
            .filter(p => p !== "")      // remove empty points

        let current = obj

        for (const part of parts) {
            if (current === null || typeof current !== 'object') {
                return undefined;
            }

            if (part in current)
                current = current[part]
            else
                return undefined
        }
        return current
    }

    const getResults= (obj:any, text:string, includeStatus:boolean, matchCase:boolean, merge:boolean) => {
        if (!obj || !obj.kind) return []
        let result = []
        if (obj.kind==='Secret' && obj.data) {
            let newObj = objectClone(obj)
            for (let key of Object.keys(newObj.data))
                newObj.data[key] = atob(newObj.data[key])
            result = objectSearch(newObj, text, matchCase)
        }
        else
            result = objectSearch(obj, text, matchCase)
        if (!includeStatus) result= result.filter(r => !r.startsWith('status'))
        if (merge && result.length>1) {
            result=[result[0]]
        }
        return result
    }

    return (
        <ResizableDialog id={props.id} isMaximized={isMaximized} onFocus={onFocus} onWindowChange={props.onWindowChange} x={props.x} y={props.y} width={props.width} height={props.height}>
            <DialogTitle sx={{ cursor: isMaximized ? 'default' : 'move',  py: 1 }} id='draggable-dialog-title'>
                <Stack direction={'row'} alignItems={'center'}>                    
                    <Typography sx={{flexGrow:1}} variant='body2'></Typography>
                    <Typography variant='body2'><Search />&nbsp;{artifactSearchData.scope===':cluster:'?'All cluster':'Namespace: '+artifactSearchData.scope}</Typography>
                    <Typography sx={{flexGrow:1}} variant='body2'></Typography>

                    <IconButton size="small" onClick={() => props.onMinimize(props.id)}>
                        <Minimize fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => props.onTop(props.id)}>
                        {props.atTop? <PinDrop sx={{color:'blue'}} fontSize="small" /> : <Place fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={handleIsMaximized}>
                        {isMaximized ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={() => props.onClose(props.id)} sx={{ '&:hover': { color: 'error.main' } }}>
                        <Close fontSize="small" />
                    </IconButton>
                </Stack>
            </DialogTitle>

            <DialogContent>
                <Stack direction={'row'} alignItems={'center'}>
                    <TextField value={searchText} onChange={onSearchChange} variant='standard' label={'Search...'}></TextField>
                    <FormControlLabel control={<Checkbox/>} checked={includeStatus} onChange={onIncludeStatusChange} label='Include status'/>
                    <FormControlLabel control={<Checkbox/>} checked={matchCase} onChange={onMatchCaseChange} label='Match case'/>
                    <FormControlLabel control={<Checkbox/>} checked={merge} onChange={onMergeChange} label='Merge repeated results'/>
                    <Typography flexGrow={1}></Typography>
                    {searchText.trim()!=='' && (searchText.length>=3) && <Typography>Results: {artifactSearchData.selectedFiles.reduce( (acc,file) => acc + getResults(file.data?.origin, searchText, includeStatus, matchCase, merge).length, 0)}</Typography>}
                </Stack>
                <Stack direction={'column'} mt={1}>
                    {
                        searchText.trim()!=='' && (searchText.length>=3) && artifactSearchData.selectedFiles.map((file) => {
                            let res = getResults(file.data?.origin, searchText, includeStatus, matchCase, merge)
                            return res.map((r,index) => {
                                let val = getDeepValue(file.data.origin, r)
                                if (!val) console.log(r)
                                let link
                                if (file.data.origin.metadata)
                                    link = <Typography variant='body2'><a href={`#`} onClick={() => artifactSearchData.onLink(file.data.origin.kind, file.data.origin.metadata.name, file.data.origin.metadata.namespace)}>{file.data.origin.metadata.name}</a></Typography>
                                else
                                    link = <Typography variant='body2'><a href={`#`} onClick={() => artifactSearchData.onLink(file.data.origin.kind, file.data.origin.name, '')}>{file.data.origin.name}</a></Typography>
                                return <Stack key={index} direction={'row'} sx={{mb:2, ml:1}} alignItems={'center'}>
                                    {getIconFromKind(file.data?.origin?.kind, 32)}
                                    <Stack direction={'column'} sx={{ml:2}}>
                                        {link}
                                        <Typography variant='body2'>{r}</Typography>
                                        <Typography variant='body2'>{String(val).substring(0,80)}{String(val).length>80?'...':''}</Typography>
                                    </Stack>
                                </Stack>
                            })
                        })
                    }
                </Stack>
            </DialogContent>
        </ResizableDialog>
    )
}
export { ArtifactSearch }