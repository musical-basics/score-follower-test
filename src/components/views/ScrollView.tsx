import { useEffect, useRef, useCallback, useState, memo } from 'react'
// import { OpenSheetMusicDisplay as OSMD } from 'opensheetmusicdisplay' // Removed, handled by hook
import type { AppMode } from '../../App'
import { useOSMD } from '../../hooks/useOSMD'

interface Anchor {
    measure: number
    time: number
}

// New Interface for Beat Anchors
export interface BeatAnchor {
    measure: number
    beat: number
    time: number
}

interface ScrollViewProps {
    audioRef: React.RefObject<HTMLAudioElement | null>
    anchors: Anchor[]
    beatAnchors?: BeatAnchor[] // NEW: Level 2 Anchors
    mode: AppMode
    musicXmlUrl?: string
    revealMode: 'OFF' | 'NOTE' | 'CURTAIN'
    popEffect: boolean
    darkMode: boolean
    highlightNote: boolean
    glowEffect: boolean
    jumpEffect: boolean
    cursorPosition: number
    isLocked: boolean
    curtainLookahead: number
    showCursor?: boolean
    duration?: number
    onUpdateAnchor?: (measure: number, time: number) => void
    onUpdateBeatAnchor?: (measure: number, beat: number, time: number) => void // NEW
    onBeatMapLoaded?: (map: Map<number, number>) => void // NEW: Report beat counts
}

type NoteData = {
    id: string
    measureIndex: number
    timestamp: number
    element: HTMLElement | null
    stemElement: HTMLElement | null
}

