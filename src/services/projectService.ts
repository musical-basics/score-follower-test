import { createClient } from '@supabase/supabase-js'

// Initialize client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key missing. Save/Load features will not work.')
}

// 1. The Workbench Client (Your existing one)
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder-key'
)

// 2. The Bridge Client (Connects to Piano Studio)
export const pianoStudioClient = createClient(
    import.meta.env.VITE_PIANO_STUDIO_URL || 'https://placeholder.supabase.co',
    import.meta.env.VITE_PIANO_STUDIO_KEY || 'placeholder-key'
)

// Function to clean filename for storage
const cleanFileName = (fileName: string) => {
    return fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
}

export interface Project {
    id: string
    title: string
    audio_url: string
    xml_url: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anchors: any[]
    // Level 2 Beat Mapping (nullable for backwards compatibility)
    beat_anchors?: { measure: number; beat: number; time: number }[] | null
    subdivision?: number | null
    is_level2?: boolean | null
    created_at: string
    updated_at: string
}

export const projectService = {
    // Upload a file to 'scores' bucket and return public URL
    async uploadFile(file: File): Promise<string> {
        const timestamp = Date.now()
        const cleanName = cleanFileName(file.name)
        const fileName = `${timestamp}_${cleanName}`

        const { error: uploadError } = await supabase.storage
            .from('scores')
            .upload(fileName, file)

        if (uploadError) throw uploadError

        // Get public URL
        const { data } = supabase.storage
            .from('scores')
            .getPublicUrl(fileName)

        return data.publicUrl
    },

    // Save project metadata to DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async saveProject(
        title: string, audioFile: File, xmlFile: File, anchors: any[],
        beatAnchors?: { measure: number; beat: number; time: number }[],
        subdivision?: number, isLevel2?: boolean
    ) {
        // 1. Upload files
        console.log('[ProjectService] Uploading audio...')
        const audioUrl = await this.uploadFile(audioFile)

        console.log('[ProjectService] Uploading XML...')
        const xmlUrl = await this.uploadFile(xmlFile)

        // 2. Insert row
        console.log('[ProjectService] Saving project metadata...')
        const { data, error } = await supabase
            .from('projects')
            .insert({
                title,
                audio_url: audioUrl,
                xml_url: xmlUrl,
                anchors: anchors,
                beat_anchors: beatAnchors || [],
                subdivision: subdivision ?? 4,
                is_level2: isLevel2 ?? false,
                updated_at: new Date().toISOString()
            })
            .select()

        if (error) throw error
        return data[0]
    },

    // Update existing project (anchors + beat data)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async updateProject(
        id: string, anchors: any[],
        beatAnchors?: { measure: number; beat: number; time: number }[],
        subdivision?: number, isLevel2?: boolean,
        title?: string
    ) {
        console.log(`[ProjectService] Updating project ${id}...`)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = {
            anchors: anchors,
            beat_anchors: beatAnchors || [],
            subdivision: subdivision ?? 4,
            is_level2: isLevel2 ?? false,
            updated_at: new Date().toISOString()
        }

        if (title) {
            updates.title = title
        }

        const { data, error } = await supabase
            .from('projects')
            .update(updates)
            .eq('id', id)
            .select()

        if (error) throw error
        return data[0]
    },

    // Fetch all projects
    async getProjects(): Promise<Project[]> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('updated_at', { ascending: false })

        if (error) throw error
        return data || []
    },

    // Fetch a single project by ID
    async getProjectById(id: string): Promise<Project | null> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single()

        if (error) {
            console.warn('Could not fetch project:', error)
            return null
        }
        return data
    },

    /**
     * PUBLISH TO PIANO STUDIO
     * Uses the 'pianoStudioClient' to send data to the main app.
     */
    async publishToPiece(pieceId: string, audioFile: File, projectData: any) {
        console.log(`[Publish] Uploading Master Audio to Piano Studio...`)

        // A. Upload Audio to PIANO STUDIO's Storage (not Score Follower's)
        // We use the bridge client so the file lives in the main app's bucket
        const timestamp = Date.now()
        const fileName = `${timestamp}_master_${audioFile.name.replace(/[^a-z0-9.]/gi, '_')}`

        const { error: uploadError } = await pianoStudioClient.storage
            .from('scores') // Make sure this bucket exists in Piano Studio!
            .upload(fileName, audioFile)

        if (uploadError) throw uploadError

        const { data: { publicUrl: audioUrl } } = pianoStudioClient.storage
            .from('scores')
            .getPublicUrl(fileName)

        console.log('[Publish] Syncing Data to Piano Studio DB...')

        // B. Update the 'pieces' table in PIANO STUDIO
        const { error } = await pianoStudioClient
            .from('pieces')
            .update({
                reference_audio_url: audioUrl,
                reference_anchors: projectData.anchors,
                reference_beat_anchors: projectData.beat_anchors || [],
                reference_subdivision: projectData.subdivision ?? 4,
                reference_is_level2: projectData.is_level2 ?? false
            })
            .eq('id', pieceId)

        if (error) throw error

        return { success: true }
    }
}
