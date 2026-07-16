#!/usr/bin/env node
// File: scripts/update-supabase-client.js
// Description: Update self-hosted Supabase client from node_modules
// Purpose: Maintain controlled, versioned Supabase client without CDN dependency
// Notes: Run after npm install or when updating @supabase/supabase-js

/**
 * WHAT:
 * Copies the UMD Supabase bundle into /server/public/js as a self-hosted asset.
 *
 * WHY:
 * - Eliminates CDN dependency
 * - Allows strict CSP + SRI usage
 * - Keeps frontend auth client delivery under our control
 *
 * HOW:
 * - Resolve @supabase/supabase-js from either repo root or /server
 * - Copy dist/umd/supabase.js -> server/public/js/supabase-client.js
 * - Prepend a metadata header
 * - Compute sha384 integrity for SRI
 * - Write /docs/supabase-client-integrity.md (optional, but recommended)
 */

'use strict';

// I am loading `fs` into `fs` so this file can reuse that dependency below.
const fs = require('fs');
// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');
// I am loading `crypto` into `crypto` so this file can reuse that dependency below.
const crypto = require('crypto');

// I am saving `PROJECT_ROOT` here so the nearby steps can reuse the same value without rebuilding it each time.
const PROJECT_ROOT = path.resolve(__dirname, '..');

// I am saving `TARGET_FILE` here so the nearby steps can reuse the same value without rebuilding it each time.
const TARGET_FILE = path.join(PROJECT_ROOT, 'server', 'public', 'js', 'supabase-client.js');
// I am saving `DOC_FILE` here so the nearby steps can reuse the same value without rebuilding it each time.
const DOC_FILE = path.join(PROJECT_ROOT, 'docs', 'supabase-client-integrity.md');

// I am keeping `fileExists` as a named helper so the surrounding workflow can call this step when it needs it.
function fileExists(p) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    fs.accessSync(p, fs.constants.F_OK);
    // This return sends the completed value or response back to the code that called this function.
    return true;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `ensureDirExists` as a named helper so the surrounding workflow can call this step when it needs it.
