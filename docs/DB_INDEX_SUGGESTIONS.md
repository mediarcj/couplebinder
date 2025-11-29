# Database Index Suggestions for Payment Stack

## Overview
This document provides suggested indexes and diagnostic queries for the payment stack tables based on code analysis.

## Table: `payments`

### Common Query Patterns (from code analysis)
1. **Upsert by `stripe_checkout_session_id`** (hot path - every payment)
   - Used in: `billingService.upsertPaymentFromSession()`, `stripeWebhook` handler
   - Pattern: `.upsert(row, { onConflict: 'stripe_checkout_session_id' })`

2. **Update by `stripe_payment_intent_id`** (cold path - refunds only)
   - Used in: `billingService.upsertRefundStatus()`, `stripeWebhook` refund handler
   - Pattern: `.eq('stripe_payment_intent_id', paymentIntentId).update(...)`

3. **Potential: Select by `user_id`** (likely exists but not seen in current code)
   - Pattern: `.eq('user_id', userId)` (for user payment history)

### Suggested Indexes

```sql
-- Unique index on stripe_checkout_session_id (for upsert conflict resolution)
-- Note: This may already exist if stripe_checkout_session_id is a unique constraint
-- Verify first, then create if missing
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_checkout_session_id
  ON public.payments (stripe_checkout_session_id);
-- Success. No rows returned  

-- Index on stripe_payment_intent_id (for refund lookups)
CREATE INDEX IF NOT EXISTS idx_payments_payment_intent_id
  ON public.payments (stripe_payment_intent_id);
  -- Success. No rows returned  

-- Index on user_id (for user payment history queries - if they exist)
CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON public.payments (user_id);
-- Success. No rows returned   

-- Composite index for common query pattern: user payments ordered by date
-- Only create if you have queries like: WHERE user_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_payments_user_id_created_at
  ON public.payments (user_id, created_at DESC);
-- Success. No rows returned    
```

### Diagnostic Queries

