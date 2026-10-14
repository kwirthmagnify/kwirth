import { IFileObject } from '@jfvilas/react-file-manager'
import { Box, Divider, Menu, MenuItem, MenuList, Stack, Typography } from '@mui/material'
import React, { useEffect } from 'react'

interface IMenuContainersProps {
    file: IFileObject|undefined
    channel: string
    onClose?:() => void
    onContainerSelected: (channel:string, file:IFileObject, container:string) => void
    includeAllContainers: boolean
    anchorParent: Element
}

const MenuContainers: React.FC<IMenuContainersProps> = (props:IMenuContainersProps) => {
    useEffect(() => {
        if (props.file && props.file.data.origin.status.containerStatuses?.length === 1) {
            props.onContainerSelected(
                props.channel, 
                props.file, 
                props.file.data.origin.status.containerStatuses[0].name
            )
        }
    }, [props.file, props.channel, props.onContainerSelected])

    if (!props.file || !props.file.data.origin.status.containerStatuses) return null
    if (props.file.data.origin.status.containerStatuses.length === 1) return null
   
    return <Menu anchorEl={props.anchorParent} open={Boolean(props.anchorParent)} onClose={props.onClose}>
        <MenuList dense sx={{minWidth: 120}}>
            {
                props.file.data.origin.status.containerStatuses.map ( (cs:any) =>  {

                    let color='orange'
                    if (cs.started) {
                        color='green'
                        if (props.file && props.file.data.origin.metadata.deletionTimestamp) color = 'blue'
                    }
                    else {
                        if (cs.state.terminated) color = 'gray'
                    }
                    return <MenuItem key={cs.name} onClick={() => props.onContainerSelected(props.channel, props.file!, cs.name)}>
                        <Stack direction={'row'} alignItems={'center'}>
                            <Box sx={{ width: '10px', height: '10px', backgroundColor: color, margin: '1px', display: 'inline-block' }}/>
                            <Typography>&nbsp;{cs.name}</Typography>
                        </Stack>
                    </MenuItem>
                })
            }
            { props.includeAllContainers && 
                <>
                    <Divider/>
                    <MenuItem key={'all'} onClick={() => props.onContainerSelected(props.channel, props.file!, '*all')}>
                        <Typography>All containers</Typography>
                    </MenuItem>
                </>
            }
        </MenuList>
    </Menu>
}

export { MenuContainers }