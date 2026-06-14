declare const window: any

// ── Depeche Mode "Memento Mori" palette ───────────────────────────────────
// Abyss   : #0A0808  (near-black warm dark bg)
// Blood   : #C4303A  (primary dark — DM classic red)
// Crimson : #8B1520  (primary light)
// Bone    : #EDE0D0  (warm off-white text)
// Parch   : #F0E8DC  (warm parchment light bg)
// Taupe   : #9C8B7C  (secondary)
// ──────────────────────────────────────────────────────────────────────────

const MuiButton = {
    styleOverrides: {
        root: {
            borderRadius: 0,
            textTransform: 'uppercase' as const,
            fontWeight: 900,
            letterSpacing: 2,
            fontFamily: '"Barlow Condensed", "Oswald", "Impact", "Franklin Gothic Medium", "Arial Narrow", sans-serif'
        },
        containedPrimary: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#C4303A' : '#8B1520',
            color: '#FFFFFF',
            boxShadow: 'none',
            '&:hover': {
                background: theme.palette.mode === 'dark' ? '#D94050' : '#6A0F18',
                boxShadow: theme.palette.mode === 'dark'
                    ? '0 0 12px rgba(196,48,58,0.5)'
                    : '0 0 10px rgba(139,21,32,0.35)'
            }
        }),
        outlinedPrimary: ({ theme }: any) => ({
            borderColor: theme.palette.mode === 'dark' ? '#C4303A' : '#8B1520',
            borderWidth: 2,
            color: theme.palette.mode === 'dark' ? '#C4303A' : '#8B1520',
            '&:hover': {
                borderWidth: 2,
                background: theme.palette.mode === 'dark'
                    ? 'rgba(196,48,58,0.10)'
                    : 'rgba(139,21,32,0.07)'
            }
        })
    }
}

const MuiAppBar = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#0A0808' : '#130808',
            borderBottom: '3px solid #C4303A',
            boxShadow: 'none',
            color: '#EDE0D0'
        })
    }
}

const MuiPaper = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            backgroundImage: 'none',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#2A1616' : '#D8C0B0'}`
        })
    }
}

const MuiCard = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#130C0C' : '#FBF5ED',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#2A1616' : '#D8C0B0'}`,
            borderRadius: 0,
            borderLeft: '4px solid #C4303A'
        })
    }
}

const MuiCardHeader = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #0A0808 0%, #1A0A0A 100%)'
                : 'linear-gradient(135deg, #EDE0D0 0%, #E0D0C0 100%)',
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#2A1616' : '#D0B8A8'}`,
            padding: '10px 16px'
        }),
        title: ({ theme }: any) => ({
            color: theme.palette.mode === 'dark' ? '#C4303A' : '#8B1520',
            fontWeight: 900,
            fontSize: '0.875rem',
            letterSpacing: 1.5,
            textTransform: 'uppercase' as const,
            fontFamily: '"Barlow Condensed", "Oswald", "Impact", "Franklin Gothic Medium", "Arial Narrow", sans-serif'
        })
    }
}

const MuiDialog = {
    styleOverrides: {
        paper: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#0A0808' : '#FBF5ED',
            border: `1px solid ${theme.palette.mode === 'dark' ? '#2A1616' : '#D0B8A8'}`,
            borderTop: '3px solid #C4303A',
            borderRadius: 0,
            backgroundImage: 'none'
        })
    }
}

const MuiDialogTitle = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, #080606 0%, #0A0808 100%)'
                : 'linear-gradient(135deg, #EDE0D0 0%, #E5D5C5 100%)',
            borderBottom: `1px solid ${theme.palette.mode === 'dark' ? '#2A1616' : '#D0B8A8'}`,
            color: theme.palette.mode === 'dark' ? '#EDE0D0' : '#1A0808',
            fontWeight: 900,
            fontSize: '0.95rem',
            letterSpacing: 2,
            textTransform: 'uppercase' as const,
            fontFamily: '"Barlow Condensed", "Oswald", "Impact", "Franklin Gothic Medium", "Arial Narrow", sans-serif',
            padding: '12px 20px'
        })
    }
}

const MuiDialogContent = {
    styleOverrides: {
        root: { padding: '16px 20px' }
    }
}

