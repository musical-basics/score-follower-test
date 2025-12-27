
import { useState, useEffect, useRef } from 'react'

interface ModularIslandProps {
    popEffect: boolean
    setPopEffect: (val: boolean) => void
    darkMode: boolean
    setDarkMode: (val: boolean) => void
    highlightNote: boolean      // <--- NEW PROP
    setHighlightNote: (val: boolean) => void // <--- NEW PROP
    cursorPosition: number
    setCursorPosition: (val: number) => void // <--- NEW PROP
    onDock: () => void // <--- NEW PROP
}

export function ModularIsland({
    popEffect, setPopEffect,
    darkMode, setDarkMode,
    highlightNote, setHighlightNote,
    cursorPosition, setCursorPosition,
    onDock
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
                bg-slate-800/90 backdrop-blur-md text-white p-3 rounded-2xl
                shadow-2xl border border-slate-600 flex flex-col gap-3
                transition-transform hover:scale-105
                ${isDragging ? 'scale-105 ring-2 ring-emerald-500/50' : ''}
            `}>
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                        <div className="text-slate-500 cursor-move">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="2" cy="2" r="2" /><circle cx="8" cy="2" r="2" /><circle cx="14" cy="2" r="2" />
                                <circle cx="2" cy="8" r="2" /><circle cx="8" cy="8" r="2" /><circle cx="14" cy="8" r="2" />
                                <circle cx="2" cy="14" r="2" /><circle cx="8" cy="14" r="2" /><circle cx="14" cy="14" r="2" />
                            </svg>
                        </div>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Floating Controls
                        </span>
                    </div>

                    {/* DOCK BUTTON */}
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={onDock}
                        title="Dock to Menu Bar"
                        className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
                    >
                        ↘
                    </button>
                </div>

                <div className="h-px w-full bg-slate-600"></div>

                {/* Controls Row 1 */}
                <div className="flex items-center justify-between gap-2">
                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setDarkMode(!darkMode)}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${darkMode ? 'bg-slate-600 text-yellow-300' : 'bg-slate-700 text-slate-300'}`}
                    >
                        {darkMode ? '🌙 Dark' : '☀️ Light'}
                    </button>

                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setHighlightNote(!highlightNote)}
                        className={`
                            flex-1 py-1.5 rounded-lg text-sm font-medium transition-all
                            ${highlightNote ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}
                        `}
                    >
                        Color
                    </button>

                    <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setPopEffect(!popEffect)}
                        className={`
                            flex-1 py-1.5 rounded-lg text-sm font-medium transition-all
                            ${popEffect ? 'bg-pink-600 text-white' : 'bg-slate-700 text-slate-400'}
                        `}
                    >
                        Pop
                    </button>
                </div>

                {/* Cursor Position Slider */}
                <div className="w-full pt-1" onMouseDown={(e) => e.stopPropagation()}>
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
                        <span>Cursor Pos</span>
                        <span>{Math.round(cursorPosition * 100)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0.2"
                        max="0.8"
                        step="0.01"
                        value={cursorPosition}
                        onChange={(e) => setCursorPosition(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                </div>
            </div>
        </div>
    )
}
