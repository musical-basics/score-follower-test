import { useEffect, useRef, useState } from 'react'

interface WaveformTimelineProps {
    audioUrl: string
    anchors: { measure: number, time: number }[]
    onUpdateAnchor: (measure: number, time: number) => void
}

export function WaveformTimeline({ audioUrl, anchors, onUpdateAnchor }: WaveformTimelineProps) {
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
    const [zoom, setZoom] = useState(100) // 100px per second
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // 1. Load Audio
    useEffect(() => {
        if (!audioUrl) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
        fetch(audioUrl)
            .then(res => res.arrayBuffer())
            .then(buf => ac.decodeAudioData(buf))
            .then(setAudioBuffer)
            .catch(err => console.error("Error decoding audio:", err))
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

        // Background
        ctx.fillStyle = '#1e293b' // slate-800
        ctx.fillRect(0, 0, width, 120)

        // Waveform
        const data = audioBuffer.getChannelData(0)
        const step = Math.ceil(data.length / width)
        const amp = 60 // half height

        ctx.fillStyle = '#94a3b8' // slate-400
        ctx.beginPath()

        for (let i = 0; i < width; i++) {
            let min = 1.0, max = -1.0
            for (let j = 0; j < step; j++) {
                const val = data[(i * step) + j]
                if (val < min) min = val
                if (val > max) max = val
            }
            if (min === 1.0 && max === -1.0) { // No data in this step
                min = 0
                max = 0
            }
            // Draw vertical bar for this pixel
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp))
        }
    }, [audioBuffer, zoom])

    // Generate Grid Lines
    const gridLines = []
    if (audioBuffer) {
        const totalSeconds = Math.ceil(audioBuffer.duration)
        for (let i = 0; i <= totalSeconds; i++) {
            gridLines.push(
                <div
                    key={i}
                    className="absolute top-0 bottom-0 border-l border-slate-600/30 pointer-events-none select-none"
                    style={{ left: `${i * zoom}px` }}
                >
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

            <div ref={containerRef} className="flex-1 overflow-x-auto relative">
                <canvas ref={canvasRef} className="block" style={{ height: '120px' }} />

                {gridLines}

                {/* Anchors Overlay */}
                {anchors.map(anchor => (
                    <div
                        key={anchor.measure}
                        className="absolute top-0 h-full w-0.5 bg-red-500 hover:bg-white cursor-ew-resize z-20 group"
                        style={{ left: `${anchor.time * zoom}px` }}
                        onMouseDown={e => {
                            e.stopPropagation()
                            const startX = e.clientX
                            const startTime = anchor.time

                            const onMove = (moveE: MouseEvent) => {
                                const diffPx = moveE.clientX - startX
                                const diffTime = diffPx / zoom
                                onUpdateAnchor(anchor.measure, Math.max(0, startTime + diffTime))
                            }
                            const onUp = () => {
                                window.removeEventListener('mousemove', onMove)
                                window.removeEventListener('mouseup', onUp)
                            }
                            window.addEventListener('mousemove', onMove)
                            window.addEventListener('mouseup', onUp)
                        }}
                    >
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                            M{anchor.measure} ({anchor.time.toFixed(2)}s)
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
