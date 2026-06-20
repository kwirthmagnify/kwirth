import React, { useState } from 'react'
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material'
import { IHomepageSetupProps } from '@kwirthmagnify/kwirth-common-front'

const AV_GOLD     = '#c9a227'
const AV_GOLD_DIM = '#5c4810'
const AV_FONT     = "'Oswald', 'Arial Narrow', sans-serif"

const AviciiSetup: React.FC<IHomepageSetupProps> = ({ config, onSave, onClose }) => {
    const [showMetricBars,    setShowMetricBars]    = useState<boolean>(config.showMetricBars    ?? true)
    const [showResourceCards, setShowResourceCards] = useState<boolean>(config.showResourceCards ?? true)
    const [showChannelIcons,  setShowChannelIcons]  = useState<boolean>(config.showChannelIcons  ?? true)

    const checkSx = { color: AV_GOLD_DIM, '&.Mui-checked': { color: AV_GOLD } }
    const labelSx = { fontFamily: AV_FONT, fontSize: '0.85rem', letterSpacing: '1px', color: AV_GOLD }

    return (
        <Dialog open={true} PaperProps={{ sx: { bgcolor: '#0b0907', border: `1px solid ${AV_GOLD_DIM}`, borderTop: `2px solid ${AV_GOLD}`, color: AV_GOLD, minWidth: 360 } }}>
            <DialogTitle sx={{ fontFamily: AV_FONT, fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', color: AV_GOLD, borderBottom: `1px solid ${AV_GOLD_DIM}`, pb: 1.5 }}>
                ▲ Avicii Setup
            </DialogTitle>
            <DialogContent>
                <Stack direction='column' spacing={0.5} sx={{ pt: 2 }}>
                    <FormControlLabel
                        control={<Checkbox checked={showMetricBars} onChange={e => setShowMetricBars(e.target.checked)} sx={checkSx} />}
                        label={<Typography sx={labelSx}>Show metric bars (CPU / MEM / POD)</Typography>}
                    />
                    <FormControlLabel
                        control={<Checkbox checked={showResourceCards} onChange={e => setShowResourceCards(e.target.checked)} sx={checkSx} />}
                        label={<Typography sx={labelSx}>Show resource counters (vCPUs / RAM / Pods)</Typography>}
                    />
                    <FormControlLabel
                        control={<Checkbox checked={showChannelIcons} onChange={e => setShowChannelIcons(e.target.checked)} sx={checkSx} />}
                        label={<Typography sx={labelSx}>Show channel icons</Typography>}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ borderTop: `1px solid ${AV_GOLD_DIM}`, pt: 1 }}>
                <Button onClick={() => onSave({ showMetricBars, showResourceCards, showChannelIcons })} variant='contained'
                    sx={{ bgcolor: AV_GOLD, color: '#0b0907', fontFamily: AV_FONT, fontWeight: 700, letterSpacing: '2px', borderRadius: 0, '&:hover': { bgcolor: '#d4aa2a' } }}>
                    SAVE
                </Button>
                <Button onClick={onClose} sx={{ color: AV_GOLD_DIM, fontFamily: AV_FONT, letterSpacing: '1px', borderRadius: 0 }}>CANCEL</Button>
            </DialogActions>
        </Dialog>
    )
}

export { AviciiSetup }
