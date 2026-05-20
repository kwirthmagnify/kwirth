// MIXED (Gemini-Julio)
import React, { useState, useCallback, useRef, useImperativeHandle } from 'react'
import { Dialog, Paper, Box, useTheme } from '@mui/material'
import Draggable, { DraggableData } from 'react-draggable'
import { ResizableBox, ResizeCallbackData } from 'react-resizable'

export interface IResizableDialogHandle {
    snapTo: (position: 'left' | 'right') => void
}

const CustomHandle = React.forwardRef<HTMLDivElement, any>((props, ref) => {
    const { handleAxis, ...restProps } = props
    const isTop = handleAxis === 'ne' || handleAxis === 'nw'
    const isRight = handleAxis === 'se' || handleAxis === 'ne'
    const cursors: Record<string, string> = { se: 'nwse-resize', sw: 'nesw-resize', ne: 'nesw-resize', nw: 'nwse-resize' }
    const style: React.CSSProperties = {
        position: 'absolute',
        [isTop ? 'top' : 'bottom']: 3,
        [isRight ? 'right' : 'left']: 3,
        width: '12px', height: '12px', zIndex: 20,
        cursor: cursors[handleAxis] ?? 'pointer',
        borderRight: isRight ? '3px solid #bdbdbd' : 'none',
        borderLeft: !isRight ? '3px solid #bdbdbd' : 'none',
        borderTop: isTop ? '3px solid #bdbdbd' : 'none',
        borderBottom: !isTop ? '3px solid #bdbdbd' : 'none',
        borderRadius: handleAxis === 'se' ? '0 0 4px 0' : handleAxis === 'sw' ? '0 0 0 4px' : handleAxis === 'ne' ? '0 4px 0 0' : '4px 0 0 0',
    }
    return <div ref={ref} style={style} {...restProps} />
})

