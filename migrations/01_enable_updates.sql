-- Add updated_at column if it doesn't exist
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone default timezone('utc'::text, now()) not null;

-- Enable UPDATE access for all users (required for the Save functionality)
CREATE POLICY "Enable update access for all users"
ON public.projects FOR UPDATE
USING (true)
WITH CHECK (true);
