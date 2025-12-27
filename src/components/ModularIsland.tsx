
import { useState, useEffect, useRef } from 'react'

interface ModularIslandProps {
    popEffect: boolean
    setPopEffect: (val: boolean) => void
    darkMode: boolean
    setDarkMode: (val: boolean) => void
    highlightNote: boolean      // <--- NEW PROP
    setHighlightNote: (val: boolean) => void // <--- NEW PROP
}

export function ModularIsland({
    popEffect, setPopEffect,
    darkMode, setDarkMode,
    highlightNote, setHighlightNote
}: ModularIslandProps) {
    const [position, setPosition] = useState({ x: window.innerWidth - 250, y: 100 })
    const [isDragging, setIsDragging] = useState(false)
    const dragOffset = useRef({ x: 0, y: 0 })
    const islandRef = useRef<HTMLDivElement>(null)

    // 2. Load Position from LocalStorage on Mount
    useEffect(() => {
        const savedPos = localStorage.getItem('modularIslandPos')
        if (savedPos) {
            try {
                const parsed = JSON.parse(savedPos)
                setPosition(parsed)
            } catch (e) {
                console.error("Failed to parse island position", e)
            }
        }
    }, [])

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        const rect = islandRef.current?.getBoundingClientRect()
        if (rect) {
            dragOffset.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            }
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
                shadow-2xl border border-slate-600 flex items-center gap-2 
                transition-transform hover:scale-105
                ${isDragging ? 'scale-105 ring-2 ring-emerald-500/50' : ''}
            `}>
                <div className="pl-2 pr-2 text-slate-500 cursor-move">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="2" cy="2" r="2" /><circle cx="8" cy="2" r="2" /><circle cx="14" cy="2" r="2" />
                        <circle cx="2" cy="8" r="2" /><circle cx="8" cy="8" r="2" /><circle cx="14" cy="8" r="2" />
                        <circle cx="2" cy="14" r="2" /><circle cx="8" cy="14" r="2" /><circle cx="14" cy="14" r="2" />
                    </svg>
                </div>

                {/* Dark Mode */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setDarkMode(!darkMode)}
                    title="Toggle Dark Mode"
                    className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-slate-600 text-yellow-300' : 'bg-slate-700 text-slate-300'}`}
                >
                    {darkMode ? '🌙' : '☀️'}
                </button>

                <div className="w-px h-6 bg-slate-600 mx-1"></div>

                {/* Highlight Toggle */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setHighlightNote(!highlightNote)}
                    className={`
                        px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1
                        ${highlightNote
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}
                    `}
                >
                    <span>🎨 Color</span>
                </button>

                {/* Pop Effect Toggle */}
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setPopEffect(!popEffect)}
                    className={`
                        px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1
                        ${popEffect
                            ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/30'
                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}
                    `}
                >
                    <span>💥 Pop</span>
                </button>
            </div>
        </div>
    )
}
