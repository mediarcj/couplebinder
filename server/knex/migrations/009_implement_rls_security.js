// File: server/knex/migrations/009_implement_rls_security.js
// Description: Implement Supabase Row Level Security (RLS) for user data isolation
// Purpose: Enable database-level security policies to prevent cross-user data access
// Notes: This provides defense-in-depth security at the database level

/**
 * WHAT:
 * We implement Row Level Security (RLS) policies to ensure users can only access their own data.
 *
 * WHY:
 * This provides defense-in-depth security. Even if application-level checks fail,
 * the database will still block unauthorized access.
 *
 * HOW:
 * We add user_id columns to user-owned tables and create RLS policies that use auth.uid().
 */

exports.up = function(knex) {
  return knex.schema.raw(`
    -- Enable UUID extension if not already enabled
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Add user_id columns to tables that need ownership
    -- submissions table
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    
    -- quotas table (already has user_id but ensure it's UUID)
    ALTER TABLE quotas ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
    ALTER TABLE quotas ADD CONSTRAINT quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    
    -- artifacts table
    ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    
    -- Enable Row Level Security on all user-owned tables
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
    
    -- Create RLS policies for users table
    DROP POLICY IF EXISTS "Users can view their own profile" ON users;
    CREATE POLICY "Users can view their own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);
    
    DROP POLICY IF EXISTS "Users can update their own profile" ON users;
    CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);
    
    -- Create RLS policies for submissions table
    DROP POLICY IF EXISTS "Users can view their own submissions" ON submissions;
    CREATE POLICY "Users can view their own submissions"
    ON submissions FOR SELECT
    USING (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can create their own submissions" ON submissions;
    CREATE POLICY "Users can create their own submissions"
    ON submissions FOR INSERT
    WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can update their own submissions" ON submissions;
    CREATE POLICY "Users can update their own submissions"
    ON submissions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can delete their own submissions" ON submissions;
    CREATE POLICY "Users can delete their own submissions"
    ON submissions FOR DELETE
    USING (auth.uid() = user_id);
    
    -- Create RLS policies for quotas table
    DROP POLICY IF EXISTS "Users can view their own quotas" ON quotas;
    CREATE POLICY "Users can view their own quotas"
    ON quotas FOR SELECT
    USING (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can create their own quotas" ON quotas;
    CREATE POLICY "Users can create their own quotas"
    ON quotas FOR INSERT
    WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can update their own quotas" ON quotas;
    CREATE POLICY "Users can update their own quotas"
    ON quotas FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can delete their own quotas" ON quotas;
    CREATE POLICY "Users can delete their own quotas"
    ON quotas FOR DELETE
    USING (auth.uid() = user_id);
    
    -- Create RLS policies for artifacts table
    DROP POLICY IF EXISTS "Users can view their own artifacts" ON artifacts;
    CREATE POLICY "Users can view their own artifacts"
    ON artifacts FOR SELECT
    USING (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can create their own artifacts" ON artifacts;
    CREATE POLICY "Users can create their own artifacts"
    ON artifacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can update their own artifacts" ON artifacts;
    CREATE POLICY "Users can update their own artifacts"
    ON artifacts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
    
    DROP POLICY IF EXISTS "Users can delete their own artifacts" ON artifacts;
    CREATE POLICY "Users can delete their own artifacts"
    ON artifacts FOR DELETE
    USING (auth.uid() = user_id);
    
    -- Revoke unnecessary permissions from anon role
    REVOKE ALL ON users FROM anon;
    REVOKE ALL ON submissions FROM anon;
    REVOKE ALL ON quotas FROM anon;
    REVOKE ALL ON artifacts FROM anon;
    
    -- Grant appropriate permissions to authenticated role
    GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON submissions TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON quotas TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON artifacts TO authenticated;
    
    -- Create function to automatically set user_id on insert
    CREATE OR REPLACE FUNCTION public.set_user_id()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      IF NEW.user_id IS NULL THEN
        NEW.user_id := auth.uid();
      END IF;
      RETURN NEW;
    END;
    $$;
    
    -- Create triggers to automatically set user_id
    DROP TRIGGER IF EXISTS trg_set_user_id_submissions ON submissions;
    CREATE TRIGGER trg_set_user_id_submissions
    BEFORE INSERT ON submissions
    FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
    
    DROP TRIGGER IF EXISTS trg_set_user_id_quotas ON quotas;
    CREATE TRIGGER trg_set_user_id_quotas
    BEFORE INSERT ON quotas
    FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
    
    DROP TRIGGER IF EXISTS trg_set_user_id_artifacts ON artifacts;
    CREATE TRIGGER trg_set_user_id_artifacts
    BEFORE INSERT ON artifacts
    FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
  `);
};

exports.down = function(knex) {
  return knex.schema.raw(`
    -- Drop triggers
    DROP TRIGGER IF EXISTS trg_set_user_id_submissions ON submissions;
    DROP TRIGGER IF EXISTS trg_set_user_id_quotas ON quotas;
    DROP TRIGGER IF EXISTS trg_set_user_id_artifacts ON artifacts;
    
    -- Drop function
    DROP FUNCTION IF EXISTS public.set_user_id();
    
    -- Drop all RLS policies
    DROP POLICY IF EXISTS "Users can view their own profile" ON users;
    DROP POLICY IF EXISTS "Users can update their own profile" ON users;
    DROP POLICY IF EXISTS "Users can view their own submissions" ON submissions;
    DROP POLICY IF EXISTS "Users can create their own submissions" ON submissions;
    DROP POLICY IF EXISTS "Users can update their own submissions" ON submissions;
    DROP POLICY IF EXISTS "Users can delete their own submissions" ON submissions;
    DROP POLICY IF EXISTS "Users can view their own quotas" ON quotas;
    DROP POLICY IF EXISTS "Users can create their own quotas" ON quotas;
    DROP POLICY IF EXISTS "Users can update their own quotas" ON quotas;
    DROP POLICY IF EXISTS "Users can delete their own quotas" ON quotas;
    DROP POLICY IF EXISTS "Users can view their own artifacts" ON artifacts;
    DROP POLICY IF EXISTS "Users can create their own artifacts" ON artifacts;
    DROP POLICY IF EXISTS "Users can update their own artifacts" ON artifacts;
    DROP POLICY IF EXISTS "Users can delete their own artifacts" ON artifacts;
    
    -- Disable RLS
    ALTER TABLE users DISABLE ROW LEVEL SECURITY;
    ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;
    ALTER TABLE quotas DISABLE ROW LEVEL SECURITY;
    ALTER TABLE artifacts DISABLE ROW LEVEL SECURITY;
    
    -- Remove user_id columns
    ALTER TABLE submissions DROP COLUMN IF EXISTS user_id;
    ALTER TABLE artifacts DROP COLUMN IF EXISTS user_id;
    
    -- Restore quotas user_id to text type
    ALTER TABLE quotas DROP CONSTRAINT IF EXISTS quotas_user_id_fkey;
    ALTER TABLE quotas ALTER COLUMN user_id TYPE TEXT;
  `);
};