```sql
-- 1. Check existing indexes on payments table
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'payments'
  AND schemaname = 'public'
ORDER BY indexname;
[
  {
    "indexname": "idx_payments_checkout_session_id",
    "indexdef": "CREATE UNIQUE INDEX idx_payments_checkout_session_id ON public.payments USING btree (stripe_checkout_session_id)"
  },
  {
    "indexname": "idx_payments_payment_intent_id",
    "indexdef": "CREATE INDEX idx_payments_payment_intent_id ON public.payments USING btree (stripe_payment_intent_id)"
  },
  {
    "indexname": "idx_payments_session",
    "indexdef": "CREATE INDEX idx_payments_session ON public.payments USING btree (stripe_checkout_session_id)"
  },
  {
    "indexname": "idx_payments_user_created",
    "indexdef": "CREATE INDEX idx_payments_user_created ON public.payments USING btree (user_id, created_at DESC)"
  },
  {
    "indexname": "idx_payments_user_id",
    "indexdef": "CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id)"
  },
  {
    "indexname": "idx_payments_user_id_created_at",
    "indexdef": "CREATE INDEX idx_payments_user_id_created_at ON public.payments USING btree (user_id, created_at DESC)"
  },
  {
    "indexname": "payments_checkout_session_id_idx",
    "indexdef": "CREATE INDEX payments_checkout_session_id_idx ON public.payments USING btree (stripe_checkout_session_id)"
  },
  {
    "indexname": "payments_created_at_idx",
    "indexdef": "CREATE INDEX payments_created_at_idx ON public.payments USING btree (created_at)"
  },
  {
    "indexname": "payments_pkey",
    "indexdef": "CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)"
  },
  {
    "indexname": "payments_status_idx",
    "indexdef": "CREATE INDEX payments_status_idx ON public.payments USING btree (status)"
  },
  {
    "indexname": "payments_stripe_checkout_session_id_key",
    "indexdef": "CREATE UNIQUE INDEX payments_stripe_checkout_session_id_key ON public.payments USING btree (stripe_checkout_session_id)"
  },
  {
    "indexname": "payments_stripe_checkout_session_id_uniq",
    "indexdef": "CREATE UNIQUE INDEX payments_stripe_checkout_session_id_uniq ON public.payments USING btree (stripe_checkout_session_id)"
  },
  {
    "indexname": "payments_stripe_payment_intent_id_idx",
    "indexdef": "CREATE INDEX payments_stripe_payment_intent_id_idx ON public.payments USING btree (stripe_payment_intent_id)"
  },
  {
    "indexname": "payments_stripe_payment_intent_id_key",
    "indexdef": "CREATE UNIQUE INDEX payments_stripe_payment_intent_id_key ON public.payments USING btree (stripe_payment_intent_id)"
  },
  {
    "indexname": "payments_stripe_payment_intent_id_uniq",
    "indexdef": "CREATE UNIQUE INDEX payments_stripe_payment_intent_id_uniq ON public.payments USING btree (stripe_payment_intent_id)"
  },
  {
    "indexname": "payments_user_id_idx",
    "indexdef": "CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id)"
  }
]

-- 2. Check if stripe_checkout_session_id has unique constraint
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.payments'::regclass
  AND conname LIKE '%checkout_session%';
[
  {
    "constraint_name": "payments_stripe_checkout_session_id_key",
    "constraint_type": "u",
    "constraint_definition": "UNIQUE (stripe_checkout_session_id)"
  }
]  

-- 3. EXPLAIN ANALYZE for upsert pattern (use a test session ID)
EXPLAIN ANALYZE
SELECT *
FROM public.payments
WHERE stripe_checkout_session_id = 'cs_test_1234567890abcdef'
LIMIT 1;
[
  {
    "QUERY PLAN": "Limit  (cost=0.14..2.35 rows=1 width=1321) (actual time=1.217..1.218 rows=0 loops=1)"
  },
  {
    "QUERY PLAN": "  ->  Index Scan using idx_payments_checkout_session_id on payments  (cost=0.14..2.35 rows=1 width=1321) (actual time=1.216..1.216 rows=0 loops=1)"
  },
  {
    "QUERY PLAN": "        Index Cond: (stripe_checkout_session_id = 'cs_test_1234567890abcdef'::text)"
  },
  {
    "QUERY PLAN": "Planning Time: 11.282 ms"
  },
  {
    "QUERY PLAN": "Execution Time: 1.310 ms"
  }
]

-- 4. EXPLAIN ANALYZE for refund lookup pattern (use a test payment intent ID)
EXPLAIN ANALYZE
SELECT *
FROM public.payments
WHERE stripe_payment_intent_id = 'pi_test_1234567890abcdef'
LIMIT 1;
[
  {
    "QUERY PLAN": "Limit  (cost=0.14..2.35 rows=1 width=1321) (actual time=0.757..0.757 rows=0 loops=1)"
  },
  {
    "QUERY PLAN": "  ->  Index Scan using idx_payments_payment_intent_id on payments  (cost=0.14..2.35 rows=1 width=1321) (actual time=0.756..0.756 rows=0 loops=1)"
  },
  {
    "QUERY PLAN": "        Index Cond: (stripe_payment_intent_id = 'pi_test_1234567890abcdef'::text)"
  },
  {
    "QUERY PLAN": "Planning Time: 0.885 ms"
  },
  {
    "QUERY PLAN": "Execution Time: 0.837 ms"
  }
]

-- 5. EXPLAIN ANALYZE for user payment history (if this query exists)
-- Replace '<test_user_id>' with an actual UUID from your database
EXPLAIN ANALYZE
SELECT *
FROM public.payments
WHERE user_id = '<test_user_id>'
ORDER BY created_at DESC
LIMIT 20;
Error: Failed to run sql query: ERROR: 22P02: invalid input syntax for type uuid: "<test_user_id>" LINE 3: WHERE user_id = '<test_user_id>' ^

-- 6. Check table size and row count
SELECT
  pg_size_pretty(pg_total_relation_size('public.payments')) AS total_size,
  pg_size_pretty(pg_relation_size('public.payments')) AS table_size,
  pg_size_pretty(pg_indexes_size('public.payments')) AS indexes_size,
  (SELECT COUNT(*) FROM public.payments) AS row_count;
```
[
  {
    "total_size": "344 kB",
    "table_size": "56 kB",
    "indexes_size": "256 kB",
    "row_count": 14
  }
]
---

