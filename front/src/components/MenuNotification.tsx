
import React from 'react'
import { Popover, List, ListItem, ListItemText, IconButton, Typography, Box, Divider, Chip, Button, Stack } from '@mui/material'
import { Close as CloseIcon, NotificationsOff as NotificationsOffIcon, DeleteSweep } from '../tools/KwirthIcons'
import { ENotifyLevel } from '../tools/Global'
import { getIconFromKind } from '../tools/Constants-React'
import { TChannelConstructor } from '../channels/IChannel'

export interface INotification {
    channelId: string|undefined
    text: string
    level: ENotifyLevel
    timestamp: Date
}

interface MenuNotificationProps {
    anchorParent: HTMLElement | null
    notifications: INotification[]
    onClose: () => void
	channels: Map<string, TChannelConstructor>
    onRefresh: () => void
}

const MenuNotification: React.FC<MenuNotificationProps> = ({ anchorParent, onClose, notifications, channels, onRefresh }) => {
    const getSeverityColor = (level: ENotifyLevel) => {
		const colors = {
			[ENotifyLevel.ERROR]: 'error.main',
			[ENotifyLevel.WARNING]: 'warning.main',
			[ENotifyLevel.SUCCESS]: 'success.main',
			[ENotifyLevel.INFO]: 'info.main',
		}
		return colors[level]
	}

	const onDelete = (index:number) => {
		notifications.splice(index, 1)
		onRefresh()
	}

	const onClear = () => {
		while (notifications.length>0) notifications.splice(0,1)
		onClose()
	}

	return (
		<Popover
			anchorEl={anchorParent}
			open={true}
			onClose={onClose}
			anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
			transformOrigin={{ vertical: 'top', horizontal: 'right' }}
			PaperProps={{ sx: { width: 400, maxHeight: 500 } }}
		>
			<Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
					<Typography variant='subtitle1' sx={{ fontWeight: 700, flexGrow: 1 }}>Notifications</Typography>
					{
						notifications.length > 0 && <Button size='small' color='error' startIcon={<DeleteSweep />} onClick={onClear} sx={{ fontSize: '0.75rem' }}>Clear</Button>
					}
					<Chip label={notifications.length} size='small' />
			</Box>
			
			<Divider />
			
			<List sx={{ p: 0 }}>
				{notifications.length > 0 ? (
					notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map((msg, index) => (
						<ListItem key={index} divider secondaryAction={
								<IconButton edge='end' size='small' onClick={() => onDelete(index)}>
									<CloseIcon fontSize='small' />
								</IconButton>
							}
						>
							<Stack direction={'row'} alignItems={'start'}>
								<span style={{marginTop:2}}>
									{
										msg.channelId?
											(new (channels.get(msg.channelId!)!)()).getChannelIcon()
										:
											getIconFromKind('IconK8s', 20)
									}
								</span>  
								<ListItemText 
									primary={msg.text}
									primaryTypographyProps={{ variant: 'body2', sx: { pr: 2, pl:1 } }}
									secondary={
										<Box component='span' sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
											<Typography variant='caption' sx={{ color: getSeverityColor(msg.level), fontWeight: 'bold', pl:1 }}>{msg.level}</Typography>
											<Typography variant='caption' color='text.secondary'>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>
										</Box>
									}
								/>
							</Stack>
						</ListItem>
						
					))
				)
				:
				(
					<Box sx={{ p: 4, textAlign: 'center' }}>
						<NotificationsOffIcon sx={{ opacity: 0.2, fontSize: 40, mb: 1 }} />
						<Typography variant='body2' color='text.secondary'>No new notifications.</Typography>
					</Box>
				)}
			</List>
		</Popover>
	)
}

export { MenuNotification }