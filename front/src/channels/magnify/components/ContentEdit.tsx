import { Button, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography, useTheme } from '@mui/material'
import { IFileObject } from '@jfvilas/react-file-manager'
import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorState } from "@codemirror/state"
import { yaml } from '@codemirror/lang-yaml'
import { Close, Edit, EditOff, Fullscreen, FullscreenExit, Minimize, PinDrop, Place } from '@mui/icons-material'
import { objectEqual, reorderJsonYamlObject } from '../Tools'
import { search, openSearchPanel, searchKeymap } from '@codemirror/search'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { foldCode } from '@codemirror/language'
import { IContentWindow } from '../MagnifyTabContent'
import { ResizableDialog } from './ResizableDialog'
import { MsgBoxButtons, MsgBoxYesNo } from '../../../tools/MsgBox'
import { oneDark } from '@codemirror/theme-one-dark'

const yamlParser = require('js-yaml');

export interface IContentEditData {
    oldCode: string|undefined
    code: string|undefined
    source?: IFileObject
    isInitialized: boolean
    selectedFile?: IFileObject
    allowEdit: boolean
    onOk?: (code:string, source?:IFileObject) => void
}

export interface IContentEditProps extends IContentWindow {
    data: IContentEditData
}

const ContentEdit: React.FC<IContentEditProps> = (props:IContentEditProps) => {
    const theme = useTheme()
    const editorTheme = theme.palette.mode === 'dark' ? oneDark : 'light';

    const [msgBox, setMsgBox] = useState(<></>)
    const [code, setCode] = useState<string>('')
    const editorChanged = useRef<boolean>(false)

    const containerRef = useRef<HTMLDivElement>(null);
    const editorViewRef = useRef<EditorView | null>(null);

    const [isMaximized, setIsMaximized] = useState(props.isMaximized)
    let contentEditData:IContentEditData = props.data

    const muiTheme = EditorView.theme({
        "&": {
            height: '100%',
            fontSize: "12px",
            fontFamily: "'Fira Code', 'Source Code Pro', monospace"
        },
        // ".cm-gutters": {
        //     backgroundColor: theme.palette.background.default,
        //     border: "none",
        //     color: theme.palette.text.secondary,
        //     pointerEvents: "auto !important",
        //     zIndex: 10,
        // },
        ".cm-foldGutter": {
            width: "25px",
            pointerEvents: "auto !important",
        },
        ".cm-gutterElement": {
            display: "flex !important",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer !important",
            pointerEvents: "auto !important",
        },
        ".cm-foldGutter span": {
            pointerEvents: "none" 
        }
    }, { dark: theme.palette.mode === 'dark' })

    useEffect(() => {
        const handleNativeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') tryClose()

            if (!containerRef.current?.contains(document.activeElement)) return

            const isCtrl = event.ctrlKey || event.metaKey
            
            if (isCtrl && event.key.toLowerCase() === 'f') {
                event.preventDefault()
                event.stopPropagation()
                
                if (editorViewRef.current) {
                    openSearchPanel(editorViewRef.current)
                }
            }
            
            if (isCtrl && event.key.toLowerCase() === 'd') {
                event.preventDefault()
                event.stopPropagation()
            }
        }

        window.addEventListener('keydown', handleNativeKey, true)
        return () => window.removeEventListener('keydown', handleNativeKey, true)
    }, [])

    const tryClose = () => {
        if (!editorChanged.current)
            props.onClose(props.id)
        else {
            setMsgBox(MsgBoxYesNo('Edit exit', 'You have some changes not applied. Are you sure you want to exit without applying?', setMsgBox, (a) => {
                if (a === MsgBoxButtons.Yes) props.onClose(props.id)
            }))
        }
    }

    useEffect( () => {
        if (!contentEditData.isInitialized) {
            contentEditData.isInitialized = true
            if (contentEditData.code===undefined) {
                let obj = props.selectedFiles[0].data.origin
                let reorderedObj = reorderJsonYamlObject(obj)
                contentEditData.code = yamlParser.dump(reorderedObj)
                setCode(contentEditData.code!)
            }
            else {
                setCode(contentEditData.code)
            }
            contentEditData.oldCode = contentEditData.code
        }
        else {
            if (contentEditData.code) setCode(contentEditData.code)
        }
    },[])

	const onFocus = () => {
		if (props.onFocus) props.onFocus()
	}

	const handleIsMaximized = () => {
		props.onWindowChange(props.id, !isMaximized, props.x, props.y, props.width, props.height)
		setIsMaximized(!isMaximized)
	}

    const updateEditorValue= (newCode:any) => {
        contentEditData.code = newCode
        setCode(newCode)
        let oldJson = yamlParser.load(contentEditData.oldCode)
        let newJson = yamlParser.load(newCode)
        let status=objectEqual(newJson, oldJson)
        editorChanged.current = !status
    }

    return (<>
        <ResizableDialog id={props.id} isMaximized={isMaximized} onFocus={onFocus} onWindowChange={props.onWindowChange} x={props.x} y={props.y} width={props.width} height={props.height}>
            <DialogTitle sx={{ cursor: isMaximized ? 'default' : 'move',  py: 1 }} id='draggable-dialog-title'>
                <Stack direction={'row'} alignItems={'center'}>
                    <Typography sx={{flexGrow:1}}></Typography>
                    <Typography>{contentEditData.allowEdit?<Edit />:<EditOff/>}&nbsp;{props.title}</Typography>

                    <Typography sx={{flexGrow:1}}></Typography>

                    <IconButton size="small" onClick={() => props.onMinimize(props.id)}>
                        <Minimize fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => props.onTop(props.id)}>
                        {props.atTop? <PinDrop sx={{color:'blue'}} fontSize="small" /> : <Place fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={handleIsMaximized}>
                        {isMaximized ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={tryClose} sx={{ '&:hover': { color: 'error.main' } }}>
                        <Close fontSize="small" />
                    </IconButton>
                </Stack>
            </DialogTitle>

            <DialogContent>
                <div ref={containerRef} 
                    style={{ height: '100%', width: '100%', paddingTop: '2px' }} 
                    onMouseDownCapture={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('.cm-foldGutter')) {
                            if (editorViewRef.current) {
                                e.preventDefault();
                                e.stopPropagation();
                                editorViewRef.current.focus();
                                foldCode(editorViewRef.current);
                            }
                        }
                    }}
                    className="no-drag"
                >
                    <CodeMirror value={code}
                        onChange={updateEditorValue}
                        //theme={'none'}
                        theme={editorTheme}
                        onUpdate={(viewUpdate) => { if (viewUpdate.view) editorViewRef.current = viewUpdate.view }}
                        extensions={[
                            EditorState.readOnly.of(!contentEditData.allowEdit),
                            yaml(),
                            search({ top: true }),
                            muiTheme,
                            keymap.of([
                                ...defaultKeymap,
                                ...searchKeymap,
                            ])
                        ]}
                    />
                </div>
            </DialogContent>

            <DialogActions sx={{ p: '4px 4px', pr:2 }}>
                <Button onClick={() => contentEditData.onOk?.(code, contentEditData.source)} disabled={!editorChanged.current}>Ok</Button>
            </DialogActions>
        </ResizableDialog>
        {msgBox}
    </>)
}
export { ContentEdit }