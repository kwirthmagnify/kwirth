import React, { useEffect, useRef } from 'react'
import { TerminalManager } from './TerminalManager'

interface ITerminalInstanceProps {
    id: string|undefined
    terminalManager:TerminalManager
}

export const TerminalInstance: React.FC<ITerminalInstanceProps> = (props: ITerminalInstanceProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null); // Para cancelar el frame pendiente

    useEffect(() => {
        if (!props.id || !containerRef.current) return;

        const managedTerminal = props.terminalManager.attachTerminal(props.id);
        if (!managedTerminal) return;

        const { term, fitAddon } = managedTerminal;
        
        let isDisposed = false;

        const resizeObserver = new ResizeObserver(() => {
            if (isDisposed || !containerRef.current) return;

            if (containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
                
                rafRef.current = requestAnimationFrame(() => {
                    if (!isDisposed && term && (term as any)._core) {
                        try {
                            fitAddon.fit();
                        } catch (e) {
                            console.warn("Error fitting terminal:", e);
                        }
                    }
                });
            }
        });

        term.open(containerRef.current);
        resizeObserver.observe(containerRef.current);
        
        const timeoutFocus = setTimeout(() => {
            if (!isDisposed) term.focus();
        }, 200);

        return () => {
            isDisposed = true;
            resizeObserver.disconnect();
            clearTimeout(timeoutFocus);
            
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }

            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [props.id, props.terminalManager]);

    if (!props.id) return null;

    return (
        <div 
            ref={containerRef} 
            style={{ 
                width: '100%', 
                height: '100%', 
                flex: 1, 
                minHeight: 0, 
                overflow: 'hidden', 
                background: 'black', 
                paddingBottom: '16px' 
            }} 
        />
    );
};





// import React, { useEffect, useRef } from 'react'
// import { TerminalManager } from './TerminalManager'

// interface ITerminalInstanceProps {
//     id: string|undefined
//     terminalManager:TerminalManager
// }

// export const TerminalInstance: React.FC<ITerminalInstanceProps> = (props:ITerminalInstanceProps) => {
//     const containerRef = useRef<HTMLDivElement | null>(null)

//     useEffect ( () => {
//         if (!props.id) return
//         const managedTerminal = props.terminalManager.attachTerminal(props.id)
//         if (managedTerminal) managedTerminal.fitAddon.fit()
//     })

//     useEffect(() => {
//         if (!props.id) return

//         const managedTerminal = props.terminalManager.attachTerminal(props.id)
//         if (managedTerminal) {
//             const { term, fitAddon } = managedTerminal

//             const resizeObserver = new ResizeObserver(() => {
//                 if (containerRef.current && containerRef.current.offsetWidth > 0) {
//                     //const { offsetWidth, offsetHeight } = containerRef.current
//                     requestAnimationFrame(() => {
//                         fitAddon.fit()
//                     })
//                 }
//             })


//             // Foco inicial
//             setTimeout(() => term.focus(), 100)

//             if (containerRef.current) {
//                 term.open(containerRef.current)
//                 resizeObserver.observe(containerRef.current)
//                 fitAddon.fit()
//             }
 
//             return () => {
//                 // Dettach terminal from DOM, but do NOT dispose it.
//                 resizeObserver.disconnect()
//                 if (containerRef.current) containerRef.current.innerHTML = ''
//             }
//         }
//     }, [props.id])

//     if (!props.id) return <></>

//     if (props.terminalManager && props.id) {
//         let t = props.terminalManager.terminals.get(props.id)
//         if (t) setTimeout ( () => t!.term.focus(), 100)
//     }

//     return (
//         <div ref={containerRef} style={{ width: '100%', height:'100%', flex:1, minHeight:0, overflow: 'hidden', background: 'black', paddingBottom:'16px' }} />
//     )
// }