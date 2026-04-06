import React, { useState, useRef } from 'react'
import { DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, Tooltip, IconButton, Box } from '@mui/material'
import { Close, ContentCopy, FullscreenExit, Fullscreen, Minimize, PinDrop, Place } from '@mui/icons-material'
// @ts-ignore
import './ResizableDialog.css'
import { ResizableDialog } from './ResizableDialog'
import { IContentWindow } from '../MagnifyTabContent'
import { IFileObject, ISpaceMenuItem } from '@jfvilas/react-file-manager'
import { DetailsObject, IDetailsSection } from './DetailsObject'
import { MenuContainers } from './MenuContainers'
import { useEscape } from '../../../tools/useEscape'

const _ = require('lodash')
const copy = require('clipboard-copy')

export interface IDetailsData {
	source: IFileObject
	path: string
	sections: IDetailsSection[]
	actions: ISpaceMenuItem[]
	onApply: (path: string, obj: any) => void
	onAction: (action: string, path: string, container?: string) => void
	onLink: (kind: string, name: string, namespace: string) => void
	// 0-pod, 1-containers, 2-containers+all
	containerSelectionOptions: Map<string, number>
}

export interface IContentDetailsProps extends IContentWindow {
	data: IDetailsData
}

const ContentDetails: React.FC<IContentWindow> = (props:IContentWindow) => {
	const newObject = useRef()
	const [containsEdit, setContainsEdit] = useState<boolean>(false)
	const [dataChanged, setDataChanged] = useState<boolean>(false)
	const [menuContainersAnchorParent, setMenuContainersAnchorParent] = useState<Element>()
	const [selectedAction, setSelectedAction] = useState('')
	const [isMaximized, setIsMaximized] = useState(props.isMaximized)
	let contentDetailsData:IDetailsData = props.data

	useEscape(props.onClose, props.id)
	// useEffect(() => {
	// 	newObject.current = objectClone(props.data.source.data.origin)

	// 	const previousFocus = document.activeElement as HTMLElement
	// 	const handleKeyDown = (event: KeyboardEvent) => {
	// 		event.stopPropagation()
	// 		if (event.key === 'Escape') props.onClose(props.id)
	// 	}
	// 	window.addEventListener('keydown', handleKeyDown, true)
	// 	return () => {
	// 		window.removeEventListener('keydown', handleKeyDown, true)
	// 		previousFocus?.focus()
	// 	}
	// }, [])

	const onLink = (k:string, n:string, ns:string) => {
		props.onClose(props.id)
		props.data.onLink(k,n,ns)
    }

	const items:ISpaceMenuItem[] = props.data.actions.filter((a:ISpaceMenuItem) => a.name !== 'details')

	const actionClick = (action: string, currentTarget: Element) => {
		if (props.selectedFiles[0].class==='Pod') {
			if ((props.data.containerSelectionOptions.get(action) || 0) >= 1) {
				setSelectedAction(action)
				setMenuContainersAnchorParent(currentTarget)
				return
			}
		}
		props.data.onAction(action, props.selectedFiles[0].path || '', undefined)
	}

	const onFocus = () => {
		if (props.onFocus) props.onFocus()
	}

	const handleIsMaximized = () => {
		props.onWindowChange(props.id, !isMaximized, props.x, props.y, props.width, props.height)
		setIsMaximized(!isMaximized)
	}

    const onChangeData = (path:string, data:any) => {
		console.log('changedata', newObject.current)
        if (props.data.source.data.origin.kind === 'ConfigMap') {
            _.set(newObject.current, path, data)
        }
        if (props.data.source.data.origin.kind === 'Secret') {
            _.set(newObject.current, path, btoa(data))
        }
		//_.set(newObject.current, path, data)
        setDataChanged(true)
    }

	return (<>
		<ResizableDialog id={props.id} isMaximized={isMaximized} onFocus={onFocus} onWindowChange={props.onWindowChange} x={props.x} y={props.y} width={props.width} height={props.height}>
			<DialogTitle sx={{ cursor: isMaximized ? 'default' : 'move',  py: 1 }} id='draggable-dialog-title'>
				<Stack direction='row' alignItems={'center'} spacing={1}>
					<Typography variant="subtitle1" noWrap sx={{ fontWeight: 'bold', flexShrink: 0}}>
						{`${contentDetailsData.source.data.origin.kind}:`}
					</Typography>
					<Typography variant='body2' noWrap>
						{props.title}
					</Typography>
					<Tooltip title='Copy'>
						<IconButton size='small' onClick={() => copy(props.title)}>
							<ContentCopy fontSize='inherit' />
						</IconButton>
					</Tooltip>
					
					<Stack direction='row' spacing={0.5} className="no-drag">
						{items.map((action, index) => (
							action.name === 'divider' ? 
								<Typography sx={{flexGrow: 1}}/>
								:
								<Tooltip key={index} title={action.text}>
									<IconButton size="small" color='primary' onClick={(event) => actionClick(action.name!, event.currentTarget)}>
										{action.icon}
									</IconButton>
								</Tooltip>
						))}
					</Stack>

					<Typography sx={{ flexGrow: 1}}/>

					<Stack direction="row" spacing={0.5} className="no-drag">
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
				</Stack>
			</DialogTitle>

			<DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
				<Box sx={{ p: 2, flexGrow: 1, overflow: 'auto' }}>
					{
						<DetailsObject 
							object={contentDetailsData.source}
							sections={contentDetailsData.sections} 
							onChangeData={onChangeData}
							onLink={onLink} 
							onContainsEdit={setContainsEdit}
						/>
					}
				</Box>
			</DialogContent>

			<DialogActions sx={{ p: '4px 4px', pr:2 }}>
				<Button onClick={() => props.data.onApply(contentDetailsData.path, newObject.current)} disabled={!containsEdit || !dataChanged} variant='contained' size='small'>
					Apply
				</Button>
			</DialogActions>
		</ResizableDialog>

		{menuContainersAnchorParent && props.selectedFiles.length>0 && (
			<MenuContainers 
				channel={selectedAction}
				file={props.selectedFiles[0]}
				onClose={() => setMenuContainersAnchorParent(undefined)}
				anchorParent={menuContainersAnchorParent}
				onContainerSelected={(channel, file, container) => {
					props.data.onAction(channel, file.path || '', container)
					setMenuContainersAnchorParent(undefined)
				}}
				includeAllContainers={contentDetailsData.containerSelectionOptions.get(selectedAction)===2}
			/>
		)}
	</>)

}

export { ContentDetails }