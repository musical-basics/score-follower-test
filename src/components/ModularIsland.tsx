
import { useState, useEffect, useRef } from 'react'

interface ModularIslandProps {
    popEffect: boolean
    setPopEffect: (val: boolean) => void
    darkMode: boolean
    setDarkMode: (val: boolean) => void
}

export function ModularIsland({ popEffect, setPopEffect, darkMode, setDarkMode }: ModularIslandProps) {
    const [position, setPosition] = useState({ x: window.innerWidth - 250, y: 100 })
    const [isDragging, setIsDragging] = useState(false)
    const dragOffset = useRef({ x: 0, y: 0 })
    const islandRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const savedPos = localStorage.getItem('modularIslandPos')
        if (savedPos) {
            try {
                const parsed = JSON.parse(savedPos)
                setPosition(parsed)
            } catch (e) { console.error(e) }
        }
    }, [])

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        const rect = islandRef.current?.getBoundingClientRect()
        if (rect) {
            dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }
    }

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return
        setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
    }

    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false)
            localStorage.setItem('modularIslandPos', JSON.stringify(position))
        }
    }

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
        } else {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isDragging, position])

    return (
        <div
            ref={islandRef}
            onMouseDown={handleMouseDown}
            className="fixed z-[2000] flex flex-col gap-2 items-end select-none cursor-move active:cursor-grabbing"
            style={{ left: position.x, top: position.y, width: 'max-content' }}
        >
            <div className={`
                bg-slate-800/90 backdrop-blur-md text-white p-2 rounded-2xl 
                shadow-2xl border border-slate-600 flex items-center gap-3 
                transition-transform hover:scale-105
                ${isDragging ? 'scale-105 ring-2 ring-emerald-500/50' : ''}
            `}>
                <div className="pl-2 text-slate-500">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="2" cy="2" r="2" /><circle cx="8" cy="2" r="2" /><circle cx="14" cy="2" r="2" />
                        <circle cx="2" cy="8" r="2" /><circle cx="8" cy="8" r="2" /><circle cx="14" cy="8" r="2" />
                        <circle cx="2" cy="14" r="2" /><circle cx="8" cy="14" r="2" /><circle cx="14" cy="14" r="2" />
                    </svg>
                </div>

                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Visual FX
                </span>
                <div className="w-px h-6 bg-slate-600"></div>

                {/* Dark Mode Toggle */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setDarkMode(!darkMode)}
                    className={`
                        px-3 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2
                        ${darkMode
                            ? 'bg-slate-100 text-slate-900 border border-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'}
                    `}
                >
                    {darkMode ? '☀️' : '🌙'}
                </button>

                {/* Pop Effect Toggle */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setPopEffect(!popEffect)}
                    className={`
                        px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2
                        ${popEffect
                            ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/30 border border-pink-500'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'}
                    `}
                >
                    <span>💥 Pop</span>
                </button>
            </div>
        </div>
    )
}
