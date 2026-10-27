# Supabase Database & Security Layer

This directory contains the database migration scripts, security configurations, and verification test suites for the AI-Driven Packaging Line Defect Sorter.

## Directory Structure

```
supabase/
├── migrations/
│   └── 20261027_product_inspections.sql   # Primary production migration script
├── tests/
│   └── verification_queries.sql           # Complete RLS and security verification suite
└── README.md                              # This file
```

## Quick Start

1. **Apply Migration**:
   - In Supabase Dashboard: Copy and run `migrations/20261027_product_inspections.sql` in the **SQL Editor**.
   - Or with Supabase CLI: `supabase db push`.

2. **Verify Security**:
   - Run `tests/verification_queries.sql` in the SQL Editor to verify table constraints, indexes, RLS isolation, storage policies, and analytical views.

3. **Complete Documentation**:
   - Refer to [`docs/SUPABASE_SETUP.md`](../docs/SUPABASE_SETUP.md) for full architecture details, ER diagrams, and JavaScript/Python code examples.
