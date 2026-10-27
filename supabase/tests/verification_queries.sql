-- =============================================================================
-- Test Suite: verification_queries.sql
-- Project:    AI-Driven Packaging Line Defect Sorter
-- Purpose:    Comprehensive verification and security audit queries for Supabase
--             migration 20261027_product_inspections.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. VERIFY TABLE SCHEMA & CONSTRAINTS
-- -----------------------------------------------------------------------------
-- Confirm table existence, column names, nullability, and data types
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'inspections'
ORDER BY ordinal_position;

-- Confirm check constraints (prediction domain, confidence range, non-empty image_path)
SELECT 
    conname AS constraint_name, 
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' 
  AND conrelid = 'public.inspections'::regclass;

-- -----------------------------------------------------------------------------
-- 2. VERIFY INDEXES (Performance & Foreign Key Optimization)
-- -----------------------------------------------------------------------------
-- Ensure foreign key user_id, sorting, and filter indexes exist
SELECT 
    indexname, 
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'inspections';

-- -----------------------------------------------------------------------------
-- 3. VERIFY ROW LEVEL SECURITY (RLS) STATUS
-- -----------------------------------------------------------------------------
-- Both rowsecurity and relforcerowsecurity must be true
SELECT 
    relname AS table_name,
    relrowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname = 'inspections' 
  AND relnamespace = 'public'::regnamespace;

-- -----------------------------------------------------------------------------
-- 4. VERIFY TABLE RLS POLICIES
-- -----------------------------------------------------------------------------
-- Check all 5 policies for inspections (SELECT, INSERT, UPDATE, DELETE, service_role)
SELECT 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual AS using_expression, 
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'inspections'
ORDER BY policyname;

-- -----------------------------------------------------------------------------
-- 5. VERIFY STORAGE BUCKET CONFIGURATION
-- -----------------------------------------------------------------------------
-- Bucket must exist, be private (public = false), have 10MB limit and MIME restrictions
SELECT 
    id, 
    name, 
    public, 
    file_size_limit, 
    allowed_mime_types
FROM storage.buckets
WHERE id = 'inspection-images';

-- -----------------------------------------------------------------------------
-- 6. VERIFY STORAGE OBJECTS RLS POLICIES
-- -----------------------------------------------------------------------------
-- Check all policies configured on storage.objects for inspection-images
SELECT 
    policyname, 
    roles, 
    cmd, 
    qual AS using_expression, 
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname ILIKE '%inspection%'
ORDER BY policyname;

-- -----------------------------------------------------------------------------
-- 7. VERIFY SECURITY INVOKER ON ANALYTICAL VIEWS
-- -----------------------------------------------------------------------------
-- Security Advisor compliance: Views must have security_invoker = true
SELECT 
    c.relname AS view_name,
    c.reloptions AS view_options
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relname IN ('inspection_analytics_summary', 'daily_inspection_trends')
  AND c.relkind = 'v';

-- -----------------------------------------------------------------------------
-- 8. VERIFY ROLE PRIVILEGES (ZERO UNAUTHENTICATED / ANON ACCESS)
-- -----------------------------------------------------------------------------
-- Ensure 'anon' role has NO SELECT, INSERT, UPDATE, or DELETE on inspections
SELECT 
    grantee, 
    table_schema, 
    table_name, 
    privilege_type
FROM information_schema.role_table_grants
WHERE table_name IN ('inspections', 'inspection_analytics_summary', 'daily_inspection_trends')
  AND grantee IN ('anon', 'public')
ORDER BY table_name, privilege_type;

-- -----------------------------------------------------------------------------
-- 9. END-TO-END RLS SIMULATION & TEST HARNESS
-- -----------------------------------------------------------------------------
-- Execute within a transaction block so test records are rolled back cleanly:
BEGIN;

-- Create two test users in auth.users if not already existing
DO $$
DECLARE
    user_a_id UUID := '11111111-1111-1111-1111-111111111111';
    user_b_id UUID := '22222222-2222-2222-2222-222222222222';
BEGIN
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES 
        (user_a_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator_a@example.com', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
        (user_b_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'operator_b@example.com', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
    ON CONFLICT (id) DO NOTHING;
END $$;

-- 9.1 Simulate User A Session
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

-- User A inserts valid inspection
INSERT INTO public.inspections (user_id, image_path, prediction, confidence, notes, is_placeholder)
VALUES ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/box_001.jpg', 'Defective', 0.9420, 'Dented outer cardboard carton', false);

-- User A queries own inspections -> Expect 1 record
SELECT id, user_id, prediction, confidence FROM public.inspections;

-- User A queries analytical summary view -> Expect total_inspections = 1, defective_count = 1
SELECT * FROM public.inspection_analytics_summary;

-- 9.2 Simulate User B Session (Isolation Test)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';

-- User B queries inspections -> Expect 0 records (User A record is invisible)
SELECT id, user_id, prediction FROM public.inspections;

-- User B queries analytical summary view -> Expect 0 rows
SELECT * FROM public.inspection_analytics_summary;

-- User B attempts cross-user insertion (spoofing User A's ID) -> Must FAIL with RLS check violation
DO $$
BEGIN
    INSERT INTO public.inspections (user_id, image_path, prediction, confidence)
    VALUES ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/hack.jpg', 'Non-defective', 0.9999);
    RAISE EXCEPTION 'TEST FAILED: User B was able to insert on behalf of User A!';
EXCEPTION WHEN row_security_policy_violation OR check_violation THEN
    RAISE NOTICE 'TEST PASSED: Cross-user insert rejected by RLS policy.';
END $$;

-- 9.3 Simulate Anonymous Access (Must Fail / Return 0 records)
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role": "anon"}';

DO $$
BEGIN
    PERFORM * FROM public.inspections;
    RAISE EXCEPTION 'TEST FAILED: Anon role was able to query inspections!';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'TEST PASSED: Anon role rejected with insufficient_privilege.';
END $$;

-- 9.4 Simulate Service Role Bypass
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claims" = '{"role": "service_role"}';

-- Service role sees all records across all users
SELECT COUNT(*) AS total_service_role_visible FROM public.inspections;

-- Rollback the transaction to maintain pristine database state
ROLLBACK;
