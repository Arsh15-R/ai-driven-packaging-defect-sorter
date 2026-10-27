-- =============================================================================
-- Migration: 20261027_product_inspections.sql
-- Project:   AI-Driven Packaging Line Defect Sorter & Product Inspection App
-- Target:    Supabase PostgreSQL (Auth, Table, Storage, RLS, Analytical Views)
-- Security:  Supabase Security Advisor & Database Linter Compliant (Zero Warnings)
-- =============================================================================

-- Ensure required cryptographic extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABLE DEFINITION: inspections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    prediction VARCHAR(32) NOT NULL,
    confidence NUMERIC(5, 4) NOT NULL,
    notes TEXT,
    is_placeholder BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Integrity Constraints
    CONSTRAINT check_inspections_prediction_domain 
        CHECK (prediction IN ('Defective', 'Non-defective')),
    CONSTRAINT check_inspections_confidence_range 
        CHECK (confidence >= 0.0000 AND confidence <= 1.0000),
    CONSTRAINT check_inspections_image_path_not_empty 
        CHECK (length(trim(image_path)) > 0)
);

-- Documentation comments on table and columns
COMMENT ON TABLE public.inspections IS 
    'Audit records of automated and manual product defect inspections with image storage references.';
COMMENT ON COLUMN public.inspections.id IS 
    'Unique inspection event identifier (UUID v4).';
COMMENT ON COLUMN public.inspections.user_id IS 
    'Foreign key linking inspection record to authenticated user in auth.users.';
COMMENT ON COLUMN public.inspections.image_path IS 
    'Relative path within the inspection-images private storage bucket (<user_id>/<filename>).';
COMMENT ON COLUMN public.inspections.prediction IS 
    'Machine learning or operator classification outcome (Defective or Non-defective).';
COMMENT ON COLUMN public.inspections.confidence IS 
    'Model classification confidence score between 0.0000 and 1.0000.';
COMMENT ON COLUMN public.inspections.notes IS 
    'Operator observations, defect classification details, or environmental annotations.';
COMMENT ON COLUMN public.inspections.is_placeholder IS 
    'Flag indicating synthetic, simulation, or placeholder data.';
COMMENT ON COLUMN public.inspections.created_at IS 
    'Timestamp (UTC) when inspection record was created.';

-- -----------------------------------------------------------------------------
-- 2. PERFORMANCE & SECURITY INDEXES
-- -----------------------------------------------------------------------------
-- Foreign key indexing to prevent full table locks on cascading user deletion
-- and accelerate RLS policy filtering per user
CREATE INDEX IF NOT EXISTS idx_inspections_user_id 
    ON public.inspections (user_id);

-- Composite index covering common dashboard timeline & history pagination queries
CREATE INDEX IF NOT EXISTS idx_inspections_user_created 
    ON public.inspections (user_id, created_at DESC);

-- Index for aggregate queries filtering by prediction outcome (defective rates)
CREATE INDEX IF NOT EXISTS idx_inspections_prediction 
    ON public.inspections (prediction);

-- Partial index for quick identification/cleanup of placeholder simulation rows
CREATE INDEX IF NOT EXISTS idx_inspections_placeholder 
    ON public.inspections (is_placeholder) 
    WHERE is_placeholder = true;

-- -----------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY (RLS) FOR TABLE: inspections
-- -----------------------------------------------------------------------------
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections FORCE ROW LEVEL SECURITY;

-- Clean existing policies for idempotency
DROP POLICY IF EXISTS "Users can view their own inspections" ON public.inspections;
DROP POLICY IF EXISTS "Users can insert their own inspections" ON public.inspections;
DROP POLICY IF EXISTS "Users can update their own inspections" ON public.inspections;
DROP POLICY IF EXISTS "Users can delete their own inspections" ON public.inspections;
DROP POLICY IF EXISTS "Service role has full administrative bypass for inspections" ON public.inspections;

-- Policy 1: Authenticated users can only read their own inspection rows
-- Note: Wrapping auth.uid() in (SELECT auth.uid()) optimizes PostgreSQL query planning (InitPlan)
CREATE POLICY "Users can view their own inspections"
ON public.inspections
FOR SELECT
TO authenticated
USING (
    (SELECT auth.uid()) = user_id
);

-- Policy 2: Authenticated users can only insert inspections for their own user_id
CREATE POLICY "Users can insert their own inspections"
ON public.inspections
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT auth.uid()) = user_id
);

-- Policy 3: Authenticated users can update notes or fields of their own inspections
CREATE POLICY "Users can update their own inspections"
ON public.inspections
FOR UPDATE
TO authenticated
USING (
    (SELECT auth.uid()) = user_id
)
WITH CHECK (
    (SELECT auth.uid()) = user_id
);

-- Policy 4: Authenticated users can delete their own inspections
CREATE POLICY "Users can delete their own inspections"
ON public.inspections
FOR DELETE
TO authenticated
USING (
    (SELECT auth.uid()) = user_id
);

