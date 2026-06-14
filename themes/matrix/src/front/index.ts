declare global { interface Window { __kwirth_themes__: Record<string, any> } }

window.__kwirth_themes__ = window.__kwirth_themes__ ?? {}
window.__kwirth_themes__['matrix'] = {
    displayName: 'Matrix',
    getThemeOptions: (mode: 'light' | 'dark') => ({
        cssVariables: true,
        palette: {
            mode,
            primary:   { main: '#00ff41' },
            secondary: { main: '#006620' },
            background: {
                default: '#000000',
                paper:   '#030a03',
            },
            text: {
                primary:   '#c8f0c8',
                secondary: '#006620',
                disabled:  'rgba(0,255,65,0.38)',
            },
            divider: '#0a2a0a',
            action: {
                active: '#00ff41',
                hover: 'rgba(0,255,65,0.08)',
                selected: 'rgba(0,255,65,0.12)',
                disabled: 'rgba(0,255,65,0.28)',
                disabledBackground: 'rgba(0,255,65,0.05)',
            },
        },
        typography: {
            fontFamily: '"IBM Plex Mono", "Cascadia Code", "Fira Code", "Courier New", monospace',
            fontSize: 12,
        },
        components: {
            MuiButton: {
                styleOverrides: {
                    outlinedPrimary: () => ({
                        borderColor: '#006620',
                        color: '#00ff41',
                        '&:hover': {
                            borderColor: '#00ff41',
                            backgroundColor: 'rgba(0,255,65,0.08)',
                            boxShadow: '0 0 8px rgba(0,255,65,0.25)',
                        },
                    }),
                    containedPrimary: () => ({
                        backgroundColor: '#003310',
                        color: '#00ff41',
                        '&:hover': { backgroundColor: '#004d18' },
                    }),
                },
            },
            MuiCardHeader: {
                styleOverrides: {
                    root: () => ({
                        backgroundColor: '#030a03',
                        borderBottom: '1px solid #0a2a0a',
                    }),
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: () => ({
                        backgroundColor: '#030a03',
                        border: '1px solid #0a2a0a',
                        backgroundImage: 'none',
                    }),
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: () => ({
                        backgroundImage: 'none !important',
                        backgroundColor: '#030a03',
                    }),
                },
            },
            MuiDialog: {
                defaultProps: {
                    TransitionProps: { onExit: () => { (document.activeElement as HTMLElement)?.blur() } },
                },
                styleOverrides: {
                    paper: () => ({
                        backgroundImage: 'none !important',
                        backgroundColor: '#020802',
                        border: '1px solid #006620',
                    }),
                },
            },
            MuiDialogTitle: {
                styleOverrides: {
                    root: () => ({
                        '&.MuiDialogTitle-root': {
                            backgroundColor: '#030a03',
                            backgroundImage: 'none !important',
                            borderBottom: '1px solid #0a2a0a',
                            paddingTop: '8px',
                            paddingBottom: '8px',
                            color: '#00ff41',
                            fontFamily: '"IBM Plex Mono", monospace',
                        },
                    }),
                },
            },
            MuiDialogContent: {
                styleOverrides: {
                    root: () => ({
                        '&.MuiDialogContent-dividers': { borderColor: '#0a2a0a' },
                    }),
                },
            },
            MuiDialogActions: {
                styleOverrides: {
                    root: () => ({
                        backgroundColor: '#030a03',
                        borderTop: '1px solid #0a2a0a',
                        padding: '12px 16px',
                    }),
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: () => ({
                        backgroundImage: 'none',
                        backgroundColor: '#000000',
                        color: '#c8f0c8',
                        borderBottom: '1px solid #0a2a0a',
                        boxShadow: '0 1px 8px rgba(0,255,65,0.08)',
                        '& .MuiTypography-root': { color: '#c8f0c8' },
                        '& .MuiIconButton-root': { color: '#c8f0c8' },
                        '& .MuiButtonBase-root': { color: '#c8f0c8' },
                        '& svg': { color: '#c8f0c8' },
                    }),
                },
            },
            MuiSelect: {
                styleOverrides: {
                    icon: () => ({
                        color: '#006620',
                        '.Mui-disabled &': { color: 'rgba(0,255,65,0.28)' },
                    }),
                },
            },
            MuiMenuItem: {
                styleOverrides: {
                    root: () => ({
                        '&.Mui-disabled': {
                            color: 'rgba(0,255,65,0.28)',
                            opacity: 1,
                        },
                    }),
                },
            },
            MuiListItemButton: {
                styleOverrides: {
                    root: () => ({
                        '&.Mui-disabled': {
                            color: 'rgba(0,255,65,0.28)',
                            opacity: 1,
                        },
                    }),
                },
            },
            MuiInputLabel: {
                styleOverrides: {
                    root: () => ({
                        color: '#006620',
                        '&.Mui-disabled': { color: 'rgba(0,255,65,0.38)' },
                    }),
                },
            },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: () => ({
                        color: '#c8f0c8',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#0a2a0a' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#006620' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00ff41' },
                        '&.Mui-disabled': {
                            color: 'rgba(0,255,65,0.38)',
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,255,65,0.15)' },
                        },
                    }),
                },
            },
            MuiFormControlLabel: {
                styleOverrides: {
                    label: () => ({
                        '&.Mui-disabled': { color: 'rgba(0,255,65,0.38)' },
                    }),
                },
            },
            MuiIconButton: {
                styleOverrides: {
                    root: () => ({
                        '&.Mui-disabled': { color: 'rgba(0,255,65,0.28)' },
                    }),
                },
            },
            MuiTab: {
                styleOverrides: {
                    root: () => ({
                        fontFamily: '"IBM Plex Mono", monospace',
                        color: '#006620',
                        '&.Mui-selected': { color: '#00ff41' },
                    }),
                },
            },
            MuiTableHead: {
                styleOverrides: {
                    root: () => ({ backgroundColor: '#030a03' }),
                },
            },
            MuiChip: {
                styleOverrides: {
                    root: () => ({
                        backgroundColor: '#030a03',
                        border: '1px solid #006620',
                        color: '#00ff41',
                        fontFamily: '"IBM Plex Mono", monospace',
                    }),
                },
            },
            MuiCssBaseline: {
                styleOverrides: `
                    ::-webkit-scrollbar { width: 5px; height: 5px; }
                    ::-webkit-scrollbar-thumb { background-color: rgba(0,255,65,0.3); border-radius: 2px; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-corner { background: transparent; }
                    * { caret-color: #00ff41; }
                `,
            },
        },
    }),
}