function ensureDirExists(filePath) {
  // I am saving `dir` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dir = path.dirname(filePath);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  fs.mkdirSync(dir, { recursive: true });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Try to resolve a module file from common install locations:
 * - repo root node_modules
 * - server/node_modules (monorepo-ish layouts)
 */
function resolveFromProject(moduleSubPath) {
  // I am saving `candidates` here so the nearby steps can reuse the same value without rebuilding it each time.
  const candidates = [
    // I am calling this helper here so the current workflow performs this step before it moves on.
    path.join(PROJECT_ROOT, 'node_modules', moduleSubPath),
    // I am calling this helper here so the current workflow performs this step before it moves on.
    path.join(PROJECT_ROOT, 'server', 'node_modules', moduleSubPath),
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const p of candidates) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (fileExists(p)) return p;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Fallback: try Node's resolver with explicit paths
  try {
    // This return sends the completed value or response back to the code that called this function.
    return require.resolve(moduleSubPath, { paths: [PROJECT_ROOT, path.join(PROJECT_ROOT, 'server')] });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `readJson` as a named helper so the surrounding workflow can call this step when it needs it.
function readJson(p) {
  // This return sends the completed value or response back to the code that called this function.
  return JSON.parse(fs.readFileSync(p, 'utf8'));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getSupabaseVersion` as a named helper so the surrounding workflow can call this step when it needs it.
function getSupabaseVersion() {
  // I am saving `pkgPath` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pkgPath =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    resolveFromProject('@supabase/supabase-js/package.json') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    resolveFromProject(path.join('@supabase', 'supabase-js', 'package.json'));

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!pkgPath) return 'unknown';

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `pkg` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pkg = readJson(pkgPath);
    // This return sends the completed value or response back to the code that called this function.
    return pkg.version || 'unknown';
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {
    // This return sends the completed value or response back to the code that called this function.
    return 'unknown';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `computeSriSha384` as a named helper so the surrounding workflow can call this step when it needs it.
function computeSriSha384(content) {
  // I am saving `hash` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hash = crypto.createHash('sha384').update(content, 'utf8').digest('base64');
  // This return sends the completed value or response back to the code that called this function.
  return `sha384-${hash}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `buildHeaderComment` as a named helper so the surrounding workflow can call this step when it needs it.
function buildHeaderComment({ version, integrity, generatedAtIso }) {
  // This return sends the completed value or response back to the code that called this function.
  return `// File: supabase-client.js (self-hosted)
// Description: Supabase client library for frontend authentication
// Purpose: Self-hosted to eliminate CDN dependency and ensure controlled delivery
// Version: ${version}
// Integrity: ${integrity}
// Generated: ${generatedAtIso}
// Source: @supabase/supabase-js/dist/umd/supabase.js

`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `writeIntegrityDoc` as a named helper so the surrounding workflow can call this step when it needs it.
function writeIntegrityDoc({ version, integrity }) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  ensureDirExists(DOC_FILE);

  // I am saving `doc` here so the nearby steps can reuse the same value without rebuilding it each time.
  const doc = `# Supabase Client Integrity

This document is generated by \`scripts/update-supabase-client.js\`.

## Current Asset
- File: \`/server/public/js/supabase-client.js\`
- Public path: \`/js/supabase-client.js\`
- Version: \`${version}\`
- Integrity (SRI): \`${integrity}\`

## HTML usage (recommended)

\`\`\`html
<script
  src="/js/supabase-client.js"
  integrity="${integrity}"
  crossorigin="anonymous"
></script>
\`\`\`

## Notes
- Any change to \`supabase-client.js\` changes the integrity hash.
- Do not hand-edit the generated file. Re-run the update script instead.
`;

  // I am calling this helper here so the current workflow performs this step before it moves on.
  fs.writeFileSync(DOC_FILE, doc, 'utf8');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `updateSupabaseClient` as a named helper so the surrounding workflow can call this step when it needs it.
function updateSupabaseClient() {
  // Generate the served bundle and its integrity evidence from the same source bytes. This
  // keeps the checked-in SRI value from drifting away from the browser asset.
  const umdPath =
    // I am calling this helper here so the current workflow performs this step before it moves on.
    resolveFromProject(path.join('@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js')) ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    resolveFromProject('@supabase/supabase-js/dist/umd/supabase.js');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!umdPath || !fileExists(umdPath)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Supabase UMD build not found.');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Expected: @supabase/supabase-js/dist/umd/supabase.js');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('Fix: run npm install, and confirm where node_modules is located (repo root or /server).');
    // I am keeping this line here because the surrounding update-supabase-client.js workflow expects this value or operation before it continues.
    process.exitCode = 1;
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `version` here so the nearby steps can reuse the same value without rebuilding it each time.
  const version = getSupabaseVersion();

  // I am saving `sourceContent` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sourceContent = fs.readFileSync(umdPath, 'utf8');
  // I am saving `integrity` here so the nearby steps can reuse the same value without rebuilding it each time.
  const integrity = computeSriSha384(sourceContent);

  // I am saving `generatedAtIso` here so the nearby steps can reuse the same value without rebuilding it each time.
  const generatedAtIso = new Date().toISOString();
  // I am saving `header` here so the nearby steps can reuse the same value without rebuilding it each time.
  const header = buildHeaderComment({ version, integrity, generatedAtIso });
  // I am saving `finalContent` here so the nearby steps can reuse the same value without rebuilding it each time.
  const finalContent = header + sourceContent;

  // I am calling this helper here so the current workflow performs this step before it moves on.
  ensureDirExists(TARGET_FILE);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  fs.writeFileSync(TARGET_FILE, finalContent, 'utf8');

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('Supabase client updated successfully');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Source: ${umdPath}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Target: ${TARGET_FILE}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Version: ${version}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Integrity: ${integrity}`);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Size (KB): ${Math.round(finalContent.length / 1024)}`);

  // Optional doc output (safe, deterministic)
  writeIntegrityDoc({ version, integrity });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(`Doc: ${DOC_FILE}`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am calling this helper here so the current workflow performs this step before it moves on.
updateSupabaseClient();