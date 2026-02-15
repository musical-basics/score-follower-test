import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// Connect to Piano Studio purely to fetch the list of titles
const pianoStudio = createClient(
    import.meta.env.VITE_PIANO_STUDIO_URL,
    import.meta.env.VITE_PIANO_STUDIO_KEY
)

interface PublishModalProps {
    isOpen: boolean
    onClose: () => void
    onPublish: (pieceId: string) => void
    isPublishing: boolean
    videoFile?: File | null
}

export function PublishModal({ isOpen, onClose, onPublish, isPublishing, videoFile }: PublishModalProps) {
    const [pieces, setPieces] = useState<{ id: string, title: string }[]>([])
    const [selectedId, setSelectedId] = useState('')

    // Fetch pieces when modal opens
    useEffect(() => {
        if (isOpen) {
            pianoStudio.from('pieces').select('id, title').order('title')
                .then(({ data, error }) => {
                    if (data) setPieces(data)
                    if (error) console.error(error)
                })
        }
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[3000]">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-2xl w-96">
                <h2 className="text-lg font-bold mb-4 dark:text-white">Publish to Classroom</h2>

                {videoFile && (
                    <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🎬</span>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Video Ready!</p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-500">{videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)</p>
                            </div>
                            <button
                                onClick={() => {
                                    const url = URL.createObjectURL(videoFile)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = videoFile.name
                                    a.click()
                                    URL.revokeObjectURL(url)
                                }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-all"
                            >
                                💾 Download
                            </button>
                        </div>
                    </div>
                )}

                <label className="block text-sm font-medium mb-2 dark:text-slate-300">
                    Select Target Piece:
                </label>
                <select
                    className="w-full p-2 border rounded mb-6 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                >
                    <option value="">-- Choose a Piece --</option>
                    {pieces.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                </select>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                    <button
                        disabled={!selectedId || isPublishing}
                        onClick={() => onPublish(selectedId)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold disabled:opacity-50"
                    >
                        {isPublishing ? 'Publishing...' : '🚀 Publish Live'}
                    </button>
                </div>
            </div>
        </div>
    )
}
