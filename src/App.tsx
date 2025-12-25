import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'
import { ScoreViewer } from './components/ScoreViewer'

interface Anchor {
  measure: number
  time: number
}

// Measure 1 always starts at 0:00
const INITIAL_ANCHORS: Anchor[] = [{ measure: 1, time: 0 }]

function App() {
  const [anchors, setAnchors] = useState<Anchor[]>(INITIAL_ANCHORS)
  const [audioTime, setAudioTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const anchorListRef = useRef<HTMLDivElement>(null)

  const handleTap = useCallback(() => {
    if (audioRef.current) {
      const currentTime = audioRef.current.currentTime
      // Next measure number is current length + 1 (since we start with Measure 1)
      setAnchors(prev => [...prev, { measure: prev.length + 1, time: currentTime }])
    }
  }, [])

  // Reset anchors to start fresh (but keep Measure 1 at 0)
  const handleReset = useCallback(() => {
    setAnchors(INITIAL_ANCHORS)
  }, [])

  // Update a specific anchor's time (except Measure 1 which must stay at 0)
  const handleAnchorUpdate = useCallback((index: number, newTime: number) => {
    // Prevent editing Measure 1 (index 0)
    if (index === 0) return

    setAnchors(prev => prev.map((anchor, i) =>
      i === index ? { ...anchor, time: newTime } : anchor
    ))
  }, [])

  // Track audio time for cursor sync
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setAudioTime(audioRef.current.currentTime)
    }
  }, [])

  // Auto-reset when audio is seeked to beginning
  const handleSeeked = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime === 0 && anchors.length > 1) {
      handleReset()
    }
  }, [anchors.length, handleReset])

  const handleEnded = useCallback(() => {
    // Optionally reset when audio ends - user can start fresh on replay
    // Uncomment below to auto-reset on end:
    // handleReset()
  }, [])

  // Auto-scroll to newest anchor
  useEffect(() => {
    if (anchorListRef.current && anchors.length > 0) {
      anchorListRef.current.scrollTop = anchorListRef.current.scrollHeight
    }
  }, [anchors])

  // Handle spacebar press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && event.target === document.body) {
        event.preventDefault() // Prevent scrolling
        handleTap()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleTap])

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Top Header */}
      <header className="bg-slate-800 text-white py-4 px-6 shadow-lg">
        <h1 className="text-2xl font-bold tracking-wide">Score Follower</h1>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Score Container - Main Content */}
        <main
          id="score-container"
          className="flex-grow bg-gray-100 overflow-auto"
        >
          <ScoreViewer audioTime={audioTime} anchors={anchors} />
        </main>

        {/* Right Sidebar - Sync Anchors */}
        <aside className="w-[300px] bg-white border-l border-gray-300 p-4 overflow-y-auto flex flex-col">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b border-gray-200 pb-2">
            Sync Anchors
          </h2>
          <div
            ref={anchorListRef}
            className="flex-1 overflow-y-auto space-y-2"
          >
            {anchors.map((anchor, index) => {
              const isMeasureOne = index === 0
              return (
                <div
                  key={index}
                  className={`border rounded-md px-3 py-2 text-sm flex items-center justify-between ${isMeasureOne
                      ? 'bg-gray-100 border-gray-300 text-gray-500'
                      : 'bg-gray-50 border-gray-200 text-gray-700'
                    }`}
                >
                  <span className="font-medium">Measure {anchor.measure}:</span>
                  <div className="flex items-center gap-1">
                    {isMeasureOne ? (
                      // Measure 1 is locked at 0.00s
                      <span className="w-20 px-2 py-1 text-right font-mono text-gray-400">
                        0.00
                      </span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={anchor.time.toFixed(2)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val) && val >= 0) {
                            handleAnchorUpdate(index, val)
                          }
                        }}
                        className="w-20 px-2 py-1 text-right font-mono text-indigo-600 bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    )}
                    <span className="text-gray-500">s</span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      </div>

      {/* Bottom Fixed Footer */}
      <footer className="bg-slate-900 border-t border-gray-300 p-4 flex items-center gap-6">
        {/* Audio Element */}
        <audio
          ref={audioRef}
          controls
          className="flex-grow h-10"
          src="/c-major-exercise.mp3"
          onTimeUpdate={handleTimeUpdate}
          onSeeked={handleSeeked}
          onEnded={handleEnded}
        >
          Your browser does not support the audio element.
        </audio>

        {/* Clear/Reset Button */}
        <button
          onClick={handleReset}
          className="bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white font-semibold px-6 py-4 rounded-lg shadow-lg transition-all duration-150"
        >
          Clear
        </button>

        {/* TAP Button */}
        <button
          onClick={handleTap}
          className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xl px-10 py-4 rounded-lg shadow-lg transition-all duration-150 hover:scale-105 active:scale-95"
        >
          TAP
        </button>
      </footer>
    </div>
  )
}

export default App
