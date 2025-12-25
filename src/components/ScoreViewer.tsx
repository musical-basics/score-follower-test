import { useEffect, useRef, useCallback, useState } from 'react'
import { OpenSheetMusicDisplay as OSMD } from 'opensheetmusicdisplay'
import type { AppMode } from '../App'

interface Anchor {
    measure: number
    time: number
}

interface ScoreViewerProps {
    audioRef: React.RefObject<HTMLAudioElement | null>
    anchors: Anchor[]
    mode: AppMode
    musicXmlUrl?: string
}

export function ScoreViewer({ audioRef, anchors, mode, musicXmlUrl }: ScoreViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const cursorRef = useRef<HTMLDivElement>(null)
    const osmdRef = useRef<OSMD | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)
    const animationFrameRef = useRef<number | null>(null)

    // Initialize OSMD
    useEffect(() => {
        if (!containerRef.current || osmdRef.current) return

        const osmd = new OSMD(containerRef.current, {
            autoResize: true,
            followCursor: false, // We're using custom cursor
            drawTitle: true,
            drawSubtitle: true,
            drawComposer: true,
            drawCredits: true,
            drawPartNames: true,
            drawMeasureNumbers: true,
        })

        osmdRef.current = osmd

        // Load the MusicXML file
        const xmlUrl = musicXmlUrl || '/c-major-exercise.musicxml'

        osmd.load(xmlUrl).then(() => {
            osmd.render()
            setIsLoaded(true)
        }).catch((err) => {
            console.error('Failed to load MusicXML:', err)
        })

        return () => {
            osmdRef.current = null
            setIsLoaded(false)
        }
    }, [musicXmlUrl])

    // Find the current measure based on audio time
    const findCurrentMeasure = useCallback((time: number): { measure: number; progress: number } => {
        if (anchors.length === 0) {
            return { measure: 1, progress: 0 }
        }

        // Sort anchors by time to ensure correct order
        const sortedAnchors = [...anchors].sort((a, b) => a.time - b.time)

        // Find which measure we're in
        let currentMeasure = 1
        let measureStartTime = 0
        let measureEndTime = Infinity

        for (let i = 0; i < sortedAnchors.length; i++) {
            const anchor = sortedAnchors[i]

            if (time >= anchor.time) {
                currentMeasure = anchor.measure
                measureStartTime = anchor.time

                // Get end time from next anchor or infinity
                if (i + 1 < sortedAnchors.length) {
                    measureEndTime = sortedAnchors[i + 1].time
                } else {
                    measureEndTime = Infinity
                }
            } else {
                break
            }
        }

        // Calculate progress through current measure (0.0 to 1.0)
        let progress = 0
        if (measureEndTime !== Infinity && measureEndTime > measureStartTime) {
            progress = (time - measureStartTime) / (measureEndTime - measureStartTime)
            progress = Math.max(0, Math.min(1, progress))
        }

        return { measure: currentMeasure, progress }
    }, [anchors])

    // Update cursor position - called from requestAnimationFrame
    const updateCursorPosition = useCallback((audioTime: number) => {
        const osmd = osmdRef.current
        if (!osmd || !isLoaded || !cursorRef.current) return
        if (!osmd.GraphicSheet) return

        const { measure, progress } = findCurrentMeasure(audioTime)

        // In RECORD mode: snap to measure start (progress = 0)
        // In PLAYBACK mode: use interpolated progress
        const effectiveProgress = mode === 'RECORD' ? 0 : progress

        // Convert to 0-index for OSMD
        const currentMeasureIndex = measure - 1

        try {
            const measureList = osmd.GraphicSheet.MeasureList

            if (!measureList || measureList.length === 0) return
            if (currentMeasureIndex >= measureList.length) return

            const measureStaves = measureList[currentMeasureIndex]
            if (!measureStaves || measureStaves.length === 0) return

            const staffMeasure = measureStaves[0]
            if (!staffMeasure) return

            const positionAndShape = staffMeasure.PositionAndShape
            if (!positionAndShape) return

            // OSMD uses internal units - typically multiplied by 10 for pixels
            const unitInPixels = 10

            const absoluteX = positionAndShape.AbsolutePosition.x * unitInPixels
            const absoluteY = positionAndShape.AbsolutePosition.y * unitInPixels
            const width = (positionAndShape.BorderRight - positionAndShape.BorderLeft) * unitInPixels
            const height = (positionAndShape.BorderBottom - positionAndShape.BorderTop) * unitInPixels

            // Apply interpolation for smooth movement within the measure
            const finalX = absoluteX + (width * effectiveProgress)

            // Update the cursor div
            cursorRef.current.style.left = `${finalX}px`
            cursorRef.current.style.top = `${absoluteY}px`
            cursorRef.current.style.height = `${Math.max(height, 80)}px`
            cursorRef.current.style.display = 'block'

            // Update cursor color based on mode
            cursorRef.current.style.backgroundColor = mode === 'RECORD'
                ? 'rgba(255, 0, 0, 0.8)'  // Red for RECORD
                : 'rgba(16, 185, 129, 0.8)' // Green (#10B981) for PLAYBACK
            cursorRef.current.style.boxShadow = mode === 'RECORD'
                ? '0 0 8px rgba(255, 0, 0, 0.5)'
                : '0 0 8px rgba(16, 185, 129, 0.5)'

        } catch (err) {
            console.error('Error positioning cursor:', err)
        }
    }, [findCurrentMeasure, isLoaded, mode])

    // requestAnimationFrame loop for smooth cursor updates
    useEffect(() => {
        if (!isLoaded) return

        const animate = () => {
            const audioTime = audioRef.current?.currentTime ?? 0
            updateCursorPosition(audioTime)
            animationFrameRef.current = requestAnimationFrame(animate)
        }

        // Start the animation loop
        animationFrameRef.current = requestAnimationFrame(animate)

        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [isLoaded, updateCursorPosition, audioRef])

    return (
        <div className="relative w-full h-full overflow-auto bg-white">
            {/* OSMD Container */}
            <div
                ref={containerRef}
                className="w-full min-h-[400px]"
            />

            {/* Custom Cursor Overlay */}
            <div
                ref={cursorRef}
                id="cursor-overlay"
                className="absolute pointer-events-none"
                style={{
                    left: 0,
                    top: 0,
                    width: '3px',
                    height: '100px',
                    backgroundColor: mode === 'RECORD' ? 'rgba(255, 0, 0, 0.8)' : 'rgba(16, 185, 129, 0.8)',
                    boxShadow: mode === 'RECORD' ? '0 0 8px rgba(255, 0, 0, 0.5)' : '0 0 8px rgba(16, 185, 129, 0.5)',
                    zIndex: 1000,
                    display: 'none',
                    transition: mode === 'PLAYBACK' ? 'left 0.05s linear' : 'none',
                }}
            />
        </div>
    )
}