const PaperComponent = React.forwardRef<HTMLDivElement, any>((props, ref) => {
    const { nodeRef, position, onDrag, onStart, onStop, disabled, ...other } = props
    return (
        <Draggable
            nodeRef={nodeRef} handle='#draggable-dialog-title'
            cancel={'[class*="MuiIconButton-root"], [class*="MuiButton-root"], .no-drag'}
            position={disabled ? { x: 0, y: 0 } : position}
            onStart={onStart} onDrag={onDrag} onStop={onStop} disabled={disabled}
        >
            <Paper {...other} ref={nodeRef} style={{ ...other.style, position: 'fixed', top: 0, left: 0, margin: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} />
        </Draggable>
    )
})

interface IResizableDialogProps {
    id: string; children: React.ReactNode; isMaximized?: boolean; isActive?: boolean; onFocus?: () => void;
    onWindowChange?: (id: string, isMaximized: boolean, x: number, y: number, width: number, height: number) => void
    x?: number; y?: number; width?: number; height?: number
}

function ResizableDialogImpl(
    { id, children, isMaximized = false, isActive = false, onFocus, onWindowChange, x = 100, y = 50, width = 800, height = 600 }: IResizableDialogProps,
    ref: React.ForwardedRef<IResizableDialogHandle>
) {
    const [isDragging, setIsDragging] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    const [layout, setLayout] = useState({ x, y, width, height })

    const contentRef = useRef<HTMLDivElement>(null)
    const snapshotRef = useRef<HTMLDivElement>(null)
    const paperRef = useRef<HTMLDivElement>(null)
    const theme = useTheme()

    useImperativeHandle(ref, () => ({
        snapTo: (position: 'left' | 'right') => {
            const half = Math.floor(window.innerWidth / 2)
            const h = window.innerHeight
            const newLayout = position === 'left'
                ? { x: 0, y: 0, width: half, height: h }
                : { x: half, y: 0, width: half, height: h }
            setLayout(newLayout)
            onWindowChange?.(id, false, newLayout.x, newLayout.y, newLayout.width, newLayout.height)
        }
    }))

    // Crea un clon estático del contenido para el Drag
    const createSnapshot = () => {
        if (contentRef.current && snapshotRef.current) {
            snapshotRef.current.innerHTML = contentRef.current.innerHTML
        }
    }

    const handleDragStart = () => {
        createSnapshot()
        setIsDragging(true)
        onFocus?.()
    }

    const handleDragStop = () => {
        setIsDragging(false)
        onWindowChange?.(id, isMaximized, layout.x, layout.y, layout.width, layout.height)
    }

    const handleResizeStart = () => { setIsResizing(true); onFocus?.(); }
    const handleResizeStop = () => {
        setIsResizing(false)
        onWindowChange?.(id, isMaximized, layout.x, layout.y, layout.width, layout.height)
    }

    const handleDrag = useCallback((_e: any, data: DraggableData) => {
        setLayout(prev => ({ ...prev, x: data.x, y: data.y }))
    }, [])

    const handleResize = useCallback((_e: any, { size, handle }: ResizeCallbackData) => {
        setLayout(prev => {
            let newX = prev.x
            let newY = prev.y
            if (handle === 'sw' || handle === 'nw') newX = prev.x - (size.width - prev.width)
            if (handle === 'ne' || handle === 'nw') newY = prev.y - (size.height - prev.height)
            return { ...prev, width: size.width, height: size.height, x: newX, y: newY }
        })
    }, [])

    return (
        <Dialog
            open={true} hideBackdrop disableEnforceFocus disableRestoreFocus disablePortal maxWidth={false}
            onMouseDown={onFocus} PaperComponent={PaperComponent as any}
            PaperProps={{ nodeRef: paperRef, position: { x: layout.x, y: layout.y }, onStart: handleDragStart, onDrag: handleDrag, onStop: handleDragStop, disabled: isMaximized }}
            sx={{
                pointerEvents: 'none',
                '& .MuiDialog-container': { display: 'block' },
                '& .MuiDialog-paper': { 
                    pointerEvents: 'auto', maxWidth: 'none', maxHeight: 'none', 
                    transition: (isDragging || isResizing) ? 'none' : 'all 0.2s ease-in-out' 
                }
            }}
        >
            <ResizableBox
                width={isMaximized ? window.innerWidth : layout.width}
                height={isMaximized ? window.innerHeight : layout.height}
                onResizeStart={handleResizeStart} onResize={handleResize} onResizeStop={handleResizeStop}
                resizeHandles={isMaximized ? [] : ['se', 'sw', 'ne', 'nw']}
                handle={(axis, ref) => <CustomHandle handleAxis={axis} ref={ref} />}
            >
                <Box sx={{
                    display: 'flex', flexDirection: 'column', height: '100%', width: '100%',
                    position: 'relative', overflow: 'hidden', bgcolor: 'background.paper',
                    border: theme.palette.mode === 'dark'
                        ? `1px solid ${isActive ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`
                        : `1px solid ${theme.palette.divider}`,
                    boxShadow: theme.palette.mode === 'dark'
                        ? isActive
                            ? '0 1px 0 rgba(255,255,255,0.12) inset, 0 12px 40px rgba(0,0,0,1), 0 4px 12px rgba(0,0,0,0.8)'
                            : '0 2px 8px rgba(0,0,0,0.6)'
                        : undefined,
                    opacity: theme.palette.mode === 'dark' && !isActive ? 0.6 : 1,
                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.2s ease',
                }}>
                    {/* 1. MODO RESIZE: No renderizamos nada (máximo rendimiento) */}
                    {isResizing && (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                            Resizing...
                        </Box>
                    )}

                    {/* 2. MODO DRAG: Mostramos el clon estático blurreado */}
                    <Box 
                        ref={snapshotRef}
                        sx={{ 
                            display: isDragging ? 'block' : 'none',
                            width: '100%', height: '100%', 
                            filter: 'blur(3px)', opacity: 0.8,
                            pointerEvents: 'none', transform: 'translateZ(0)' 
                        }} 
                    />

                    {/* 3. MODO NORMAL: El contenido vivo */}
                    <Box ref={contentRef} sx={{ display: (isDragging || isResizing) ? 'none' : 'block', width: '100%', height: '100%' }}>
                        <Box sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            width: '100%',
                            border: theme.palette.mode === 'dark'
                                ? `1px solid ${isActive ? '#444' : '#1e1e1e'}`
                                : '1px solid #ccc',
                            backgroundColor: theme.palette.background.default,
                            position: 'relative',
                            borderRadius: isMaximized ? 0 : '4px',
                            overflow: 'hidden'
                        }}>
                            {children}
                        </Box>
                    </Box>
                </Box>
            </ResizableBox>
        </Dialog>
    )
}

const ResizableDialog = React.forwardRef(ResizableDialogImpl)

export { ResizableDialog }