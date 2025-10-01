#!/usr/bin/env node

// File: scripts/run-rls-migration.js
// Description: Run RLS migration using knexClient
// Purpose: Implement Row Level Security policies in Supabase
// Notes: Uses existing database connection from knexClient

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { db } = require('../server/db/connection');

/**
 * WHAT:
 * We run the RLS migration directly using the existing database connection.
 *
 * WHY:
 * The knexfile configuration isn't working with Supabase, so we use the working connection.
 *
 * HOW:
 * We execute the migration SQL directly through the existing knexClient connection.
 */

async function runRLSMigration() {
  try {
    console.log('Starting RLS migration...');
    
    // Enable UUID extension if not already enabled
    await db.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✓ UUID extension enabled');
    
    // Add user_id columns to tables that need ownership
    await db.raw('ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE');
    console.log('✓ Added user_id to submissions table');
    
    // Update quotas table user_id to UUID
    await db.raw('ALTER TABLE quotas ALTER COLUMN user_id TYPE UUID USING user_id::UUID');
    await db.raw('ALTER TABLE quotas ADD CONSTRAINT quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE');
    console.log('✓ Updated quotas user_id to UUID');
    
    // Add user_id to artifacts table
    await db.raw('ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE');
    console.log('✓ Added user_id to artifacts table');
    
    // Enable Row Level Security on all user-owned tables
    await db.raw('ALTER TABLE users ENABLE ROW LEVEL SECURITY');
    await db.raw('ALTER TABLE submissions ENABLE ROW LEVEL SECURITY');
    await db.raw('ALTER TABLE quotas ENABLE ROW LEVEL SECURITY');
    await db.raw('ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY');
    console.log('✓ Enabled RLS on all tables');
    
    // Create RLS policies for users table
    await db.raw(`
      DROP POLICY IF EXISTS "Users can view their own profile" ON users;
      CREATE POLICY "Users can view their own profile"
      ON users FOR SELECT
      USING (auth.uid() = id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can update their own profile" ON users;
      CREATE POLICY "Users can update their own profile"
      ON users FOR UPDATE
      USING (auth.uid() = id);
    `);
    console.log('✓ Created RLS policies for users table');
    
    // Create RLS policies for submissions table
    await db.raw(`
      DROP POLICY IF EXISTS "Users can view their own submissions" ON submissions;
      CREATE POLICY "Users can view their own submissions"
      ON submissions FOR SELECT
      USING (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can create their own submissions" ON submissions;
      CREATE POLICY "Users can create their own submissions"
      ON submissions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can update their own submissions" ON submissions;
      CREATE POLICY "Users can update their own submissions"
      ON submissions FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can delete their own submissions" ON submissions;
      CREATE POLICY "Users can delete their own submissions"
      ON submissions FOR DELETE
      USING (auth.uid() = user_id);
    `);
    console.log('✓ Created RLS policies for submissions table');
    
    // Create RLS policies for quotas table
    await db.raw(`
      DROP POLICY IF EXISTS "Users can view their own quotas" ON quotas;
      CREATE POLICY "Users can view their own quotas"
      ON quotas FOR SELECT
      USING (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can create their own quotas" ON quotas;
      CREATE POLICY "Users can create their own quotas"
      ON quotas FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can update their own quotas" ON quotas;
      CREATE POLICY "Users can update their own quotas"
      ON quotas FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can delete their own quotas" ON quotas;
      CREATE POLICY "Users can delete their own quotas"
      ON quotas FOR DELETE
      USING (auth.uid() = user_id);
    `);
    console.log('✓ Created RLS policies for quotas table');
    
    // Create RLS policies for artifacts table
    await db.raw(`
      DROP POLICY IF EXISTS "Users can view their own artifacts" ON artifacts;
      CREATE POLICY "Users can view their own artifacts"
      ON artifacts FOR SELECT
      USING (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can create their own artifacts" ON artifacts;
      CREATE POLICY "Users can create their own artifacts"
      ON artifacts FOR INSERT
      WITH CHECK (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can update their own artifacts" ON artifacts;
      CREATE POLICY "Users can update their own artifacts"
      ON artifacts FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    `);
    
    await db.raw(`
      DROP POLICY IF EXISTS "Users can delete their own artifacts" ON artifacts;
      CREATE POLICY "Users can delete their own artifacts"
      ON artifacts FOR DELETE
      USING (auth.uid() = user_id);
    `);
    console.log('✓ Created RLS policies for artifacts table');
    
    // Revoke unnecessary permissions from anon role
    await db.raw('REVOKE ALL ON users FROM anon');
    await db.raw('REVOKE ALL ON submissions FROM anon');
    await db.raw('REVOKE ALL ON quotas FROM anon');
    await db.raw('REVOKE ALL ON artifacts FROM anon');
    console.log('✓ Revoked permissions from anon role');
    
    // Grant appropriate permissions to authenticated role
    await db.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated');
    await db.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON submissions TO authenticated');
    await db.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON quotas TO authenticated');
    await db.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON artifacts TO authenticated');
    console.log('✓ Granted permissions to authenticated role');
    
    // Create function to automatically set user_id on insert
    await db.raw(`
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
    `);
    console.log('✓ Created set_user_id function');
    
    // Create triggers to automatically set user_id
    await db.raw(`
      DROP TRIGGER IF EXISTS trg_set_user_id_submissions ON submissions;
      CREATE TRIGGER trg_set_user_id_submissions
      BEFORE INSERT ON submissions
      FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
    `);
    
    await db.raw(`
      DROP TRIGGER IF EXISTS trg_set_user_id_quotas ON quotas;
      CREATE TRIGGER trg_set_user_id_quotas
      BEFORE INSERT ON quotas
      FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
    `);
    
    await db.raw(`
      DROP TRIGGER IF EXISTS trg_set_user_id_artifacts ON artifacts;
      CREATE TRIGGER trg_set_user_id_artifacts
      BEFORE INSERT ON artifacts
      FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
    `);
    console.log('✓ Created triggers for automatic user_id setting');
    
    console.log('🎉 RLS migration completed successfully!');
    console.log('All tables now have Row Level Security enabled with user isolation policies.');
    
  } catch (error) {
    console.error('❌ RLS migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the migration
if (require.main === module) {
  runRLSMigration();
}

module.exports = { runRLSMigration };