function ScrollViewComponent({
    audioRef, anchors, beatAnchors = [], mode, musicXmlUrl,
    revealMode, popEffect, jumpEffect, glowEffect, darkMode, highlightNote,
    cursorPosition, isLocked, curtainLookahead, showCursor = true,
    duration = 0, onUpdateAnchor, onUpdateBeatAnchor, onBeatMapLoaded
}: ScrollViewProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const osmdContainerRef = useRef<HTMLDivElement>(null)
    const cursorRef = useRef<HTMLDivElement>(null)
    const curtainRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [scoreBounds, setScoreBounds] = useState({ start: 0, end: 0 })
    const [measureXMap, setMeasureXMap] = useState<Map<number, number>>(new Map())

    // NEW: Map to store the visual X position of every beat in every measure
    // Map<MeasureIndex, Map<BeatIndex (1-based), pixelX>>
    const beatXMapRef = useRef<Map<number, Map<number, number>>>(new Map())

    const lastMeasureIndexRef = useRef<number>(-1)
    const prevRevealModeRef = useRef<'OFF' | 'NOTE' | 'CURTAIN'>('OFF')

    // const osmdRef = useRef<OSMD | null>(null) // Replaced by hook
    // const [isLoaded, setIsLoaded] = useState(false) // Replaced by hook
    const { osmdRef, isLoaded } = useOSMD(osmdContainerRef as React.RefObject<HTMLDivElement>, musicXmlUrl, {
        autoResize: true, followCursor: false, drawTitle: true, drawSubtitle: false,
        drawComposer: false, drawCredits: false, drawPartNames: true, drawMeasureNumbers: true,
        renderSingleHorizontalStaffline: true
    })
    const animationFrameRef = useRef<number | null>(null)

    const noteMap = useRef<Map<number, NoteData[]>>(new Map())
    const measureContentMap = useRef<Map<number, HTMLElement[]>>(new Map())
    const staffLinesRef = useRef<HTMLElement[]>([])
    const allSymbolsRef = useRef<HTMLElement[]>([]) // <--- NEW: Track ALL symbols for coloring

    // === 1. BUILD MAPS ===
    const calculateNoteMap = useCallback(() => {
        const osmd = osmdRef.current
        if (!osmd || !osmd.GraphicSheet || !containerRef.current) return

        console.time('[ScoreViewerScroll] Spatial Map Build')
        const newNoteMap = new Map<number, NoteData[]>()
        const newMeasureContentMap = new Map<number, HTMLElement[]>()
        const newAllSymbols: HTMLElement[] = []
        const newStaffLines: HTMLElement[] = []

        // NEW: Beat calculations
        const newBeatXMap = new Map<number, Map<number, number>>()
        const newMeasureBeatCountMap = new Map<number, number>()

        const measureList = osmd.GraphicSheet.MeasureList
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unitInPixels = (osmd.GraphicSheet as any).UnitInPixels || 10

        // ... [Existing Bounds Logic] ...
        let minScoreX = Number.MAX_VALUE
        let maxScoreX = Number.MIN_VALUE
        if (measureList.length > 0) {
            measureList[0].forEach(staff => {
                const pos = staff.PositionAndShape
                const left = (pos.AbsolutePosition.x + pos.BorderLeft) * unitInPixels
                if (left < minScoreX) minScoreX = left
            })
            const mLast = measureList[measureList.length - 1]
            mLast.forEach(staff => {
                const pos = staff.PositionAndShape
                const right = (pos.AbsolutePosition.x + pos.BorderRight) * unitInPixels
                if (right > maxScoreX) maxScoreX = right
            })
        }
        if (minScoreX === Number.MAX_VALUE) minScoreX = 0
        if (maxScoreX === Number.MIN_VALUE) maxScoreX = 0
        setScoreBounds({ start: minScoreX, end: maxScoreX })

        const newMeasureXMap = new Map<number, number>()

        measureList.forEach((staves, index) => {
            const measureNumber = index + 1

            // 1. Basic Measure X Map
            if (staves.length > 0) {
                const staffMeasure = staves[0]
                const pos = staffMeasure.PositionAndShape
                const absoluteX = (pos.AbsolutePosition.x + pos.BorderLeft) * unitInPixels
                newMeasureXMap.set(measureNumber, absoluteX)
            }

            // 2. BEAT MAPPING (New Logic)
            try {
                // Get Time Signature from the SourceMeasure (Source data, not graphical)
                const sourceMeasure = osmd.Sheet.SourceMeasures[index]
                // Default to 4/4 if undefined
                const numerator = sourceMeasure.ActiveTimeSignature ? sourceMeasure.ActiveTimeSignature.Numerator : 4
                // We only care about the numerator for beat counting usually (3/4 = 3 beats)
                newMeasureBeatCountMap.set(measureNumber, numerator)

                // Calculate X position for each beat
                const beatPositions = new Map<number, number>()

                // We need the graphical width to interpolate if no notes exist
                let mStart = 0, mEnd = 0
                if (staves[0]) {
                    const pos = staves[0].PositionAndShape
                    mStart = (pos.AbsolutePosition.x + pos.BorderLeft) * unitInPixels
                    mEnd = (pos.AbsolutePosition.x + pos.BorderRight) * unitInPixels
                }
                const mWidth = mEnd - mStart

                for (let b = 1; b <= numerator; b++) {
                    // Target fraction of measure (e.g., Beat 1=0.0, Beat 2=0.33 in 3/4)
                    const targetFraction = (b - 1) / numerator

                    // Strategy: Find graphical staff entry closest to this fraction
                    let bestX = mStart + (mWidth * targetFraction) // Default to linear

                    // Search all staves in this measure
                    staves.forEach(staffMeasure => {
                        staffMeasure.staffEntries.forEach(entry => {
                            const relX = entry.PositionAndShape.RelativePosition.x * unitInPixels
                            // Re-calculate linear X for this beat
                            const linearX = mStart + (mWidth * targetFraction)
                            const actualEntryX = (staffMeasure.PositionAndShape.AbsolutePosition.x * unitInPixels) + relX

                            const diff = Math.abs(actualEntryX - linearX)

                            // If this note is closer to the theoretical linear beat position than previous best
                            // AND it's within a reasonable threshold (e.g. 15% of measure), snap to it.
                            if (diff < (mWidth / numerator) * 0.4) {
                                bestX = actualEntryX
                            }
                        })
                    })
                    beatPositions.set(b, bestX)
                }
                newBeatXMap.set(measureNumber, beatPositions)

            } catch (e) {
                console.warn("Error calculating beats for measure", measureNumber, e)
            }
        })

        setMeasureXMap(newMeasureXMap)
        beatXMapRef.current = newBeatXMap
        if (onBeatMapLoaded) onBeatMapLoaded(newMeasureBeatCountMap)

        // ... [Existing Bounds & Note Map Logic] ...
        const measureBounds: { index: number, left: number, right: number }[] = []
        measureList.forEach((staves, index) => {
            const measureNumber = index + 1
            let minX = Number.MAX_VALUE, maxX = Number.MIN_VALUE
            staves.forEach(staff => {
                const pos = staff.PositionAndShape
                const absX = pos.AbsolutePosition.x
                const left = absX + pos.BorderLeft
                const right = absX + pos.BorderRight
                if (left < minX) minX = left
                if (right > maxX) maxX = right
            })
            if (minX < Number.MAX_VALUE) {
                measureBounds.push({
                    index: measureNumber,
                    left: (minX * unitInPixels) - 5,
                    right: (maxX * unitInPixels) + 5
                })
            }
        })

        // ... (Existing Note Map Population) ...
        measureList.forEach((measureStaves, measureIndex) => {
            const measureNumber = measureIndex + 1
            const measureNotes: NoteData[] = []
            if (!measureStaves) return

            measureStaves.forEach(staffMeasure => {
                const measurePos = staffMeasure.PositionAndShape
                const measureWidth = (measurePos.BorderRight - measurePos.BorderLeft) * unitInPixels
                staffMeasure.staffEntries.forEach(entry => {
                    const graphicalVoiceEntries = entry.graphicalVoiceEntries
                    if (!graphicalVoiceEntries) return
                    const relX = entry.PositionAndShape.RelativePosition.x * unitInPixels
                    const relativeTimestamp = relX / measureWidth
                    graphicalVoiceEntries.forEach(gve => {
                        if (!gve.notes) return
                        gve.notes.forEach(note => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const internalNote = note as any
                            if (internalNote.vfnote && internalNote.vfnote.length > 0) {
                                const vfStaveNote = internalNote.vfnote[0]
                                const vfId = vfStaveNote.attrs ? vfStaveNote.attrs.id : null
                                if (vfId) {
                                    let element = document.getElementById(vfId)
                                    if (!element) element = document.getElementById(`vf-${vfId}`)
                                    if (element) {
                                        const group = element.closest('.vf-stavenote') as HTMLElement || element as HTMLElement

                                        // --- FIX: PREPARE ALL NOTE PARTS FOR ANIMATION ---
                                        // Include 'rect' for stems, 'path' for heads/flags
                                        const parts = group.querySelectorAll('path, rect')
                                        parts.forEach(p => {
                                            const el = p as HTMLElement
                                            // Critical for "pop" to scale from center of note
                                            el.style.transformBox = 'fill-box'
                                            el.style.transformOrigin = 'center'
                                            el.style.transition = 'transform 0.1s ease-out, fill 0.1s, stroke 0.1s'
                                        })

                                        measureNotes.push({
                                            id: vfId, measureIndex: measureNumber, timestamp: relativeTimestamp,
                                            element: group, stemElement: null
                                        })
                                    }
                                }
                            }
                        })
                    })
                })
            })
            if (measureNotes.length > 0) newNoteMap.set(measureNumber, measureNotes)
        })

        // ... (Existing Content Map Logic) ...
        const selector = 'svg path, svg rect, svg text'
        const allElements = containerRef.current.querySelectorAll(selector)
        const containerLeft = containerRef.current.getBoundingClientRect().left
        const findMeasureForX = (x: number) => {
            let low = 0, high = measureBounds.length - 1
            while (low <= high) {
                const mid = Math.floor((low + high) / 2)
                const bound = measureBounds[mid]
                if (x >= bound.left && x <= bound.right) return bound
                else if (x < bound.left) high = mid - 1
                else low = mid + 1
            }
            return null
        }
        for (let i = 0; i < allElements.length; i++) {
            const element = allElements[i] as HTMLElement
            const rect = element.getBoundingClientRect()
            const cl = element.classList
            const isMusical = cl.contains('vf-stavenote') || cl.contains('vf-beam') || cl.contains('vf-rest') || cl.contains('vf-clef') || cl.contains('vf-keysignature') || cl.contains('vf-timesignature') || cl.contains('vf-stem') || cl.contains('vf-modifier') || element.closest('.vf-stavenote, .vf-beam, .vf-rest, .vf-clef, .vf-keysignature, .vf-timesignature, .vf-stem, .vf-modifier') !== null

            if (!isMusical) {
                if (rect.width > 50 && rect.height < 3) { newStaffLines.push(element); continue }
            }
            newAllSymbols.push(element)
            const elCenterX = (rect.left - containerLeft) + (rect.width / 2)
            const match = findMeasureForX(elCenterX)
            if (match) {
                let mList = newMeasureContentMap.get(match.index)
                if (!mList) { mList = []; newMeasureContentMap.set(match.index, mList) }
                mList.push(element)
            }
        }

        noteMap.current = newNoteMap
        measureContentMap.current = newMeasureContentMap
        staffLinesRef.current = newStaffLines
        allSymbolsRef.current = newAllSymbols
        console.timeEnd('[ScoreViewerScroll] Spatial Map Build')

    }, [onBeatMapLoaded])

    // We still need to trigger map calculation when loaded
    useEffect(() => {
        if (isLoaded) {
            setTimeout(() => calculateNoteMap(), 100)
        }
    }, [isLoaded, calculateNoteMap])

    // ... (Resize Effect)
    useEffect(() => {
        const handleResize = () => setTimeout(() => calculateNoteMap(), 500)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [calculateNoteMap])

    // === MODIFIED: findCurrentPosition (Handles Beats) ===
    const findCurrentPosition = useCallback((time: number) => {
        // 1. Fallback to Measure Mapping if no beats
        if (!beatAnchors || beatAnchors.length === 0) {
            if (anchors.length === 0) return { measure: 1, beat: 1, progress: 0 }
            const sorted = [...anchors].sort((a, b) => a.time - b.time)

            // Find current Measure interval
            let currentM = 1, startT = 0, endT = Infinity
            for (let i = 0; i < sorted.length; i++) {
                if (time >= sorted[i].time) {
                    currentM = sorted[i].measure
                    startT = sorted[i].time
                    if (i + 1 < sorted.length) endT = sorted[i + 1].time
                    else endT = Infinity
                } else break
            }

            let progress = 0
            if (endT !== Infinity && endT > startT) {
                progress = (time - startT) / (endT - startT)
                progress = Math.max(0, Math.min(1, progress))
            }
            return { measure: currentM, beat: 1, progress, isBeatInterpolation: false }
        }

        // 2. Beat Mapping Logic
        // Combine Measure Anchors (Beat 1) and Beat Anchors into one timeline
        const allPoints: { measure: number, beat: number, time: number }[] = []

        // Add implicit Beat 1s from Measure Anchors
        anchors.forEach(a => {
            allPoints.push({ measure: a.measure, beat: 1, time: a.time })
        })

        // Add explicit Beat Anchors
        beatAnchors.forEach(b => {
            allPoints.push({ measure: b.measure, beat: b.beat, time: b.time })
        })

        // Sort by time
        allPoints.sort((a, b) => a.time - b.time)

        // Find interval
        let currentP = allPoints[0]
        let nextP = null

        for (let i = 0; i < allPoints.length; i++) {
            if (time >= allPoints[i].time) {
                currentP = allPoints[i]
                nextP = (i + 1 < allPoints.length) ? allPoints[i + 1] : null
            } else {
                break
            }
        }

        let progress = 0
        if (nextP) {
            const duration = nextP.time - currentP.time
            if (duration > 0) {
                progress = (time - currentP.time) / duration
                progress = Math.max(0, Math.min(1, progress))
            }
        }

        // Helper to handle edge case where we might be before any points
        if (!currentP) return { measure: 1, beat: 1, progress: 0, isBeatInterpolation: true }

        return {
            measure: currentP.measure,
            beat: currentP.beat,
            nextMeasure: nextP?.measure,
            nextBeat: nextP?.beat,
            progress,
            isBeatInterpolation: true
        }

    }, [anchors, beatAnchors])

    // Helper: Coloring
    const applyColor = (element: HTMLElement, color: string) => {
        if (!element) return

        // 1. Target Children (Paths)
        const paths = element.getElementsByTagName('path')
        for (let i = 0; i < paths.length; i++) {
            const p = paths[i] as unknown as HTMLElement // Force cast for style access
            p.style.fill = color
            p.style.stroke = color
            p.setAttribute('fill', color)
            p.setAttribute('stroke', color)
        }

        // 2. Target Children (Rects - for stems/bars)
        const rects = element.getElementsByTagName('rect')
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i] as unknown as HTMLElement
            r.style.fill = color
            r.style.stroke = color
            r.setAttribute('fill', color)
            r.setAttribute('stroke', color)
        }

        // 3. Target the Element Itself (if it's a path/rect)
        element.style.fill = color
        element.style.stroke = color
    }

    // === VISIBILITY HELPER (Global Sweep) ===
    const updateMeasureVisibility = useCallback((currentMeasure: number) => {
        if (revealMode !== 'NOTE' || !measureContentMap.current) return

        measureContentMap.current.forEach((elements, measureNum) => {
            if (measureNum < currentMeasure) {
                // Past: Visible
                elements.forEach(el => el.style.opacity = '1')
            } else if (measureNum > currentMeasure) {
                // Future: Hidden
                elements.forEach(el => el.style.opacity = '0')
            }
            // Current Measure: Handled per-frame in animation loop
        })
    }, [revealMode])

    // === INITIAL NOTE-REVEAL VISIBILITY (after note map is built) ===
    // When the score loads in NOTE reveal mode, immediately hide future notes
    // to prevent a flash of all-visible notes before the animation loop catches up.
    useEffect(() => {
        if (isLoaded && revealMode === 'NOTE' && measureContentMap.current.size > 0) {
            const audioTime = audioRef.current?.currentTime ?? 0
            // Hide ALL content first (clean slate)
            measureContentMap.current.forEach(elements =>
                elements.forEach(el => el.style.opacity = '0')
            )
            // Then reveal what should be visible based on current position
            const { measure } = findCurrentPosition(audioTime)
            measureContentMap.current.forEach((elements, measureNum) => {
                if (measureNum < measure) {
                    elements.forEach(el => el.style.opacity = '1')
                }
            })
            // Reset last measure tracking so animation loop re-sweeps
            lastMeasureIndexRef.current = -1
        }
    }, [isLoaded, revealMode, findCurrentPosition, audioRef])

    // === MODE SWITCHING EFFECT ===
    useEffect(() => {
        if (prevRevealModeRef.current === 'NOTE' && revealMode !== 'NOTE') {
            measureContentMap.current.forEach(elements => elements.forEach(el => el.style.opacity = '1'))
        }
        if (revealMode === 'NOTE' && audioRef.current) {
            const { measure } = findCurrentPosition(audioRef.current.currentTime)
            updateMeasureVisibility(measure)
        }
        if (revealMode === 'CURTAIN') {
            measureContentMap.current.forEach(elements => elements.forEach(el => el.style.opacity = '1'))
        }
        prevRevealModeRef.current = revealMode
    }, [revealMode, updateMeasureVisibility, findCurrentPosition, audioRef])

    // === DARK MODE EFFECT ===
    useEffect(() => {
        const baseColor = darkMode ? '#e0e0e0' : '#000000'
        const bgColor = darkMode ? '#222222' : '#ffffff'

        // 1. Color All Music Symbols (Robust Method)
        // Use allSymbolsRef to guarantee we catch every beam/stem, even if bucketing failed
        if (allSymbolsRef.current) {
            allSymbolsRef.current.forEach(el => applyColor(el, baseColor))
        }

        // 2. Color Staff Lines
        if (staffLinesRef.current) {
            staffLinesRef.current.forEach(el => applyColor(el, baseColor))
        }

        // 3. Color Container Background
        if (scrollContainerRef.current) {
            scrollContainerRef.current.style.backgroundColor = bgColor
        }

        // 4. Update Curtain Color (if active)
        if (curtainRef.current) {
            curtainRef.current.style.backgroundColor = bgColor
        }
    }, [darkMode, isLoaded])


    // === ANIMATION LOOP ===
    const updateCursorPosition = useCallback((audioTime: number) => {
        const osmd = osmdRef.current
        if (!osmd || !isLoaded || !osmd.GraphicSheet) return

        const posData = findCurrentPosition(audioTime)
        const { measure, beat, progress, isBeatInterpolation } = posData
        const currentMeasureIndex = measure - 1

        try {
            const measureList = osmd.GraphicSheet.MeasureList
            if (!measureList || currentMeasureIndex >= measureList.length) return
            const measureStaves = measureList[currentMeasureIndex]
            if (!measureStaves || measureStaves.length === 0) return

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const unitInPixels = (osmd.GraphicSheet as any).UnitInPixels || 10

            // 1. Get Vertical Bounds (Staff height)
            let firstStaffY = Number.MAX_VALUE
            let lastStaffY = Number.MIN_VALUE
            measureStaves.forEach(staffMeasure => {
                const pos = staffMeasure.PositionAndShape
                const absY = pos.AbsolutePosition.y
                if (absY < firstStaffY) firstStaffY = absY
                if (absY > lastStaffY) lastStaffY = absY
            })
            const topPadding = 4, bottomPadding = 8
            const systemTop = (firstStaffY - topPadding) * unitInPixels
            const systemHeight = ((lastStaffY - firstStaffY) + bottomPadding + topPadding) * unitInPixels

            // 2. Calculate Cursor X
            let cursorX = 0

            if (isBeatInterpolation && beatXMapRef.current.has(measure)) {
                // --- BEAT INTERPOLATION MODE ---
                const beatsInMeasure = beatXMapRef.current.get(measure)!

                // Get Start X (Current Beat)
                let startX = beatsInMeasure.get(beat)

                // Fallback if beat map missing specific beat (shouldn't happen with correct map)
                if (startX === undefined) {
                    const pos = measureStaves[0].PositionAndShape
                    startX = (pos.AbsolutePosition.x + pos.BorderLeft) * unitInPixels
                }

                // Get End X (Next Beat or End of Measure)
                let endX = 0

                // Case A: Transitioning to a beat inside same measure
                if (posData.nextMeasure === measure && posData.nextBeat) {
                    // Try to get next beat position
                    endX = beatsInMeasure.get(posData.nextBeat) || startX
                }
                // Case B: Transitioning to next measure
                else {
                    // Use end of current measure (BorderRight)
                    const pos = measureStaves[0].PositionAndShape
                    endX = (pos.AbsolutePosition.x + pos.BorderRight) * unitInPixels
                }

                cursorX = startX + ((endX - startX) * progress)

            } else {
                // --- LEGACY MEASURE MODE (Linear) ---
                let minX = Number.MAX_VALUE, maxX = Number.MIN_VALUE
                measureStaves.forEach(staffMeasure => {
                    const pos = staffMeasure.PositionAndShape
                    const absX = pos.AbsolutePosition.x
                    if (absX + pos.BorderLeft < minX) minX = absX + pos.BorderLeft
                    if (absX + pos.BorderRight > maxX) maxX = absX + pos.BorderRight
                })
                const startPixel = minX * unitInPixels
                const endPixel = maxX * unitInPixels
                cursorX = startPixel + ((endPixel - startPixel) * progress)
            }

            // Update Cursor DOM
            if (cursorRef.current) {
                cursorRef.current.style.left = `${cursorX}px`
                cursorRef.current.style.top = `${systemTop}px`
                cursorRef.current.style.height = `${systemHeight}px`
                cursorRef.current.style.display = showCursor ? 'block' : 'none'
                cursorRef.current.style.backgroundColor = mode === 'RECORD' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.8)'
                cursorRef.current.style.boxShadow = mode === 'RECORD' ? '0 0 10px rgba(239, 68, 68, 0.4)' : '0 0 8px rgba(16, 185, 129, 0.5)'
            }

            // [Scrolling Logic]
            if (scrollContainerRef.current) {
                const container = scrollContainerRef.current
                const containerWidth = container.clientWidth
                const targetScrollLeft = cursorX - (containerWidth * cursorPosition)
                const isPlaying = audioRef.current && !audioRef.current.paused && mode !== 'RECORD'

                if (isLocked && isPlaying) {
                    const diff = Math.abs(container.scrollLeft - targetScrollLeft)
                    if (diff < 250) container.scrollLeft = targetScrollLeft
                    if (currentMeasureIndex !== lastMeasureIndexRef.current && diff > 50) {
                        container.scrollTo({ left: targetScrollLeft, behavior: 'smooth' })
                    }
                } else {
                    if (currentMeasureIndex !== lastMeasureIndexRef.current) {
                        container.scrollTo({ left: targetScrollLeft, behavior: 'smooth' })
                    }
                }
            }

            // [Curtain & Note Mode Logic]
            if (curtainRef.current) {
                if (revealMode === 'CURTAIN') {
                    curtainRef.current.style.display = 'block'
                    curtainRef.current.style.backgroundColor = darkMode ? '#222222' : '#ffffff'
                    const offset = curtainLookahead * 600
                    const curtainStart = cursorX + offset
                    const lastMeasure = measureList[measureList.length - 1][0]
                    const totalScoreWidth = (lastMeasure.PositionAndShape.AbsolutePosition.x + lastMeasure.PositionAndShape.BorderRight) * unitInPixels
                    const requiredWidth = Math.max(0, totalScoreWidth - curtainStart + 800)
                    curtainRef.current.style.left = `${curtainStart}px`
                    curtainRef.current.style.width = `${requiredWidth}px`
                    const scrollHeight = containerRef.current?.scrollHeight || 0
                    const clientHeight = containerRef.current?.clientHeight || 0
                    curtainRef.current.style.height = `${Math.max(scrollHeight, clientHeight)}px`
                } else {
                    curtainRef.current.style.display = 'none'
                }
            }
            if (revealMode === 'NOTE') {
                if (currentMeasureIndex !== lastMeasureIndexRef.current || lastMeasureIndexRef.current === -1) updateMeasureVisibility(measure)
                const currentElements = measureContentMap.current.get(measure)
                if (currentElements && containerRef.current) {
                    const containerRect = containerRef.current.getBoundingClientRect()
                    currentElements.forEach(el => {
                        const rect = el.getBoundingClientRect()
                        const elLeft = rect.left - containerRect.left
                        // FIX: Reduced lookahead buffer from 15px to 2px to prevent notes revealing too early
                        // User reported seeing black notes before green highlight due to excessive lookahead.
                        if (elLeft > cursorX + 2) el.style.opacity = '0'
                        else el.style.opacity = '1'
                    })
                }
            }

            lastMeasureIndexRef.current = currentMeasureIndex

            // [Karaoke Coloring]
            const notesInMeasure = noteMap.current.get(measure)
            if (notesInMeasure && mode === 'PLAYBACK') {

                let globalMeasureProgress = 0
                if (isBeatInterpolation && beatXMapRef.current.has(measure)) {
                    const numerator = beatXMapRef.current.get(measure)!.size
                    // Roughly: ((beat - 1) + progress) / numerator
                    globalMeasureProgress = ((beat - 1) + progress) / numerator
                } else {
                    globalMeasureProgress = progress
                }

                const defaultColor = darkMode ? '#e0e0e0' : '#000000'
                const highlightColor = '#10B981'; const shadowColor = '#10B981'

                notesInMeasure.forEach(noteData => {
                    if (!noteData.element) return
                    const lookahead = 0.04
                    const noteEndThreshold = noteData.timestamp + 0.01
                    const isActive = (globalMeasureProgress <= noteEndThreshold && globalMeasureProgress >= noteData.timestamp - lookahead)

                    let targetFill = defaultColor
                    let targetFilter = 'none'
                    let targetTransform = 'scale(1) translateY(0)'

                    if (isActive) {
                        if (highlightNote) targetFill = highlightColor
                        if (glowEffect) targetFilter = `drop-shadow(0 0 6px ${shadowColor})`
                        const scale = popEffect ? 1.4 : 1
                        const jump = jumpEffect ? -10 : 0
                        targetTransform = `scale(${scale}) translateY(${jump}px)`
                    }
                    applyColor(noteData.element, targetFill)
                    if (noteData.stemElement) applyColor(noteData.stemElement, targetFill)
                    noteData.element.style.filter = targetFilter

                    // Apply Transform to children (paths AND rects/stems)
                    // We target both to ensure the whole note pops, not just the head
                    const parts = noteData.element.querySelectorAll('path, rect')
                    parts.forEach(p => (p as unknown as HTMLElement).style.transform = targetTransform)
                })
            }

        } catch (err) { console.error(err) }
    }, [findCurrentPosition, isLoaded, mode, revealMode, updateMeasureVisibility, popEffect, jumpEffect, glowEffect, darkMode, highlightNote, cursorPosition, isLocked, curtainLookahead, showCursor])

    // ... (Animation Loop)
    useEffect(() => {
        if (!isLoaded) return
        const animate = () => {
            const audioTime = audioRef.current?.currentTime ?? 0
            updateCursorPosition(audioTime)
            animationFrameRef.current = requestAnimationFrame(animate)
        }
        animationFrameRef.current = requestAnimationFrame(animate)
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current) }
    }, [isLoaded, updateCursorPosition, audioRef])

    // ... (Click Handler)
    const handleScoreClick = useCallback((event: React.MouseEvent) => {
        const osmd = osmdRef.current
        if (!osmd || !osmd.GraphicSheet || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const clickX = event.clientX - rect.left
        const clickY = event.clientY - rect.top

        const measureList = osmd.GraphicSheet.MeasureList
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unitInPixels = (osmd.GraphicSheet as any).UnitInPixels || 10
        let clickedMeasureIndex = -1

        for (let i = 0; i < measureList.length; i++) {
            const measureStaves = measureList[i]
            if (!measureStaves) continue
            let minY = Number.MAX_VALUE, maxY = Number.MIN_VALUE, minX = Number.MAX_VALUE, maxX = Number.MIN_VALUE
            measureStaves.forEach(staffMeasure => {
                const pos = staffMeasure.PositionAndShape
                if (!pos) return
                const absY = pos.AbsolutePosition.y
                const absX = pos.AbsolutePosition.x
                if (absY + pos.BorderTop < minY) minY = absY + pos.BorderTop
                if (absY + pos.BorderBottom > maxY) maxY = absY + pos.BorderBottom
                if (absX + pos.BorderLeft < minX) minX = absX + pos.BorderLeft
                if (absX + pos.BorderRight > maxX) maxX = absX + pos.BorderRight
            })
            const boxTop = minY * unitInPixels
            const boxBottom = maxY * unitInPixels
            const boxLeft = minX * unitInPixels
            const boxRight = maxX * unitInPixels
            if (clickX >= boxLeft && clickX <= boxRight && clickY >= boxTop && clickY <= boxBottom) {
                clickedMeasureIndex = i
                break
            }
        }

        if (clickedMeasureIndex !== -1) {
            const measureNumber = clickedMeasureIndex + 1
            const sortedAnchors = [...anchors].sort((a, b) => a.measure - b.measure)
            const targetAnchor = sortedAnchors.reverse().find(a => a.measure <= measureNumber)
            if (targetAnchor && audioRef.current) {
                audioRef.current.currentTime = targetAnchor.time
            }
        }
    }, [anchors, audioRef])

    return (
        <div ref={scrollContainerRef} className="relative w-full h-full overflow-auto overscroll-none bg-white">
            <div ref={containerRef} onClick={handleScoreClick} className="relative min-w-full w-fit min-h-[400px] cursor-pointer">
                {/* 1. OSMD Render Container (Cleared by hook on init/cleanup) */}
                <div ref={osmdContainerRef} />

                {/* 2. Overlays (Now inside relative container, safe from OSMD clearing) */}

                {/* The Cursor */}
                <div ref={cursorRef} id="cursor-overlay" className="absolute pointer-events-none"
                    style={{
                        left: 0, top: 0, width: '3px', height: '100px',
                        backgroundColor: mode === 'RECORD' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.8)',
                        boxShadow: mode === 'RECORD' ? '0 0 10px rgba(239, 68, 68, 0.4)' : '0 0 8px rgba(16, 185, 129, 0.5)',
                        zIndex: 1000, display: 'none',
                        // FIX: Disable transition during playback to stop cursor shake.
                        // CSS transitions conflict with JS-driven scroll locking.
                        transition: 'none',
                    }}
                />

                {/* The Curtain (Simple Overlay for CURTAIN mode) */}
                <div ref={curtainRef} id="reveal-curtain" className="absolute pointer-events-none bg-white"
                    style={{
                        display: 'none',
                        zIndex: 999, // Below cursor, above score
                        top: 0,
                        bottom: 0,
                    }}
                />

                {/* --- ANCHOR MARKERS OVERLAY --- */}
                {mode === 'RECORD' && duration > 0 && anchors.map(anchor => {
                    // 1. Get exact visual position from our map
                    const leftPixel = measureXMap.get(anchor.measure) ?? 0

                    // Safety check: don't render if we don't have a position yet
                    if (!measureXMap.has(anchor.measure)) return null

                    return (
                        <div
                            key={anchor.measure}
                            className="absolute top-0 flex flex-col items-center group z-[1001] cursor-ew-resize pointer-events-auto hover:scale-110 transition-transform origin-top"
                            // Position exactly at the measure's visual start
                            style={{ left: `${leftPixel}px`, transform: 'translateX(-50%)' }}
                            onMouseDown={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                const startX = e.clientX
                                const initialTime = anchor.time

                                // Calculate sensitivity: How many seconds per pixel?
                                // We use the total average (Duration / TotalWidth) to keep dragging consistent
                                const container = containerRef.current
                                const totalWidth = container?.scrollWidth || 1000
                                const secondsPerPixel = duration / totalWidth

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                    // Optional: Visual drag feedback could go here
                                }

                                const handleMouseUp = (upEvent: MouseEvent) => {
                                    const diffX = upEvent.clientX - startX

                                    // Convert drag distance to time difference
                                    // Drag Right (+X) = Increase Time (Later)
                                    // Drag Left (-X) = Decrease Time (Earlier)
                                    const timeDelta = diffX * secondsPerPixel

                                    // Calculate new time, ensuring it doesn't go below 0
                                    const newTime = Math.max(0, initialTime + timeDelta)

                                    if (onUpdateAnchor) {
                                        onUpdateAnchor(anchor.measure, newTime)
                                    }

                                    window.removeEventListener('mousemove', handleMouseMove)
                                    window.removeEventListener('mouseup', handleMouseUp)
                                }

                                window.addEventListener('mousemove', handleMouseMove)
                                window.addEventListener('mouseup', handleMouseUp)
                            }}
                        >
                            {/* The Label */}
                            <div className="bg-red-600/90 text-white text-[9px] font-bold px-1 rounded-sm shadow-sm mb-0.5 whitespace-nowrap select-none">
                                M{anchor.measure}
                            </div>

                            {/* The Arrow/Line */}
                            <div className="w-0.5 h-full bg-red-600/50 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div>
                        </div>
                    )
                })}

                {/* --- LEVEL 2 MARKERS (Yellow) --- */}
                {mode === 'RECORD' && duration > 0 && beatAnchors.length > 0 && beatAnchors.map((bAnchor) => {
                    // Find Beat X
                    const beatMap = beatXMapRef.current.get(bAnchor.measure)
                    const leftPixel = beatMap ? beatMap.get(bAnchor.beat) : 0
                    if (!leftPixel) return null

                    return (
                        <div key={`b-${bAnchor.measure}-${bAnchor.beat}`}
                            className="absolute top-6 flex flex-col items-center group z-[1000] cursor-ew-resize pointer-events-auto hover:scale-110 transition-transform origin-top"
                            style={{ left: `${leftPixel}px`, transform: 'translateX(-50%)' }}
                            onMouseDown={(e: React.MouseEvent) => {
                                e.stopPropagation(); const startX = e.clientX; const initialTime = bAnchor.time
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const secondsPerPixel = duration / ((containerRef.current?.scrollWidth as any) || 1000)
                                const handleMove = (ev: MouseEvent) => {
                                    const newTime = Math.max(0, initialTime + (ev.clientX - startX) * secondsPerPixel)
                                    if (onUpdateBeatAnchor) onUpdateBeatAnchor(bAnchor.measure, bAnchor.beat, newTime)
                                }
                                const handleUp = () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
                                window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleUp)
                            }}
                        >
                            <div className="bg-yellow-500/90 text-black text-[8px] font-bold px-1 rounded-sm shadow-sm mb-0.5 whitespace-nowrap select-none">
                                {bAnchor.beat}
                            </div>
                            <div className="w-0.5 h-full bg-yellow-500/50 shadow-[0_0_2px_rgba(0,0,0,0.3)]"></div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// MEMOIZE TO FIX FLASHING
export const ScrollView = memo(ScrollViewComponent)
