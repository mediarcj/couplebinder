# Database Usage Map - Payment Stack & Profile Services

## Overview
This document maps all Supabase database calls in the payment stack and profile services to identify hot paths, N+1 patterns, and optimization opportunities.

## Hot Path Operations (Frequent User-Facing)

### 1. Checkout Flow (`server/services/billingService.js`)
- **Function**: `getOrCreateStripeCustomer(userId, email)`
- **Table**: `billing_customers`
- **Operation**: `select('*')` then `upsert`
- **Frequency**: Every checkout session creation
- **Query Pattern**: `.eq('user_id', userId).maybeSingle()`
- **Issue**: Uses `select('*')` but only needs `stripe_customer_id_live` or `stripe_customer_id_test` column

### 2. Payment Persistence (`server/services/billingService.js`)
- **Function**: `upsertPaymentFromSession(session, statusOverride)`
- **Table**: `payments`
- **Operation**: `upsert` with conflict on `stripe_checkout_session_id`
- **Frequency**: Every successful payment (webhook + fallback)
- **Query Pattern**: `.upsert(row, { onConflict: 'stripe_checkout_session_id' })`
- **Issue**: None - upsert is efficient

### 3. Webhook Payment Persistence (`server/routes/stripeWebhook.js`)
- **Function**: `checkout.session.completed` handler
- **Table**: `payments`
- **Operation**: `upsert` with conflict on `stripe_checkout_session_id`
- **Frequency**: Every Stripe webhook delivery
- **Query Pattern**: `.upsert(row, { onConflict: 'stripe_checkout_session_id' })`
- **Issue**: None - upsert is efficient

### 4. Profile Fetching (`server/services/profileService.js`)
- **Function**: `getProfileByUserId(userId, userAccessToken)`
- **Table**: `v_profiles_full` (view)
- **Operation**: `select('*')` with `.eq('user_id', userId).single()`
- **Frequency**: Dashboard load, profile page load
- **Query Pattern**: `.eq('user_id', userId).single()`
- **Issue**: Uses `select('*')` - could optimize to specific columns if view is large

### 5. Profile Update (`server/services/profileSyncService.js`)
- **Function**: `updateProfileTransactional(userId, patch, opts)`
- **Table**: `profiles`
- **Operation**: `select('*')` then `update` then `select('*')`
- **Frequency**: Every profile edit
- **Query Pattern**: 
  - `.eq('user_id', userId).select('*').single()` (fetch current)
  - `.eq('user_id', userId).update(...).select('*').single()` (update + return)
- **Issue**: Uses `select('*')` twice - could optimize to only needed columns

## Cold Path Operations (Admin/Rare)

### 1. Receipt Archival (`server/services/receiptArchive.js`)
- **Function**: `archiveReceiptSnapshot({ userId, receipt })`
- **Table**: `payments` or `payment_receipts`
- **Operation**: `update` or `upsert`
- **Frequency**: After receipt view (optional feature)
- **Query Pattern**: `.eq('stripe_checkout_session_id', ...).update(...)`
- **Issue**: None - infrequent operation

### 2. Refund Updates (`server/services/billingService.js`)
- **Function**: `upsertRefundStatus(charge, isFullRefund)`
- **Table**: `payments`
- **Operation**: `update` with `.eq('stripe_payment_intent_id', ...)`
- **Frequency**: Only when refunds occur (rare)
- **Query Pattern**: `.eq('stripe_payment_intent_id', paymentIntentId).update(...)`
- **Issue**: None - infrequent operation

### 3. Outbox Service (`server/services/outboxService.js`)
- **Function**: Various outbox operations
- **Table**: `outbox_events`
- **Operation**: `insert`, `select`, `update`
- **Frequency**: Background processing (cold)
- **Issue**: None - background service

## N+1 Query Patterns

### None Found
- No loops that call Supabase inside iteration
- All queries are single operations or batch upserts

## Optimization Opportunities

### 1. `billingService.getOrCreateStripeCustomer` - HIGH PRIORITY
- **Current**: `select('*')` from `billing_customers`
- **Issue**: Only needs one column (`stripe_customer_id_live` or `stripe_customer_id_test`)
- **Impact**: Hot path - called on every checkout
- **Fix**: Replace `select('*')` with explicit column list

### 2. `profileService.getProfileByUserId` - MEDIUM PRIORITY
- **Current**: `select('*')` from `v_profiles_full`
- **Issue**: View may return many columns, only some needed
- **Impact**: Hot path - called on dashboard load
- **Fix**: Replace `select('*')` with explicit column list matching view model

### 3. `profileSyncService.updateProfileTransactional` - MEDIUM PRIORITY
- **Current**: `select('*')` twice (before and after update)
- **Issue**: May fetch unnecessary columns
- **Impact**: Hot path - called on profile edit
- **Fix**: Replace `select('*')` with explicit column lists

## Tables Used

### `payments`
- **Hot Path Filters**: 
  - `stripe_checkout_session_id` (unique, used in upsert conflict)
  - `stripe_payment_intent_id` (used in refund updates)
  - `user_id` (likely used in queries, not seen in current code but probable)
- **Index Candidates**: 
  - Unique index on `stripe_checkout_session_id` (already used as conflict target)
  - Index on `stripe_payment_intent_id` (for refund lookups)
  - Index on `user_id` (if user payment history queries exist)

### `billing_customers`
- **Hot Path Filters**: 
  - `user_id` (unique, used in select and upsert conflict)
- **Index Candidates**: 
  - Unique index on `user_id` (already used as conflict target)

### `profiles`
- **Hot Path Filters**: 
  - `user_id` (used in all profile queries)
- **Index Candidates**: 
  - Unique index on `user_id` (likely already exists as primary key)

### `v_profiles_full`
- **View**: Read-only view, indexes on underlying tables apply
- **Hot Path Filters**: 
  - `user_id` (used in all profile fetches)

## Summary

**Hot Path Tables**:
1. `billing_customers` - checkout flow
2. `payments` - payment persistence (webhook + fallback)
3. `profiles` / `v_profiles_full` - dashboard and profile pages

**Clear Optimization Targets**:
1. `billingService.getOrCreateStripeCustomer` - replace `select('*')` with specific columns
2. `profileService.getProfileByUserId` - replace `select('*')` with specific columns (if view is large)
3. `profileSyncService.updateProfileTransactional` - replace `select('*')` with specific columns

**No N+1 Patterns Found**: All queries are single operations or batch upserts.

