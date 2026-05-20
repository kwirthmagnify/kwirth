import React, { useState, useRef, useEffect } from 'react'
import { DialogTitle, DialogContent, DialogActions, Button, Typography, Stack, Tooltip, IconButton, Box } from '@mui/material'
import { ContentCopy } from '@mui/icons-material'
// @ts-ignore
import './ResizableDialog.css'
import { ResizableDialog, IResizableDialogHandle } from './ResizableDialog'
import { WindowTitleButtons } from './WindowTitleButtons'
import { IContentWindow } from '../MagnifyTabContent'
import { IFileObject, ISpaceMenuItem } from '@jfvilas/react-file-manager'
import { DetailsObject, IDetailsSection } from './DetailsObject'
import { MenuContainers } from './MenuContainers'
import { useKeyboard } from '../../../tools/useKeyboard'

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
	const dialogRef = useRef<IResizableDialogHandle>(null)
	const newObject = useRef<any>(props.data.source.data.origin)
	const [containsEdit, setContainsEdit] = useState<boolean>(false)
	const [dataChanged, setDataChanged] = useState<boolean>(false)
	const [menuContainersAnchorParent, setMenuContainersAnchorParent] = useState<Element>()
	const [selectedAction, setSelectedAction] = useState('')
	const [isMaximized, setIsMaximized] = useState(props.isMaximized)
	let contentDetailsData:IDetailsData = props.data

	useEffect( () => {
		if (!newObject.current) {
			newObject.current = {}
		}
	}, [])
	useKeyboard(props.onClose, props.id)

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

	const handleSnap = (position: 'left' | 'right') => {
		setIsMaximized(false)
		dialogRef.current?.snapTo(position)
	}

    const onChangeData = (path:string, data:any) => {
        if (props.data.source.data.origin.kind === 'ConfigMap') {
            _.set(newObject.current, path, data)
        }
        if (props.data.source.data.origin.kind === 'Secret') {
            _.set(newObject.current, path, btoa(data))
        }
        setDataChanged(true)
    }

	return (<>
		<ResizableDialog ref={dialogRef} id={props.id} isMaximized={isMaximized} isActive={props.atFront} onFocus={onFocus} onWindowChange={props.onWindowChange} x={props.x} y={props.y} width={props.width} height={props.height}>
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

					<WindowTitleButtons id={props.id} atTop={props.atTop} isMaximized={isMaximized} onMinimize={() => props.onMinimize(props.id)} onTop={() => props.onTop(props.id)} onMaximize={handleIsMaximized} onClose={() => props.onClose(props.id)} onSnap={handleSnap} />
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

			<DialogActions sx={{ p: 0.5, pr: 2 }}>
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