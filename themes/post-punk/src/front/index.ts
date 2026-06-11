declare global { interface Window { __kwirth_themes__: Record<string, any> } }

window.__kwirth_themes__ = window.__kwirth_themes__ ?? {}
window.__kwirth_themes__['post-punk'] = {
    displayName: 'Post Punk',
    getThemeOptions: (mode: 'light' | 'dark') => ({
        cssVariables: true,
        palette: {
            mode,
            primary:   { main: mode === 'dark' ? '#c8e000' : '#5a6500' },
            secondary: { main: mode === 'dark' ? '#ff3c78' : '#c0003a' },
            background: {
                default: mode === 'dark' ? '#0a0a0a' : '#f4f4f0',
                paper:   mode === 'dark' ? '#111111' : '#ffffff',
            },
            text: {
                primary:   mode === 'dark' ? '#e8e8d8' : '#1a1a14',
                secondary: mode === 'dark' ? '#999980' : '#55554a',
            },
            divider: mode === 'dark' ? '#2a2a22' : '#d0d0c0',
        },
        typography: {
            fontFamily: '"IBM Plex Mono", "Courier New", monospace',
            fontSize: 13,
        },
        components: {
            MuiCardHeader: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundColor: theme.palette.mode === 'dark' ? '#1a1a14' : '#e8e8d8',
                        borderBottom: `1px solid ${theme.palette.divider}`,
                    }),
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundImage: 'none !important',
                        backgroundColor: theme.palette.mode === 'dark' ? '#111111' : theme.palette.background.paper,
                    }),
                },
            },
            MuiDialog: {
                defaultProps: {
                    TransitionProps: {
                        onExit: () => { (document.activeElement as HTMLElement)?.blur() },
                    },
                },
                styleOverrides: {
                    root: () => ({
                        border: '1px',
                        borderColor: '#2a2a22',
                        borderStyle: 'solid',
                    }),
                    paper: ({ theme }: any) => ({
                        backgroundImage: 'none !important',
                        backgroundColor: theme.palette.mode === 'dark' ? '#0d0d0a' : '#fff',
                    }),
                },
            },
            MuiDialogTitle: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        '&.MuiDialogTitle-root': {
                            backgroundColor: theme.palette.mode === 'dark' ? '#1a1a14' : '#e8e8d8',
                            backgroundImage: 'none !important',
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            paddingTop: theme.spacing(1),
                            paddingBottom: theme.spacing(1),
                            color: theme.palette.text.primary,
                        },
                    }),
                },
            },
            MuiDialogContent: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        '&.MuiDialogContent-dividers': {
                            borderColor: theme.palette.divider,
                        },
                    }),
                },
            },
            MuiDialogActions: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundColor: theme.palette.mode === 'dark' ? '#1a1a14' : '#e8e8d0',
                        borderTop: `1px solid ${theme.palette.divider}`,
                        padding: theme.spacing(1.5, 2),
                    }),
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }: any) => ({
                        backgroundImage: 'none',
                        backgroundColor: theme.palette.mode === 'dark' ? '#0a0a0a' : theme.palette.primary.main,
                    }),
                },
            },
            MuiCssBaseline: {
                styleOverrides: (theme: any) => ({
                    '::-webkit-scrollbar': {
                        width: '6px',
                        height: '6px',
                    },
                    '::-webkit-scrollbar-thumb': {
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(200,224,0,0.3)' : 'rgba(0,0,0,0.25)',
                        borderRadius: '2px',
                    },
                    '::-webkit-scrollbar-track': {
                        background: 'transparent',
                    },
                    '::-webkit-scrollbar-corner': {
                        background: 'transparent',
                    },
                }),
            },
        },
    }),
}
