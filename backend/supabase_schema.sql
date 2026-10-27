-- =============================================================================
-- AI-Driven Product Inspection - Supabase Database & Storage Setup Schema
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/_/sql
-- =============================================================================

-- 1. Create Storage Bucket for Private Inspection Images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'inspection-images',
    'inspection-images',
    false, -- Private bucket: access requires signed URLs or service role
    10485760, -- 10MB limit per image
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS: Authenticated users can view their own folder objects
create policy "Authenticated users can read own inspection images"
on storage.objects for select
to authenticated
using (
    bucket_id = 'inspection-images' and
    (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Create Inspections Audit Table
create table if not exists public.inspections (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    image_path text not null,
    prediction varchar(50) not null check (prediction in ('Defective', 'Non-defective')),
    is_defective boolean not null default false,
    confidence numeric(5, 4) not null check (confidence >= 0.0 and confidence <= 1.0),
    is_placeholder boolean not null default false,
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now() not null
);

-- 3. High Performance Indexes
create index if not exists idx_inspections_user_id on public.inspections(user_id);
create index if not exists idx_inspections_created_at on public.inspections(created_at desc);
create index if not exists idx_inspections_is_defective on public.inspections(is_defective);
create index if not exists idx_inspections_prediction on public.inspections(prediction);

-- 4. Row Level Security (RLS)
alter table public.inspections enable row level security;

-- Policy: Users can view their own inspection records
create policy "Users can view their own inspections"
on public.inspections for select
to authenticated
using (auth.uid() = user_id);

-- Policy: Users can insert their own inspection records (or backend via service role)
create policy "Users can insert their own inspections"
on public.inspections for insert
to authenticated
with check (auth.uid() = user_id);

-- Note: The FastAPI backend connects using SUPABASE_SERVICE_ROLE_KEY,
-- which automatically bypasses RLS for administrative verification, storage
-- uploads, and signed URL generation.
