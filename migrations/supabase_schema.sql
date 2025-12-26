-- Create projects table
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  audio_url text not null,
  xml_url text not null,
  anchors jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn off Row Level Security (RLS) for now so you can save without logging in
alter table public.projects enable row level security;

create policy "Enable read access for all users"
on public.projects for select
using (true);

create policy "Enable insert access for all users"
on public.projects for insert
with check (true);
