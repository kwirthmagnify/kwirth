import React from 'react'
import { DialogTitle, DialogTitleProps, Box } from '@mui/material'
import { HelpButton } from './HelpButton'

// A DialogTitle with a help button on the right (project rule: when a dialog has a guide section, it
// carries a HelpButton that opens it). `section` = the docsify route (e.g. 'admin/06-sla-settings');
// `docsUrl` = the guide's base. It keeps the title on the left, at a fixed size.
export interface IDialogTitleHelpProps extends Omit<DialogTitleProps, 'title'> {
    section: string
    docsUrl?: string
    children: React.ReactNode
}

const DialogTitleHelp: React.FC<IDialogTitleHelpProps> = ({ section, docsUrl, children, sx, id, ...rest }) => {
    const generatedId = React.useId()
    const titleId = id ?? generatedId
    const ref = React.useRef<HTMLHeadingElement>(null)

    /*
        MUI recognises a Dialog's title by the component's identity, and only when it is a DIRECT child:
        there it injects into it the id the dialog's 'aria-labelledby' points at. Wrapped in this
        component it stops recognising it, the aria-labelledby is left pointing at an id that does not
        exist and the dialog ends up WITH NO ACCESSIBLE NAME — a screen reader announces it with no title,
        and getByRole('dialog', { name }) does not find it.

        It is fixed here, once for every dialog: the title identifies itself with an id of its own and the
        dialog is told to look there. It was spotted because an e2e looking for a dialog by its name
        stopped seeing it once its DialogTitle was swapped for this component.
    */
    React.useLayoutEffect(() => {
        const dialog = ref.current?.closest('[role="dialog"]')
        if (dialog) dialog.setAttribute('aria-labelledby', titleId)
    }, [titleId])

    return (
        <DialogTitle {...rest} id={titleId} ref={ref}
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, ...sx }}>
            <Box component='span'>{children}</Box>
            <HelpButton section={section} docsUrl={docsUrl} />
        </DialogTitle>
    )
}

export { DialogTitleHelp }
