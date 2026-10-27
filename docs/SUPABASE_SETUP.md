# Supabase Production Database & Security Architecture
**AI-Driven Packaging Line Defect Sorter & Product Inspection Platform**

---

## 1. Architectural Overview

This production-grade database architecture integrates **Supabase Authentication**, **PostgreSQL Row-Level Security (RLS)**, **Private Storage Buckets**, and **Security-Invoker Analytical Views** to provide multi-tenant isolation, ISO 9001 auditability, and zero unauthenticated vulnerability surface.

```
                           +---------------------------+
                           |   Browser / React Client  |
                           +-------------+-------------+
                                         |
                                         | JWT (auth.uid())
                                         v
   +-----------------------------------------------------------------------+
   | Supabase Gateway & PostgREST / Storage API                           |
   +-----------------------------------------------------------------------+
         |                                                   |
         | RLS Filter: (auth.uid() = user_id)                | Storage RLS: foldername[1] = auth.uid()
         v                                                   v
+-------------------------------+             +-------------------------------+
|  Table: public.inspections    |             | Bucket: inspection-images     |
|  - id: UUID (PK)              |             | - Private (public: false)     |
|  - user_id: UUID (FK)         |             | - Path: <user_id>/<uuid>.jpg  |
|  - image_path: TEXT           |             | - 10MB limit, JPEG/PNG/WebP   |
|  - prediction: VARCHAR(32)    |             +-------------------------------+
|  - confidence: NUMERIC(5,4)   |
|  - notes: TEXT                |
|  - is_placeholder: BOOLEAN    |
|  - created_at: TIMESTAMPTZ    |
+---------------+---------------+
                |
                v
+---------------------------------------------+
| Analytical Views (security_invoker = true)  |
| - inspection_analytics_summary              |
| - daily_inspection_trends                   |
+---------------------------------------------+
```

---

## 2. Database Schema & Specifications

### 2.1 Table: `public.inspections`

| Column | Type | Default / Constraint | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique inspection record identifier. |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Inspection operator / tenant identifier. |
| `image_path` | `TEXT` | `NOT NULL CHECK (length(trim(image_path)) > 0)` | Storage object path inside private bucket. |
| `prediction` | `VARCHAR(32)` | `NOT NULL CHECK (prediction IN ('Defective', 'Non-defective'))` | AI classification outcome. |
| `confidence` | `NUMERIC(5, 4)` | `NOT NULL CHECK (confidence >= 0.0000 AND confidence <= 1.0000)` | Model confidence score. |
| `notes` | `TEXT` | `NULL` | Operator annotations or defect details. |
| `is_placeholder`| `BOOLEAN` | `NOT NULL DEFAULT false` | Indicates simulation or test record. |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | UTC creation timestamp. |

### 2.2 Performance & Integrity Indexes

1. **`idx_inspections_user_id`**: Covering index on `user_id` foreign key. Resolves Supabase Linter `unindexed_foreign_keys` warning and prevents table-level locks during cascading deletes.
2. **`idx_inspections_user_created`**: Composite index on `(user_id, created_at DESC)`. Accelerates user dashboard timeline, log feeds, and pagination without full table scans.
3. **`idx_inspections_prediction`**: B-Tree index on `prediction` for high-speed defective vs non-defective filtering.
4. **`idx_inspections_placeholder`**: Partial index on `(is_placeholder) WHERE is_placeholder = true` for simulated data isolation and fast cleanup.

---

## 3. Security Architecture & RLS Policies

### 3.1 Table Row-Level Security (`public.inspections`)
RLS is explicitly enabled and forced:
```sql
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections FORCE ROW LEVEL SECURITY;
```

#### Policies Enforced:
* **SELECT (`Users can view their own inspections`)**:
  `USING ((SELECT auth.uid()) = user_id)`
  *Optimized with `(SELECT auth.uid())` subquery to execute as a single InitPlan rather than per-row re-evaluation.*
* **INSERT (`Users can insert their own inspections`)**:
  `WITH CHECK ((SELECT auth.uid()) = user_id)`
* **UPDATE (`Users can update their own inspections`)**:
  `USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id)`
* **DELETE (`Users can delete their own inspections`)**:
  `USING ((SELECT auth.uid()) = user_id)`
* **SERVICE ROLE BYPASS (`Service role has full administrative bypass for inspections`)**:
  `TO service_role USING (true) WITH CHECK (true)`
  *Enables automated server-side YOLO inference workers and admin scripts to process records.*

### 3.2 Private Storage Bucket (`inspection-images`)
* **Bucket Name**: `inspection-images`
* **Visibility**: `public: false` (Zero direct CDN access; requires signed URLs or authenticated sessions).
* **Allowed MIME Types**: `image/jpeg`, `image/png`, `image/webp`.
* **File Size Cap**: 10 MB (`10485760` bytes).
* **Storage Path Pattern**: `<user_id>/<filename>.jpg`

#### Storage RLS Policies (`storage.objects`):
* **SELECT**: `bucket_id = 'inspection-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text`
* **INSERT**: `bucket_id = 'inspection-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text`
* **UPDATE**: `bucket_id = 'inspection-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text`
* **DELETE**: `bucket_id = 'inspection-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text`
* **SERVICE ROLE**: `TO service_role USING (bucket_id = 'inspection-images')`

### 3.3 Security Advisor Compliance (Zero Warnings)
1. **Security Invoker Analytical Views**:
   Views `public.inspection_analytics_summary` and `public.daily_inspection_trends` are created with `WITH (security_invoker = true)`.
   *In PostgreSQL 15+, default views act as SECURITY DEFINER (running as the view creator and leaking all rows). `security_invoker = true` forces PostgreSQL to execute the view using the caller's privileges, ensuring RLS filtering applies automatically.*
