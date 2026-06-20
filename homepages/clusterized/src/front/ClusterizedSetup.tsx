import React, { useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack } from '@mui/material'
import { IHomepageSetupProps } from '@kwirthmagnify/kwirth-common-front'

const ClusterizedSetup: React.FC<IHomepageSetupProps> = ({ config, onSave, onClose }) => {
    const [showCpu, setShowCpu] = useState<boolean>(config.showCpu ?? true)
    const [showMem, setShowMem] = useState<boolean>(config.showMem ?? true)
    const [showPods, setShowPods] = useState<boolean>(config.showPods ?? true)

    return (
        <Dialog open={true}>
            <DialogTitle>Clusterized setup</DialogTitle>
            <DialogContent>
                <Stack direction='column' sx={{ pt: 1 }}>
                    <FormControlLabel control={<Checkbox checked={showCpu} onChange={e => setShowCpu(e.target.checked)} />} label='Show CPU usage' />
                    <FormControlLabel control={<Checkbox checked={showMem} onChange={e => setShowMem(e.target.checked)} />} label='Show memory usage' />
                    <FormControlLabel control={<Checkbox checked={showPods} onChange={e => setShowPods(e.target.checked)} />} label='Show pod count' />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => onSave({ showCpu, showMem, showPods })} variant='contained'>Save</Button>
                <Button onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export { ClusterizedSetup }
