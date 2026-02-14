-- Consolidated Database Schema for Score Follower
-- This includes all columns for Measure and Level 2 (Beat) mapping.

-- 1. Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  audio_url text NOT NULL,
  xml_url text NOT NULL,
  anchors jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Level 2 Beat Mapping columns
  beat_anchors jsonb DEFAULT '[]'::jsonb,
  subdivision integer DEFAULT 4,
  is_level2 boolean DEFAULT false,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 3. Define Policies
-- Read access for everyone
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Enable read access for all users'
  ) THEN
    CREATE POLICY "Enable read access for all users" ON public.projects FOR SELECT USING (true);
  END IF;
END $$;

-- Insert access for everyone
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Enable insert access for all users'
  ) THEN
    CREATE POLICY "Enable insert access for all users" ON public.projects FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Update access for everyone
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Enable update access for all users'
  ) THEN
    CREATE POLICY "Enable update access for all users" ON public.projects FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;
