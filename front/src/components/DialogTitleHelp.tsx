import React, { useContext } from 'react'
import { Box, DialogTitle } from '@mui/material'
import { SessionContext, SessionContextType } from '../model/SessionContext'
import { HelpButton } from '@kwirthmagnify/kwirth-common-front'

const DialogTitleHelp: React.FC<{ section: string; children: React.ReactNode }> = ({ section, children }) => {
    const { backendUrl } = useContext(SessionContext) as SessionContextType
    return (
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box component='span'>{children}</Box>
            <HelpButton docsUrl={`${backendUrl}/docs/core/kwirth`} section={section} />
        </DialogTitle>
    )
}

export { DialogTitleHelp }
