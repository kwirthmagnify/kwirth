import { useEffect } from 'react'

export const useKeyboard = () => {

    useEffect( () => {
        const handleKeyDown = (event: KeyboardEvent) => {
            event.stopPropagation()
        }
        
        window.addEventListener('keydown', handleKeyDown, true)
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true)
        }
    })
}