const MuiDialogActions = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            borderTop: `1px solid ${theme.palette.mode === 'dark' ? '#2A1616' : '#D0B8A8'}`,
            padding: '10px 16px'
        })
    }
}

const MuiChip = {
    styleOverrides: {
        root: {
            borderRadius: 0,
            fontWeight: 700,
            fontSize: '0.72rem',
            letterSpacing: 1,
            textTransform: 'uppercase' as const
        },
        colorPrimary: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#2A1010' : '#EDD8D0',
            color: theme.palette.mode === 'dark' ? '#C4303A' : '#8B1520',
            borderColor: theme.palette.mode === 'dark' ? '#C4303A' : '#8B1520'
        })
    }
}

const MuiDivider = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            borderColor: theme.palette.mode === 'dark' ? '#2A1616' : '#D0B8A8'
        })
    }
}

const MuiTableHead = {
    styleOverrides: {
        root: ({ theme }: any) => ({
            background: theme.palette.mode === 'dark' ? '#0A0808' : '#130808',
            '& .MuiTableCell-head': {
                color: '#EDE0D0',
                fontWeight: 900,
                letterSpacing: 1.5,
                textTransform: 'uppercase' as const,
                fontSize: '0.78rem',
                fontFamily: '"Barlow Condensed", "Oswald", "Impact", "Franklin Gothic Medium", "Arial Narrow", sans-serif'
            }
        })
    }
}

const MuiCssBaseline = {
    styleOverrides: (theme: any) => ({
        body: {
            background: theme.palette.mode === 'dark'
                ? 'linear-gradient(160deg, #080606 0%, #0A0808 100%)'
                : '#F0E8DC',
            scrollbarColor: theme.palette.mode === 'dark' ? '#2A1616 transparent' : '#D0B8A8 transparent',
            scrollbarWidth: 'thin'
        }
    })
}

window.__kwirth_themes__['depeche-mode'] = {
    displayName: 'Depeche Mode',
    getThemeOptions: (mode: 'light' | 'dark') => ({
        cssVariables: true,
        palette: {
            mode,
            primary: {
                main:         mode === 'dark' ? '#C4303A' : '#8B1520',
                light:        mode === 'dark' ? '#D45060' : '#B02030',
                dark:         mode === 'dark' ? '#8B1520' : '#5C0A10',
                contrastText: '#FFFFFF'
            },
            secondary: {
                main:         '#9C8B7C',
                light:        '#B8A898',
                dark:         '#7A6855',
                contrastText: '#FFFFFF'
            },
            error:   { main: '#C4303A' },
            warning: { main: '#C87830' },
            info:    { main: '#9C8B7C' },
            success: { main: '#4A8050' },
            background: {
                default: mode === 'dark' ? '#0A0808' : '#F0E8DC',
                paper:   mode === 'dark' ? '#130C0C' : '#FBF5ED'
            },
            text: {
                primary:   mode === 'dark' ? '#EDE0D0' : '#1A0808',
                secondary: mode === 'dark' ? '#A89080' : '#5C3C30',
                disabled:  mode === 'dark' ? '#4A3030' : '#C0A090'
            },
            divider: mode === 'dark' ? '#2A1616' : '#D0B8A8'
        },
        typography: {
            fontFamily: '"Barlow Condensed", "Oswald", "Impact", "Franklin Gothic Medium", "Arial Narrow", sans-serif',
            fontSize: 13,
            h1: { fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase' as const },
            h2: { fontWeight: 900, letterSpacing: 2.5, textTransform: 'uppercase' as const },
            h3: { fontWeight: 800, letterSpacing: 2 },
            h4: { fontWeight: 800, letterSpacing: 1.5 },
            h5: { fontWeight: 700, letterSpacing: 1 },
            h6: { fontWeight: 700, letterSpacing: 0.8 },
            button: { fontWeight: 900, letterSpacing: 2 },
            overline: { fontWeight: 700, letterSpacing: 3 }
        },
        shape: { borderRadius: 0 },
        components: {
            MuiButton,
            MuiAppBar,
            MuiPaper,
            MuiCard,
            MuiCardHeader,
            MuiDialog,
            MuiDialogTitle,
            MuiDialogContent,
            MuiDialogActions,
            MuiChip,
            MuiDivider,
            MuiTableHead,
            MuiCssBaseline
        }
    })
}
