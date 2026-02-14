import { useState, useRef } from 'react'

export function useRecorder() {
    const [isRecording, setIsRecording] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])

    const startRecording = async () => {
        try {
            // 1. Ask user to select the tab (with audio!)
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 60 },
                audio: true, // Critical: Captures the piano playback
                preferCurrentTab: true // Experimental, helps select current tab
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)

            // 2. Set up Recorder
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = () => {
                // Stop all tracks to turn off the "sharing" indicator
                stream.getTracks().forEach(track => track.stop())
            }

            mediaRecorderRef.current = recorder
            chunksRef.current = []
            recorder.start()
            setIsRecording(true)

            // Add class to hide UI
            document.body.classList.add('studio-mode')

            return true
        } catch (err) {
            console.error("Failed to start recording:", err)
            return false
        }
    }

    const stopRecording = (): Promise<File> => {
        return new Promise((resolve) => {
            if (!mediaRecorderRef.current) return

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' })
                const file = new File([blob], "master-performance.webm", { type: 'video/webm' })

                // Cleanup
                setIsRecording(false)
                document.body.classList.remove('studio-mode')
                chunksRef.current = []

                resolve(file)
            }

            mediaRecorderRef.current.stop()
        })
    }

    return { isRecording, startRecording, stopRecording }
}
