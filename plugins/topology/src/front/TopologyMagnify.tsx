import React from 'react'
import { Divider, Typography } from '@mui/material'

export function getTopologyExternalHelpContent(): React.ReactNode {
    return <>
        <Typography variant='subtitle1' sx={{ fontWeight: 700, flexGrow: 1 }}>Topology</Typography>
        <Divider/>
        <Typography variant='body2'>Topology shows a 3D graph of Kubernetes resources and their relationships. You can launch it cluster-wide or scoped to specific namespaces selected in Magnify.</Typography>
        <Divider/>
        <Typography variant='body2' sx={{ fontWeight: 600 }}>Navigation</Typography>
        <Typography variant='body2'><b>Rotate</b> — left mouse button + drag</Typography>
        <Typography variant='body2'><b>Pan</b> — middle mouse button + drag</Typography>
        <Typography variant='body2'><b>Zoom</b> — scroll wheel</Typography>
        <Typography variant='body2'><b>Select node</b> — left click</Typography>
        <Typography variant='body2'><b>Context menu</b> — right click on a node</Typography>
        <Typography variant='body2'><b>Path mode</b> — right click → View path (shows connected subgraph)</Typography>
        <Typography variant='body2'><b>Reset camera</b> — reset button (top right)</Typography>
    </>
}
