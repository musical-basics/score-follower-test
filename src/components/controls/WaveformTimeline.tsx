import { useEffect, useRef, useState } from 'react'

interface WaveformTimelineProps {
    audioUrl: string
    anchors: { measure: number, time: number }[]
    beatAnchors?: { measure: number, beat: number, time: number }[]
    onUpdateAnchor: (measure: number, time: number) => void
    onUpdateBeatAnchor?: (measure: number, beat: number, time: number) => void
    audioRef: React.RefObject<HTMLAudioElement | null>
    onSeek: (time: number) => void
}

export function WaveformTimeline({
    audioUrl, anchors, beatAnchors = [],
    onUpdateAnchor, onUpdateBeatAnchor, audioRef, onSeek
}: WaveformTimelineProps) {
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
    const [zoom, setZoom] = useState(100)
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const playbackCursorRef = useRef<HTMLDivElement>(null)
    const animationFrameRef = useRef<number | null>(null)

    // 1. Load Audio
    useEffect(() => {
        if (!audioUrl) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
        fetch(audioUrl)
            .then(res => res.arrayBuffer())
            .then(buf => ac.decodeAudioData(buf))
            .then(setAudioBuffer)
            .catch(err => console.error(err))
    }, [audioUrl])

    // 2. Draw Waveform
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !audioBuffer) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const width = Math.ceil(audioBuffer.duration * zoom)
        canvas.width = width
        canvas.height = 120

        ctx.fillStyle = '#1e293b' // slate-800
        ctx.fillRect(0, 0, width, 120)

        const data = audioBuffer.getChannelData(0)
        const step = Math.ceil(data.length / width)
        const amp = 60

        ctx.fillStyle = '#94a3b8' // slate-400
        ctx.beginPath()
        for (let i = 0; i < width; i++) {
            let min = 1.0, max = -1.0
            for (let j = 0; j < step; j++) {
                const val = data[(i * step) + j]
                if (val < min) min = val
                if (val > max) max = val
            }
            if (min === 1.0 && max === -1.0) { min = 0; max = 0 }
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp))
        }
    }, [audioBuffer, zoom])

    // 3. Animation Loop
    useEffect(() => {
        const animate = () => {
            if (audioRef.current && playbackCursorRef.current) {
                const time = audioRef.current.currentTime
                const x = time * zoom
                playbackCursorRef.current.style.left = `${x}px`

                if (!audioRef.current.paused && containerRef.current) {
                    const c = containerRef.current
                    const scrollLeft = c.scrollLeft
                    if (x > scrollLeft + c.clientWidth * 0.8) {
                        c.scrollLeft = x - c.clientWidth * 0.2
                    } else if (x < scrollLeft) {
                        c.scrollLeft = x - 50
                    }
                }
            }
            animationFrameRef.current = requestAnimationFrame(animate)
        }
        animationFrameRef.current = requestAnimationFrame(animate)
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current) }
    }, [zoom, audioRef])

    const handleContainerClick = (e: React.MouseEvent) => {
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const clickX = (e.clientX - rect.left) + container.scrollLeft
        onSeek(clickX / zoom)
    }

    // Grid Lines
    const gridLines = []
    if (audioBuffer) {
        for (let i = 0; i <= audioBuffer.duration; i++) {
            gridLines.push(
                <div key={i} className="absolute top-0 bottom-0 border-l border-slate-600/30 pointer-events-none" style={{ left: `${i * zoom}px` }}>
                    <span className="text-[9px] text-slate-500 pl-1">{i}s</span>
                </div>
            )
        }
    }

    return (
        <div className="w-full h-48 bg-slate-900 border-t border-slate-700 flex flex-col">
            <div className="flex items-center justify-between px-2 h-8 bg-slate-800 text-xs text-slate-400">
                <span className="font-bold uppercase tracking-wider">Audio Timeline</span>
                <div className="flex gap-2 items-center">
                    <span>Zoom:</span>
                    <input type="range" min="10" max="500" value={zoom} onChange={e => setZoom(Number(e.target.value))} />
                </div>
            </div>

            <div ref={containerRef} className="flex-1 overflow-x-auto relative cursor-text" onClick={handleContainerClick}>
                <canvas ref={canvasRef} className="block" style={{ height: '120px' }} />

                {gridLines}

                {/* Playback Cursor */}
                <div ref={playbackCursorRef} className="absolute top-0 bottom-0 w-0.5 bg-green-400 z-30 pointer-events-none" style={{ left: 0 }} />

                {/* Level 1 Anchors (Red) - Higher Z-Index (20) */}
                {anchors.map(anchor => (
                    <div key={`m-${anchor.measure}`}
                        className="absolute top-0 h-full w-0.5 bg-red-500 hover:bg-white cursor-ew-resize z-20 group"
                        style={{ left: `${anchor.time * zoom}px` }}
                        onMouseDown={e => {
                            e.stopPropagation(); const startX = e.clientX; const startTime = anchor.time
                            const onMove = (ev: MouseEvent) => onUpdateAnchor(anchor.measure, Math.max(0, startTime + (ev.clientX - startX) / zoom))
                            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
                        }}
                    >
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                            M{anchor.measure}
                        </div>
                    </div>
                ))}

                {/* Level 2 Anchors (Yellow) - Lower Z-Index (10) so Red takes priority */}
                {beatAnchors.map(bAnchor => (
                    <div key={`b-${bAnchor.measure}-${bAnchor.beat}`}
                        className="absolute top-0 h-full w-0.5 bg-yellow-400 hover:bg-white cursor-ew-resize z-10 group"
                        style={{ left: `${bAnchor.time * zoom}px` }}
                        onMouseDown={e => {
                            if (!onUpdateBeatAnchor) return
                            e.stopPropagation(); const startX = e.clientX; const startTime = bAnchor.time
                            const onMove = (ev: MouseEvent) => onUpdateBeatAnchor(bAnchor.measure, bAnchor.beat, Math.max(0, startTime + (ev.clientX - startX) / zoom))
                            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                            window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
                        }}
                    >
                        {/* Beat Label (Appears on Hover) */}
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[9px] px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none font-bold shadow-sm">
                            {bAnchor.beat}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
