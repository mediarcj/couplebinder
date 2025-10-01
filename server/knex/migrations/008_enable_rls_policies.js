// File: server/knex/migrations/008_enable_rls_policies.js
// Description: Enable Row Level Security policies for user-owned tables
// Purpose: Ensures users can only access their own data at the database level
// Notes: Provides defense-in-depth security alongside middleware checks

/**
 * WHAT:
 * Enable Supabase Row Level Security (RLS) on user-owned tables.
 * 
 * WHY:
 * RLS provides database-level security as a second defense layer.
 * Even if middleware is bypassed, database blocks unauthorized access.
 * 
 * HOW:
 * For each user-owned table (with user_id column):
 * 1. Enable RLS on the table
 * 2. Add policy: users can only SELECT their own rows
 * 3. Add policy: users can only INSERT their own rows
 * 4. Add policy: users can only UPDATE their own rows
 * 5. Add policy: users can only DELETE their own rows
 */

exports.up = async function(knex) {
  // NOTE: Current tables (users, submissions, quotas, artifacts) do not have
  // user_id foreign keys yet. This migration prepares RLS for when they are added.
  // 
  // When adding user_id columns to tables in the future, uncomment and modify
  // the relevant RLS policies below.
  
  // Example: Enable RLS on submissions table (when user_id column exists)
  // await knex.raw(`
  //   -- Enable Row Level Security
  //   ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
  //   
  //   -- Policy: Users can SELECT only their own submissions
  //   CREATE POLICY submissions_select_own ON submissions
  //     FOR SELECT
  //     USING (user_id = auth.uid());
  //   
  //   -- Policy: Users can INSERT only with their own user_id
  //   CREATE POLICY submissions_insert_own ON submissions
  //     FOR INSERT
  //     WITH CHECK (user_id = auth.uid());
  //   
  //   -- Policy: Users can UPDATE only their own submissions
  //   CREATE POLICY submissions_update_own ON submissions
  //     FOR UPDATE
  //     USING (user_id = auth.uid())
  //     WITH CHECK (user_id = auth.uid());
  //   
  //   -- Policy: Users can DELETE only their own submissions
  //   CREATE POLICY submissions_delete_own ON submissions
  //     FOR DELETE
  //     USING (user_id = auth.uid());
  // `);
  
  // Example: Enable RLS on quotas table (when user_id column exists)
  // await knex.raw(`
  //   ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
  //   
  //   CREATE POLICY quotas_select_own ON quotas
  //     FOR SELECT
  //     USING (user_id = auth.uid()::text);
  //   
  //   CREATE POLICY quotas_insert_own ON quotas
  //     FOR INSERT
  //     WITH CHECK (user_id = auth.uid()::text);
  //   
  //   CREATE POLICY quotas_update_own ON quotas
  //     FOR UPDATE
  //     USING (user_id = auth.uid()::text)
  //     WITH CHECK (user_id = auth.uid()::text);
  // `);
  
  // Example: Enable RLS on artifacts table (when user_id column exists)
  // await knex.raw(`
  //   ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
  //   
  //   CREATE POLICY artifacts_select_own ON artifacts
  //     FOR SELECT
  //     USING (metadata->>'user_id' = auth.uid()::text);
  //   
  //   CREATE POLICY artifacts_insert_own ON artifacts
  //     FOR INSERT
  //     WITH CHECK (metadata->>'user_id' = auth.uid()::text);
  //   
  //   CREATE POLICY artifacts_update_own ON artifacts
  //     FOR UPDATE
  //     USING (metadata->>'user_id' = auth.uid()::text)
  //     WITH CHECK (metadata->>'user_id' = auth.uid()::text);
  //   
  //   CREATE POLICY artifacts_delete_own ON artifacts
  //     FOR DELETE
  //     USING (metadata->>'user_id' = auth.uid()::text);
  // `);
  
  // CURRENT STATUS: No-op migration
  // This migration is a placeholder for future RLS implementation
  // when user_id columns are added to tables
  console.log('RLS migration placeholder created - uncomment policies when user_id columns exist');
  return Promise.resolve();
};

exports.down = async function(knex) {
  // Disable RLS and drop policies (reverse of up migration)
  
  // Example: Disable RLS on submissions
  // await knex.raw(`
  //   DROP POLICY IF EXISTS submissions_select_own ON submissions;
  //   DROP POLICY IF EXISTS submissions_insert_own ON submissions;
  //   DROP POLICY IF EXISTS submissions_update_own ON submissions;
  //   DROP POLICY IF EXISTS submissions_delete_own ON submissions;
  //   ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;
  // `);
  
  // Example: Disable RLS on quotas
  // await knex.raw(`
  //   DROP POLICY IF EXISTS quotas_select_own ON quotas;
  //   DROP POLICY IF EXISTS quotas_insert_own ON quotas;
  //   DROP POLICY IF EXISTS quotas_update_own ON quotas;
  //   ALTER TABLE quotas DISABLE ROW LEVEL SECURITY;
  // `);
  
  // Example: Disable RLS on artifacts
  // await knex.raw(`
  //   DROP POLICY IF EXISTS artifacts_select_own ON artifacts;
  //   DROP POLICY IF EXISTS artifacts_insert_own ON artifacts;
  //   DROP POLICY IF EXISTS artifacts_update_own ON artifacts;
  //   DROP POLICY IF EXISTS artifacts_delete_own ON artifacts;
  //   ALTER TABLE artifacts DISABLE ROW LEVEL SECURITY;
  // `);
  
  console.log('RLS migration rollback placeholder - no policies to drop');
  return Promise.resolve();
};

