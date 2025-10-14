#!/usr/bin/env node
// File: scripts/update-supabase-client.js
// Description: Update self-hosted Supabase client from node_modules
// Purpose: Maintain controlled, versioned Supabase client without CDN dependency
// Notes: Run after npm install or when updating @supabase/supabase-js

/**
 * WHAT:
 * Script to copy and update the self-hosted Supabase client.
 *
 * WHY:
 * Ensures we have the latest Supabase client without CDN dependency.
 * Provides controlled asset delivery and eliminates external dependencies.
 *
 * HOW:
 * Copy the UMD build from node_modules to public/js directory.
 * Add integrity hash for Subresource Integrity (SRI) protection.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sourceFile = path.join(__dirname, '../server/node_modules/@supabase/supabase-js/dist/umd/supabase.js');
const targetFile = path.join(__dirname, '../server/public/js/supabase-client.js');

function updateSupabaseClient() {
  try {
    // Check if source file exists
    if (!fs.existsSync(sourceFile)) {
      console.error('❌ Supabase UMD build not found. Run: npm install @supabase/supabase-js');
      process.exit(1);
    }

    // Read source file
    const sourceContent = fs.readFileSync(sourceFile, 'utf8');
    
    // Generate integrity hash
    const hash = crypto.createHash('sha384').update(sourceContent).digest('base64');
    const integrity = `sha384-${hash}`;

    // Add header comment with integrity info
    const headerComment = `// File: supabase-client.js (self-hosted)
// Description: Supabase client library for frontend authentication
// Purpose: Self-hosted to eliminate CDN dependency and ensure controlled delivery
// Version: ${getSupabaseVersion()}
// Integrity: ${integrity}
// Generated: ${new Date().toISOString()}
// Source: @supabase/supabase-js/dist/umd/supabase.js

`;

    const finalContent = headerComment + sourceContent;

    // Write to target file
    fs.writeFileSync(targetFile, finalContent, 'utf8');

    console.log('✅ Supabase client updated successfully');
    console.log(`📁 Target: ${targetFile}`);
    console.log(`🔒 Integrity: ${integrity}`);
    console.log(`📦 Version: ${getSupabaseVersion()}`);
    console.log(`📊 Size: ${Math.round(finalContent.length / 1024)}KB`);

    // Update CSP integrity hash in documentation
    updateIntegrityDocumentation(integrity);

  } catch (error) {
    console.error('❌ Failed to update Supabase client:', error.message);
    process.exit(1);
  }
}

function getSupabaseVersion() {
  try {
    const packageJsonPath = path.join(__dirname, '../server/node_modules/@supabase/supabase-js/package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function updateIntegrityDocumentation(integrity) {
  try {
    const docFile = path.join(__dirname, '../docs/supabase-client-integrity.md');
    const docContent = `# Supabase Client Integrity

## Current Version
- **File**: \`/js/supabase-client.js\`
- **Version**: ${getSupabaseVersion()}
- **Integrity**: \`${integrity}\`
- **Updated**: ${new Date().toISOString()}

## Usage in Templates

For additional security, you can add the integrity attribute:

\`\`\`html
<script src="/js/supabase-client.js" 
        integrity="${integrity}"
        crossorigin="anonymous"
        nonce="<%= page.nonce %>"></script>
\`\`\`

## Update Process

1. Update @supabase/supabase-js: \`npm update @supabase/supabase-js\`
2. Run this script: \`node scripts/update-supabase-client.js\`
3. Test the application to ensure compatibility
4. Commit the updated client file

## Security Benefits

- ✅ No external CDN dependency
- ✅ Controlled asset delivery
- ✅ Subresource Integrity protection
- ✅ Version pinning and tracking
- ✅ Reduced attack surface
`;

    fs.writeFileSync(docFile, docContent, 'utf8');
    console.log(`📚 Documentation updated: ${docFile}`);
  } catch (error) {
    console.warn('⚠️ Could not update documentation:', error.message);
  }
}

// Run the update
if (require.main === module) {
  updateSupabaseClient();
}

module.exports = { updateSupabaseClient };