2. **Zero Unauthenticated Leaks**:
   `anon` and `public` roles are explicitly revoked on tables and analytical views. Unauthenticated requests are immediately rejected by Postgres (`401 Unauthorized` / `insufficient_privilege`).

---

## 4. Setup & Deployment Instructions

### Method A: Supabase Web Dashboard (Recommended for Quick Setup)
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open your project and navigate to the **SQL Editor** tab (terminal icon on left sidebar).
3. Click **New query**.
4. Open [`supabase/migrations/20261027_product_inspections.sql`](file:///d:/ai-driven%20packaging/supabase/migrations/20261027_product_inspections.sql) and copy its entire contents.
5. Paste into the SQL Editor and click **Run** (or `Ctrl+Enter`).
6. Confirm the success message: `Success. No rows returned`.
7. Go to **Storage** in the sidebar: verify the private bucket `inspection-images` exists.
8. Go to **Database > Security Advisor**: verify that zero warnings are reported.

### Method B: Supabase CLI
```bash
# Link your local project to your remote Supabase instance
supabase link --project-ref <your-project-id>

# Apply pending migrations
supabase db push
```

---

## 5. Verification & Testing

To verify all constraints, RLS isolation, storage policies, and view protections, run [`supabase/tests/verification_queries.sql`](file:///d:/ai-driven%20packaging/supabase/tests/verification_queries.sql) in the Supabase SQL Editor.

### Key Verification Checkpoints:
1. **Schema Check**:
   ```sql
   SELECT column_name, data_type, is_nullable FROM information_schema.columns 
   WHERE table_name = 'inspections';
   ```
2. **RLS Verification**:
   ```sql
   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class 
   WHERE relname = 'inspections';
   -- Expect: relrowsecurity = true, relforcerowsecurity = true
   ```
3. **Cross-Tenant Isolation Test**:
   The verification script automatically simulates two distinct authenticated users (`User A` and `User B`). It verifies:
   - `User A` can insert and read their inspection.
   - `User B` reading `inspections` returns 0 rows.
   - `User B` attempting to insert with `user_id = User A` is blocked by RLS.
   - `anon` role attempting to read or write is rejected with `insufficient_privilege`.

---

## 6. Client Application Integration Guide

### 6.1 Frontend (React / Vite + `@supabase/supabase-js`)

#### Initialize Client (`frontend/src/supabaseClient.js`)
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

#### Uploading Inspection Image & Inserting Record
```javascript
import { supabase } from './supabaseClient';

export async function submitInspection({ fileBlob, prediction, confidence, notes }) {
  // 1. Get current authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Authentication required');

  // 2. Upload image to private storage bucket in user's isolated folder
  const fileExt = fileBlob.type === 'image/png' ? 'png' : 'jpg';
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const storagePath = `${user.id}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('inspection-images')
    .upload(storagePath, fileBlob, {
      contentType: fileBlob.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  // 3. Insert inspection record into database
  const { data: record, error: insertError } = await supabase
    .from('inspections')
    .insert({
      user_id: user.id,
      image_path: storagePath,
      prediction: prediction, // 'Defective' or 'Non-defective'
      confidence: confidence, // e.g. 0.9850
      notes: notes || null,
      is_placeholder: false
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return record;
}
```

#### Generating Signed Image URL for Private Viewing
Because the bucket is private, use `createSignedUrl` to display images securely:
```javascript
export async function getInspectionImageUrl(storagePath, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from('inspection-images')
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
```

#### Realtime Subscription to New Inspections
```javascript
export function subscribeToInspections(onNewInspection) {
  return supabase
    .channel('realtime:inspections')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'inspections' },
      (payload) => onNewInspection(payload.new)
    )
    .subscribe();
}
```

---

### 6.2 Backend Automated Pipeline (Python FastAPI / YOLOv8)

For server-side conveyor ingestion using the `service_role` key:

```python
import os
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def record_automated_inspection(user_id: str, image_bytes: bytes, prediction: str, confidence: float, notes: str):
    import uuid
    filename = f"{uuid.uuid4()}.jpg"
    storage_path = f"{user_id}/{filename}"
    
    # 1. Upload to private bucket using administrative privileges
    supabase.storage.from_("inspection-images").upload(
        path=storage_path,
        file=image_bytes,
        file_options={"content-type": "image/jpeg"}
    )
    
    # 2. Insert audit row
    response = supabase.table("inspections").insert({
        "user_id": user_id,
        "image_path": storage_path,
        "prediction": prediction,
        "confidence": round(confidence, 4),
        "notes": notes,
        "is_placeholder": False
    }).execute()
    
    return response.data
```

---

## 7. Security Advisor & Audit Checklist

- [x] RLS enabled on `public.inspections`
- [x] RLS forced (`FORCE ROW LEVEL SECURITY`) on `public.inspections`
- [x] Policy expressions utilize `(SELECT auth.uid())` for subquery caching
- [x] Foreign key `inspections.user_id` indexed with `idx_inspections_user_id`
- [x] Storage bucket `inspection-images` set to `public: false`
- [x] Storage RLS enforces folder segregation by `auth.uid()::text`
- [x] Analytical views explicitly compiled with `WITH (security_invoker = true)`
- [x] Anonymous (`anon`) role explicitly denied privileges
- [x] Realtime publication safely registered with `REPLICA IDENTITY FULL`