## Table: `billing_customers`

### Common Query Patterns (from code analysis)
1. **Select by `user_id`** (hot path - every checkout)
   - Used in: `billingService.getOrCreateStripeCustomer()`
   - Pattern: `.eq('user_id', userId).maybeSingle()`

2. **Upsert by `user_id`** (hot path - every checkout if customer doesn't exist)
   - Used in: `billingService.getOrCreateStripeCustomer()`
   - Pattern: `.upsert(upsert, { onConflict: 'user_id' })`

### Suggested Indexes

```sql
-- Unique index on user_id (for upsert conflict resolution)
-- Note: This may already exist if user_id is a unique constraint or primary key
-- Verify first, then create if missing
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_customers_user_id
  ON public.billing_customers (user_id);
```
-- Success. No rows returned

### Diagnostic Queries

```sql
-- 1. Check existing indexes on billing_customers table
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'billing_customers'
  AND schemaname = 'public'
ORDER BY indexname;
[
  {
    "indexname": "billing_customers_pkey",
    "indexdef": "CREATE UNIQUE INDEX billing_customers_pkey ON public.billing_customers USING btree (user_id)"
  },
  {
    "indexname": "billing_customers_stripe_customer_id_key",
    "indexdef": "CREATE UNIQUE INDEX billing_customers_stripe_customer_id_key ON public.billing_customers USING btree (stripe_customer_id)"
  },
  {
    "indexname": "idx_billing_customers_email",
    "indexdef": "CREATE INDEX idx_billing_customers_email ON public.billing_customers USING btree (email)"
  },
  {
    "indexname": "idx_billing_customers_user",
    "indexdef": "CREATE INDEX idx_billing_customers_user ON public.billing_customers USING btree (user_id)"
  },
  {
    "indexname": "idx_billing_customers_user_id",
    "indexdef": "CREATE UNIQUE INDEX idx_billing_customers_user_id ON public.billing_customers USING btree (user_id)"
  }
]

-- 2. Check if user_id has unique constraint
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.billing_customers'::regclass
  AND conname LIKE '%user_id%';
[
  {
    "constraint_name": "billing_customers_user_id_fkey",
    "constraint_type": "f",
    "constraint_definition": "FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"
  }
]

-- 3. EXPLAIN ANALYZE for user lookup (use a test user ID)
EXPLAIN ANALYZE
SELECT user_id, stripe_customer_id_live, stripe_customer_id_test, stripe_customer_id
FROM public.billing_customers
WHERE user_id = '<test_user_id>'
LIMIT 1;
Error: Failed to run sql query: ERROR: 22P02: invalid input syntax for type uuid: "<test_user_id>" LINE 3: WHERE user_id = '<test_user_id>' ^

-- 4. Check table size and row count
SELECT
  pg_size_pretty(pg_total_relation_size('public.billing_customers')) AS total_size,
  pg_size_pretty(pg_relation_size('public.billing_customers')) AS table_size,
  pg_size_pretty(pg_indexes_size('public.billing_customers')) AS indexes_size,
  (SELECT COUNT(*) FROM public.billing_customers) AS row_count;
```
[
  {
    "total_size": "96 kB",
    "table_size": "8192 bytes",
    "indexes_size": "80 kB",
    "row_count": 2
  }
]

---

## Table: `profiles`

### Common Query Patterns (from code analysis)
1. **Select by `user_id`** (hot path - dashboard/profile pages)
   - Used in: `profileService.getProfileByUserId()`, `profileSyncService.updateProfileTransactional()`
   - Pattern: `.eq('user_id', userId).single()` or `.maybeSingle()`

### Suggested Indexes

```sql
-- Unique index on user_id (likely already exists as primary key)
-- Verify first, then create if missing
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id
  ON public.profiles (user_id);
```
-- Success. No rows returned

### Diagnostic Queries

```sql
-- 1. Check existing indexes on profiles table
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
  AND schemaname = 'public'
ORDER BY indexname;
[
  {
    "indexname": "idx_profiles_display_name_search",
    "indexdef": "CREATE INDEX idx_profiles_display_name_search ON public.profiles USING gin (to_tsvector('simple'::regconfig, display_name))"
  },
  {
    "indexname": "idx_profiles_display_name_trgm",
    "indexdef": "CREATE INDEX idx_profiles_display_name_trgm ON public.profiles USING gin (display_name gin_trgm_ops)"
  },
  {
    "indexname": "idx_profiles_email_lower",
    "indexdef": "CREATE INDEX idx_profiles_email_lower ON public.profiles USING btree (lower(email))"
  },
  {
    "indexname": "idx_profiles_privacy",
    "indexdef": "CREATE INDEX idx_profiles_privacy ON public.profiles USING btree (account_privacy)"
  },
  {
    "indexname": "idx_profiles_user_id",
    "indexdef": "CREATE UNIQUE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id)"
  },
  {
    "indexname": "profiles_pkey",
    "indexdef": "CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (user_id)"
  }
]

-- 2. Check if user_id is primary key
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND contype = 'p';
[
  {
    "constraint_name": "profiles_pkey",
    "constraint_type": "p",
    "constraint_definition": "PRIMARY KEY (user_id)"
  }
]  

-- 3. EXPLAIN ANALYZE for profile lookup (use a test user ID)
EXPLAIN ANALYZE
SELECT *
FROM public.profiles
WHERE user_id = '<test_user_id>'
LIMIT 1;
Error: Failed to run sql query: ERROR: 22P02: invalid input syntax for type uuid: "<test_user_id>" LINE 3: WHERE user_id = '<test_user_id>' ^

-- 4. Check table size and row count
SELECT
  pg_size_pretty(pg_total_relation_size('public.profiles')) AS total_size,
  pg_size_pretty(pg_relation_size('public.profiles')) AS table_size,
  pg_size_pretty(pg_indexes_size('public.profiles')) AS indexes_size,
  (SELECT COUNT(*) FROM public.profiles) AS row_count;
```
[
  {
    "total_size": "208 kB",
    "table_size": "8192 bytes",
    "indexes_size": "160 kB",
    "row_count": 5
  }
]

---

## Execution Instructions

### Step 1: Run Diagnostic Queries First
1. Open Supabase SQL Editor
2. Run the diagnostic queries for each table to see:
   - What indexes already exist
   - What constraints are in place
   - Current table sizes and row counts
3. Paste the results back here

### Step 2: Run EXPLAIN ANALYZE Queries
1. Replace `<test_user_id>`, `cs_test_...`, `pi_test_...` with actual test values from your database
2. Run the EXPLAIN ANALYZE queries
3. Paste the output back here (especially look for "Seq Scan" vs "Index Scan")

### Step 3: Create Indexes (After Review)
1. Review the diagnostic results
2. Only create indexes that don't already exist
3. Run the CREATE INDEX statements one at a time
4. Verify each index was created successfully

### Step 4: Re-run EXPLAIN ANALYZE
1. After creating indexes, re-run the EXPLAIN ANALYZE queries
2. Compare before/after to see performance improvements
3. Verify queries are using indexes (should see "Index Scan" instead of "Seq Scan")

---

## Notes

- **Index Creation**: Use `IF NOT EXISTS` to avoid errors if indexes already exist
- **Unique Indexes**: If a column already has a unique constraint, a unique index may already exist
- **Composite Indexes**: Only create if you have queries that filter by multiple columns
- **Index Maintenance**: Indexes add write overhead, but significantly improve read performance on hot paths
- **Testing**: Always test index creation on a development/staging environment first