-- Policy 5: Service Role administrative full bypass for backend worker ingestion & pipelines
CREATE POLICY "Service role has full administrative bypass for inspections"
ON public.inspections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. PRIVATE SUPABASE STORAGE BUCKET: inspection-images
-- -----------------------------------------------------------------------------
-- Create or configure the private bucket for inspection images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'inspection-images',
    'inspection-images',
    false, -- Private: zero direct public HTTP access without signed URL
    10485760, -- 10MB maximum file size limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Ensure RLS is active on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Clean existing storage policies for idempotency
DROP POLICY IF EXISTS "Users can read own inspection images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own inspection images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own inspection images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own inspection images" ON storage.objects;
DROP POLICY IF EXISTS "Service role has full administrative bypass for inspection images" ON storage.objects;

-- Storage Policy 1: Authenticated users can only download/view images inside their user folder
CREATE POLICY "Users can read own inspection images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'inspection-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Storage Policy 2: Authenticated users can only upload images inside their user folder
CREATE POLICY "Users can upload own inspection images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'inspection-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Storage Policy 3: Authenticated users can update/replace their own inspection images
CREATE POLICY "Users can update own inspection images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'inspection-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
    bucket_id = 'inspection-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Storage Policy 4: Authenticated users can delete their own inspection images
CREATE POLICY "Users can delete own inspection images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'inspection-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Storage Policy 5: Service Role has unrestricted bypass for storage processing
CREATE POLICY "Service role has full administrative bypass for inspection images"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'inspection-images')
WITH CHECK (bucket_id = 'inspection-images');

-- -----------------------------------------------------------------------------
-- 5. ANALYTICAL VIEWS (SECURITY INVOKER ENABLED)
-- -----------------------------------------------------------------------------
-- View 1: User inspection summary statistics
-- Security Invoker guarantees queries respect the caller's RLS permissions
CREATE OR REPLACE VIEW public.inspection_analytics_summary
WITH (security_invoker = true)
AS
SELECT
    user_id,
    COUNT(*)::bigint AS total_inspections,
    COUNT(*) FILTER (WHERE prediction = 'Defective')::bigint AS defective_count,
    COUNT(*) FILTER (WHERE prediction = 'Non-defective')::bigint AS non_defective_count,
    COALESCE(
        ROUND((COUNT(*) FILTER (WHERE prediction = 'Defective')::numeric / NULLIF(COUNT(*), 0)::numeric) * 100.0, 2),
        0.00
    ) AS defect_rate_percentage,
    COALESCE(ROUND(AVG(confidence)::numeric, 4), 0.0000) AS avg_confidence,
    COUNT(*) FILTER (WHERE is_placeholder = true)::bigint AS placeholder_count,
    MIN(created_at) AS first_inspection_at,
    MAX(created_at) AS latest_inspection_at
FROM public.inspections
GROUP BY user_id;

COMMENT ON VIEW public.inspection_analytics_summary IS 
    'Aggregate inspection performance metrics per user. Security invoker ensures RLS isolation.';

-- View 2: Daily inspection trends for dashboard time series charts
CREATE OR REPLACE VIEW public.daily_inspection_trends
WITH (security_invoker = true)
AS
SELECT
    user_id,
    (created_at AT TIME ZONE 'UTC')::date AS inspection_date,
    COUNT(*)::bigint AS total_inspections,
    COUNT(*) FILTER (WHERE prediction = 'Defective')::bigint AS defective_count,
    COUNT(*) FILTER (WHERE prediction = 'Non-defective')::bigint AS non_defective_count,
    COALESCE(
        ROUND((COUNT(*) FILTER (WHERE prediction = 'Defective')::numeric / NULLIF(COUNT(*), 0)::numeric) * 100.0, 2),
        0.00
    ) AS defect_rate_percentage,
    COALESCE(ROUND(AVG(confidence)::numeric, 4), 0.0000) AS avg_confidence
FROM public.inspections
GROUP BY user_id, (created_at AT TIME ZONE 'UTC')::date;

COMMENT ON VIEW public.daily_inspection_trends IS 
    'Daily defect rates and throughput trends per user. Security invoker ensures RLS isolation.';

-- -----------------------------------------------------------------------------
-- 6. PERMISSIONS & ROLE SECURITY (ZERO UNAUTHENTICATED ACCESS)
-- -----------------------------------------------------------------------------
-- Revoke all public / anonymous permissions on tables and views
REVOKE ALL ON public.inspections FROM anon;
REVOKE ALL ON public.inspections FROM public;
REVOKE ALL ON public.inspection_analytics_summary FROM anon;
REVOKE ALL ON public.inspection_analytics_summary FROM public;
REVOKE ALL ON public.daily_inspection_trends FROM anon;
REVOKE ALL ON public.daily_inspection_trends FROM public;

-- Grant explicit privileges strictly to authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;

GRANT SELECT ON public.inspection_analytics_summary TO authenticated;
GRANT ALL ON public.inspection_analytics_summary TO service_role;

GRANT SELECT ON public.daily_inspection_trends TO authenticated;
GRANT ALL ON public.daily_inspection_trends TO service_role;

-- -----------------------------------------------------------------------------
-- 7. SUPABASE REALTIME CONFIGURATION
-- -----------------------------------------------------------------------------
-- Enable full row replication for Realtime dashboard subscriptions
ALTER TABLE public.inspections REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'inspections'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.inspections;
    END IF;
END $$;
