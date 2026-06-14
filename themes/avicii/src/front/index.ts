declare global { interface Window { __kwirth_themes__: Record<string, any> } }

window.__kwirth_themes__ = window.__kwirth_themes__ ?? {}
window.__kwirth_themes__['avicii'] = {
    displayName: 'Avicii',
    getThemeOptions: (mode: 'light' | 'dark') => ({
        cssVariables: true,
        palette: {
            mode,
            primary:   { main: mode === 'dark' ? '#c9a227' : '#8a6b0a' },
            secondary: { main: mode === 'dark' ? '#f0ede6' : '#2a2218' },
            background: {
                default: mode === 'dark' ? '#050505' : '#f5f2ec',
                paper:   mode === 'dark' ? '#0b0907' : '#fffdf7',
            },
            text: {
                primary:   mode === 'dark' ? '#f0ede6' : '#1a1208',
                secondary: mode === 'dark' ? '#6a6058' : '#5a4e3a',
            },
            divider: mode === 'dark' ? '#1f1a12' : '#d8ccb0',
        },
        shape: { borderRadius: 0 },
        typography: {
            fontFamily: "'Oswald', 'Barlow Condensed', 'Arial Narrow', sans-serif",
            fontSize: 13,
            fontWeightLight: 300,
            fontWeightRegular: 400,
            fontWeightMedium: 600,
            fontWeightBold: 700,
            h1: { letterSpacing: '4px', textTransform: 'uppercase' as const },
            h2: { letterSpacing: '3px', textTransform: 'uppercase' as const },
            h3: { letterSpacing: '2px', textTransform: 'uppercase' as const },
            h4: { letterSpacing: '2px', textTransform: 'uppercase' as const },
            h5: { letterSpacing: '1.5px', textTransform: 'uppercase' as const },
            h6: { letterSpacing: '1px', textTransform: 'uppercase' as const },
            button: { letterSpacing: '2px', textTransform: 'uppercase' as const },
        },
        components: {
            MuiButton: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        borderRadius: 0,
                        letterSpacing: '2px',
                        fontWeight: 700,
                    }),
                    outlinedPrimary: ({ theme }: any) => ({
                        borderColor: theme.palette.mode === 'dark' ? '#5c4810' : '#8a6b0a',
                        '&:hover': {
                            borderColor: '#c9a227',
                            backgroundColor: 'rgba(201,162,39,0.06)',
                            boxShadow: '0 0 12px rgba(201,162,39,0.2)',
                        },
                    }),
                },
            },
            MuiCardHeader: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundColor: theme.palette.mode === 'dark' ? '#100d08' : '#ede8da',
                        borderBottom: `2px solid ${theme.palette.mode === 'dark' ? '#c9a227' : '#8a6b0a'}`,
                        '& .MuiCardHeader-title': {
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                        },
                    }),
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        borderRadius: 0,
                        border: `1px solid ${theme.palette.mode === 'dark' ? '#1f1a12' : '#d8ccb0'}`,
                        borderTop: `2px solid ${theme.palette.mode === 'dark' ? '#c9a227' : '#8a6b0a'}`,
                        backgroundImage: 'none',
                    }),
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundImage: 'none !important',
                        backgroundColor: theme.palette.mode === 'dark' ? '#0b0907' : theme.palette.background.paper,
                        borderRadius: 0,
                    }),
                },
            },
            MuiDialog: {
                defaultProps: {
                    TransitionProps: { onExit: () => { (document.activeElement as HTMLElement)?.blur() } },
                },
                styleOverrides: {
                    root: () => ({ border: '1px solid #1f1a12' }),
                    paper: ({ theme }: any) => ({
                        backgroundImage: 'none !important',
                        backgroundColor: theme.palette.mode === 'dark' ? '#080604' : '#fff',
                        borderRadius: 0,
                        border: `1px solid ${theme.palette.mode === 'dark' ? '#2a2218' : '#d8ccb0'}`,
                        borderTop: `3px solid #c9a227`,
                    }),
                },
            },
            MuiDialogTitle: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        '&.MuiDialogTitle-root': {
                            backgroundColor: theme.palette.mode === 'dark' ? '#100d08' : '#ede8da',
                            backgroundImage: 'none !important',
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            paddingTop: theme.spacing(1),
                            paddingBottom: theme.spacing(1),
                            color: theme.palette.text.primary,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                        },
                    }),
                },
            },
            MuiDialogContent: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        '&.MuiDialogContent-dividers': { borderColor: theme.palette.divider },
                    }),
                },
            },
            MuiDialogActions: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundColor: theme.palette.mode === 'dark' ? '#100d08' : '#ede8da',
                        borderTop: `1px solid ${theme.palette.divider}`,
                        padding: theme.spacing(1.5, 2),
                    }),
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundImage: 'none',
                        backgroundColor: theme.palette.mode === 'dark' ? '#050505' : theme.palette.primary.main,
                        borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#2a2218' : 'transparent'}`,
                    }),
                },
            },
            MuiTab: {
                styleOverrides: {
                    root: () => ({
                        letterSpacing: '1.5px',
                        fontWeight: 600,
                    }),
                },
            },
            MuiCssBaseline: {
                styleOverrides: (theme: any) => `
                    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');
                    ::-webkit-scrollbar { width: 5px; height: 5px; }
                    ::-webkit-scrollbar-thumb { background-color: ${theme.palette.mode === 'dark' ? 'rgba(201,162,39,0.35)' : 'rgba(0,0,0,0.2)'}; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-corner { background: transparent; }
                `,
            },
        },
    }),
}
