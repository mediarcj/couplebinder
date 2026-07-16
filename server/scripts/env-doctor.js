#!/usr/bin/env node
// I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
'use strict';

// File: server/scripts/env-doctor.js
// Description: Env schema auditor (required/optional + conditional checks)
// Notes:
// - Compares server/config/env.schema.yml with:
//     - .env.development.local
//     - .env.production.full
// - Reports:
//     - Missing REQUIRED keys
//     - Missing OPTIONAL keys (informational)
//     - Omitted (=) REQUIRED keys (present but empty)
//     - Omitted (=) OPTIONAL keys (present but empty)
//     - Extra keys in env files (not in schema)
// - Applies conditional rules that match server/config/index.js validation posture:
//     - DB_PROVIDER=postgres => SUPABASE_DB_URL required
//     - AUTH_SET_COOKIE_ENFORCE_TURNSTILE=true => TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY required
//     - STORAGE_PROVIDER=s3 => STORAGE_S3_BUCKET required; (STORAGE_S3_REGION or AWS_REGION) required
//     - If Stripe prices are configured for the active mode => PUBLIC_ORIGIN required
//
// Evidence files written to repo root:
//   - env-doctor-report-YYYYMMDD-HHmmss.json
//   - env-doctor-report-YYYYMMDD-HHmmss.csv

const fs = require('fs');
// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');
// I am loading `js-yaml` into `yaml` so this file can reuse that dependency below.
const yaml = require('js-yaml');

// __dirname = server/scripts
// ROOT = server/
const ROOT = path.join(__dirname, '..');
// REPO_ROOT = project root (one level above server/)
const REPO_ROOT = path.join(ROOT, '..');

// Paths
const SCHEMA_PATH = path.join(ROOT, 'config', 'env.schema.yml');
// I am saving `DEV_ENV_PATH` here so the nearby steps can reuse the same value without rebuilding it each time.
const DEV_ENV_PATH = path.join(REPO_ROOT, '.env.development.local');
// I am saving `PROD_ENV_PATH` here so the nearby steps can reuse the same value without rebuilding it each time.
const PROD_ENV_PATH = path.join(REPO_ROOT, '.env.production.full');

// Allowed environment labels in the schema
const ALLOWED_ENVS = new Set(['dev', 'prod', 'test']);

// I am keeping `safeReadFile` as a named helper so the surrounding workflow can call this step when it needs it.
function safeReadFile(filePath, labelForError) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return fs.readFileSync(filePath, 'utf8');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`ERROR: Failed to read ${labelForError} at ${filePath}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(err && err.stack ? err.stack : String(err));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `loadSchema` as a named helper so the surrounding workflow can call this step when it needs it.
function loadSchema(filePath) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!fs.existsSync(filePath)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`ERROR: Schema file not found at ${filePath}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `raw` here so the nearby steps can reuse the same value without rebuilding it each time.
  const raw = safeReadFile(filePath, 'schema file');
  // I am saving `doc` here so the nearby steps can reuse the same value without rebuilding it each time.
  let doc;
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
    doc = yaml.load(raw) || {};
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('ERROR: Failed to parse YAML schema.');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(err && err.stack ? err.stack : String(err));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('ERROR: Schema YAML is not an object at the top level.');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `keys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const keys = Object.keys(doc);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (keys.length === 0) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn('WARN: Schema has zero keys. Is env.schema.yml populated?');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `invalidEnvs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const invalidEnvs = new Set();
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of keys) {
    // I am saving `info` here so the nearby steps can reuse the same value without rebuilding it each time.
    const info = doc[key] || {};
    // I am saving `envs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const envs = info.environments || [];
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!Array.isArray(envs)) continue;
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const env of envs) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!ALLOWED_ENVS.has(env)) invalidEnvs.add(env);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (invalidEnvs.size > 0) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn(
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      `WARN: Schema contains unknown environment labels: ${Array.from(invalidEnvs).join(', ')}`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return doc;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `stripOuterQuotes` as a named helper so the surrounding workflow can call this step when it needs it.
function stripOuterQuotes(v) {
  // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
  const s = String(v ?? '');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (s.length >= 2) {
    // I am saving `a` here so the nearby steps can reuse the same value without rebuilding it each time.
    const a = s[0];
    // I am saving `b` here so the nearby steps can reuse the same value without rebuilding it each time.
    const b = s[s.length - 1];
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      // This return sends the completed value or response back to the code that called this function.
      return s.slice(1, -1);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return s;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `loadEnvFile` as a named helper so the surrounding workflow can call this step when it needs it.
function loadEnvFile(filePath, label) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!fs.existsSync(filePath)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn(`WARN: Env file not found at ${filePath} (treating as empty).`);
    // This return sends the completed value or response back to the code that called this function.
    return {};
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `raw` here so the nearby steps can reuse the same value without rebuilding it each time.
  const raw = safeReadFile(filePath, `${label} env file`);
  // I am saving `lines` here so the nearby steps can reuse the same value without rebuilding it each time.
  const lines = raw.split(/\r?\n/);
  // I am saving `out` here so the nearby steps can reuse the same value without rebuilding it each time.
  const out = {};
  // I am saving `skippedInvalidLines` here so the nearby steps can reuse the same value without rebuilding it each time.
  let skippedInvalidLines = 0;

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const line of lines) {
    // I am saving `trimmed0` here so the nearby steps can reuse the same value without rebuilding it each time.
    const trimmed0 = line.trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!trimmed0 || trimmed0.startsWith('#')) continue;

    // Allow: export KEY=value
    const trimmed = trimmed0.startsWith('export ') ? trimmed0.slice('export '.length).trim() : trimmed0;

    // I am saving `eqIdx` here so the nearby steps can reuse the same value without rebuilding it each time.
    const eqIdx = trimmed.indexOf('=');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (eqIdx === -1) {
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      skippedInvalidLines++;
      // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
      continue;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `key` here so the nearby steps can reuse the same value without rebuilding it each time.
    const key = trimmed.slice(0, eqIdx).trim();
    // I am saving `valueRaw` here so the nearby steps can reuse the same value without rebuilding it each time.
    const valueRaw = trimmed.slice(eqIdx + 1).trim();
    // I am saving `value` here so the nearby steps can reuse the same value without rebuilding it each time.
    const value = stripOuterQuotes(valueRaw);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!key) {
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      skippedInvalidLines++;
      // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
      continue;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.warn(
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        `WARN: Duplicate key "${key}" in ${label} env file ${filePath}; last value wins.`
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
    out[key] = value;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    `INFO: Loaded ${Object.keys(out).length} keys from ${label} env file (${filePath}).`
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (skippedInvalidLines > 0) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.warn(
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      `WARN: Skipped ${skippedInvalidLines} invalid/unknown lines in ${label} env file.`
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return out;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `printSection` as a named helper so the surrounding workflow can call this step when it needs it.
function printSection(title) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('='.repeat(title.length));
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log(title);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('='.repeat(title.length));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `formatTimestampForFilename` as a named helper so the surrounding workflow can call this step when it needs it.
function formatTimestampForFilename(date) {
  // I am saving `pad` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pad = (n) => String(n).padStart(2, '0');
  // I am saving `year` here so the nearby steps can reuse the same value without rebuilding it each time.
  const year = date.getFullYear();
  // I am saving `month` here so the nearby steps can reuse the same value without rebuilding it each time.
  const month = pad(date.getMonth() + 1);
  // I am saving `day` here so the nearby steps can reuse the same value without rebuilding it each time.
  const day = pad(date.getDate());
  // I am saving `hour` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hour = pad(date.getHours());
  // I am saving `min` here so the nearby steps can reuse the same value without rebuilding it each time.
  const min = pad(date.getMinutes());
  // I am saving `sec` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sec = pad(date.getSeconds());
  // This return sends the completed value or response back to the code that called this function.
  return `${year}${month}${day}-${hour}${min}${sec}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `writeJsonReport` as a named helper so the surrounding workflow can call this step when it needs it.
function writeJsonReport(report) {
  // I am saving `stamp` here so the nearby steps can reuse the same value without rebuilding it each time.
  const stamp = formatTimestampForFilename(new Date());
  // I am saving `filePath` here so the nearby steps can reuse the same value without rebuilding it each time.
  const filePath = path.join(REPO_ROOT, `env-doctor-report-${stamp}.json`);

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`INFO: JSON report written to ${filePath}`);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`ERROR: Failed to write JSON report at ${filePath}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(err && err.stack ? err.stack : String(err));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `csvEscape` as a named helper so the surrounding workflow can call this step when it needs it.
function csvEscape(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value == null) return '';
  // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
  const s = String(value);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  // This return sends the completed value or response back to the code that called this function.
  return s;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `writeCsvReport` as a named helper so the surrounding workflow can call this step when it needs it.
function writeCsvReport(report) {
  // I am saving `stamp` here so the nearby steps can reuse the same value without rebuilding it each time.
  const stamp = formatTimestampForFilename(new Date());
  // I am saving `filePath` here so the nearby steps can reuse the same value without rebuilding it each time.
  const filePath = path.join(REPO_ROOT, `env-doctor-report-${stamp}.csv`);

  // I am saving `rows` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rows = [];
  // I am calling this helper here so the current workflow performs this step before it moves on.
  rows.push([
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'environment',
    'type',          // missing_required | missing_optional | omitted_required | omitted_optional | extra | conditional_missing
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'key',
    'required',      // yes | no
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'description'
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  ]);

  // I am saving `schema` here so the nearby steps can reuse the same value without rebuilding it each time.
  const schema = report.schema || {};

  // I am saving `addRow` here so the nearby steps can reuse the same value without rebuilding it each time.
  const addRow = (env, type, key) => {
    // I am saving `info` here so the nearby steps can reuse the same value without rebuilding it each time.
    const info = schema[key] || {};
    // I am saving `required` here so the nearby steps can reuse the same value without rebuilding it each time.
    const required = info && info.required ? 'yes' : 'no';
    // I am saving `description` here so the nearby steps can reuse the same value without rebuilding it each time.
    const description = info && info.description ? info.description : '';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    rows.push([env, type, key, required, description]);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.devMissingRequired) addRow('dev', 'missing_required', key);
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.prodMissingRequired) addRow('prod', 'missing_required', key);

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.devMissingOptional) addRow('dev', 'missing_optional', key);
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.prodMissingOptional) addRow('prod', 'missing_optional', key);

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.devOmittedRequired) addRow('dev', 'omitted_required', key);
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.prodOmittedRequired) addRow('prod', 'omitted_required', key);

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.devOmittedOptional) addRow('dev', 'omitted_optional', key);
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.prodOmittedOptional) addRow('prod', 'omitted_optional', key);

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.devConditionalMissing) addRow('dev', 'conditional_missing', key);
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.prodConditionalMissing) addRow('prod', 'conditional_missing', key);

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.devExtras) rows.push(['dev', 'extra', key, '', '']);
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of report.prodExtras) rows.push(['prod', 'extra', key, '', '']);

  // I am saving `csvContent` here so the nearby steps can reuse the same value without rebuilding it each time.
  const csvContent = rows.map((cols) => cols.map(csvEscape).join(',')).join('\n');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    fs.writeFileSync(filePath, csvContent, 'utf8');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`INFO: CSV report written to ${filePath}`);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(`ERROR: Failed to write CSV report at ${filePath}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(err && err.stack ? err.stack : String(err));
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `boolFromEnvValue` as a named helper so the surrounding workflow can call this step when it needs it.
function boolFromEnvValue(v, def = false) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (v === undefined || v === null) return def;
  // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
  const s = String(v).trim().toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (['1', 'true', 'yes', 'on', 'y'].includes(s)) return true;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (['0', 'false', 'no', 'off', 'n'].includes(s)) return false;
  // This return sends the completed value or response back to the code that called this function.
  return def;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `hasKey` as a named helper so the surrounding workflow can call this step when it needs it.
function hasKey(envObj, key) {
  // This return sends the completed value or response back to the code that called this function.
  return Object.prototype.hasOwnProperty.call(envObj, key);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `computeMissingAndOmitted` as a named helper so the surrounding workflow can call this step when it needs it.
function computeMissingAndOmitted(schema, envObj, envLabel) {
  // I am saving `schemaKeys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const schemaKeys = Object.keys(schema);

  // I am saving `missingRequired` here so the nearby steps can reuse the same value without rebuilding it each time.
  const missingRequired = [];
  // I am saving `missingOptional` here so the nearby steps can reuse the same value without rebuilding it each time.
  const missingOptional = [];
  // I am saving `omittedRequired` here so the nearby steps can reuse the same value without rebuilding it each time.
  const omittedRequired = [];
  // I am saving `omittedOptional` here so the nearby steps can reuse the same value without rebuilding it each time.
  const omittedOptional = [];

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of schemaKeys) {
    // I am saving `info` here so the nearby steps can reuse the same value without rebuilding it each time.
    const info = schema[key] || {};
    // I am saving `envs` here so the nearby steps can reuse the same value without rebuilding it each time.
    const envs = Array.isArray(info.environments) ? info.environments : [];
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!envs.includes(envLabel)) continue;

    // I am saving `required` here so the nearby steps can reuse the same value without rebuilding it each time.
    const required = !!info.required;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasKey(envObj, key)) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (required) missingRequired.push(key);
      // This alternative runs only when the condition above did not use its first path.
      else missingOptional.push(key);
      // I am changing the loop flow here once the condition above has decided this item needs no further work in this pass.
      continue;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (String(envObj[key]) === '') {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (required) omittedRequired.push(key);
      // This alternative runs only when the condition above did not use its first path.
      else omittedOptional.push(key);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return { missingRequired, missingOptional, omittedRequired, omittedOptional };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `computeExtras` as a named helper so the surrounding workflow can call this step when it needs it.
function computeExtras(schema, envObj) {
  // I am saving `schemaSet` here so the nearby steps can reuse the same value without rebuilding it each time.
  const schemaSet = new Set(Object.keys(schema));
  // This return sends the completed value or response back to the code that called this function.
  return Object.keys(envObj).filter((k) => !schemaSet.has(k)).sort();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `computeConditionalMissing` as a named helper so the surrounding workflow can call this step when it needs it.
function computeConditionalMissing(envObj, envLabel) {
  // Schema presence is not enough for feature-dependent settings. These checks mirror the
  // combinations that runtime config will require once a provider or security flag is on.
  const missing = [];

  // Match config default: (process.env.DB_PROVIDER || 'supabase-http').toLowerCase()
  const provider = String(envObj.DB_PROVIDER || 'supabase-http').trim().toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider === 'postgres') {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasKey(envObj, 'SUPABASE_DB_URL') || String(envObj.SUPABASE_DB_URL) === '') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      missing.push('SUPABASE_DB_URL');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Match config validation: if AUTH_SET_COOKIE_ENFORCE_TURNSTILE=true => require turnstile keys
  const enforceTurnstile = boolFromEnvValue(envObj.AUTH_SET_COOKIE_ENFORCE_TURNSTILE, false);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (enforceTurnstile) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasKey(envObj, 'TURNSTILE_SITE_KEY') || String(envObj.TURNSTILE_SITE_KEY) === '') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      missing.push('TURNSTILE_SITE_KEY');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasKey(envObj, 'TURNSTILE_SECRET_KEY') || String(envObj.TURNSTILE_SECRET_KEY) === '') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      missing.push('TURNSTILE_SECRET_KEY');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Match config validation: STORAGE_PROVIDER=s3 => require bucket and region (STORAGE_S3_REGION or AWS_REGION)
  const storageProvider = String(envObj.STORAGE_PROVIDER || 'local').trim().toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (storageProvider === 's3') {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasKey(envObj, 'STORAGE_S3_BUCKET') || String(envObj.STORAGE_S3_BUCKET) === '') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      missing.push('STORAGE_S3_BUCKET');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am saving `region` here so the nearby steps can reuse the same value without rebuilding it each time.
    const region = (envObj.STORAGE_S3_REGION || envObj.AWS_REGION || '').toString().trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!region) {
      // Prefer prompting for STORAGE_S3_REGION, but accept AWS_REGION as fallback.
      missing.push('STORAGE_S3_REGION');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      missing.push('AWS_REGION');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Optional: if Stripe prices are configured, PUBLIC_ORIGIN should exist (mirrors config validateConfig()).
  // Mode mapping matches your config:
  // - dev => test
  // - prod => live
  const stripeMode = envLabel === 'prod' ? 'live' : 'test';
  // I am saving `priceKeys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const priceKeys =
    // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
    stripeMode === 'live'
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      ? ['STRIPE_PRICE_RESUME_ONE_TIME_LIVE', 'STRIPE_PRICE_RESUME_EXPERT_LIVE']
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      : ['STRIPE_PRICE_RESUME_ONE_TIME_TEST', 'STRIPE_PRICE_RESUME_EXPERT_TEST'];

  // I am saving `hasAnyPrice` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hasAnyPrice = priceKeys.some((k) => hasKey(envObj, k) && String(envObj[k]) !== '');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (hasAnyPrice) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!hasKey(envObj, 'PUBLIC_ORIGIN') || String(envObj.PUBLIC_ORIGIN) === '') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      missing.push('PUBLIC_ORIGIN');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return Array.from(new Set(missing)).sort();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `main` as a named helper so the surrounding workflow can call this step when it needs it.
function main() {
  // Audit development and production side by side, print a human summary, and write
  // machine-readable evidence that can be compared during deployment review.
  try {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('INFO: Starting env-doctor...');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`INFO: Schema path: ${SCHEMA_PATH}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`INFO: Dev env path: ${DEV_ENV_PATH}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`INFO: Prod env path: ${PROD_ENV_PATH}`);

    // I am saving `schema` here so the nearby steps can reuse the same value without rebuilding it each time.
    const schema = loadSchema(SCHEMA_PATH);

    // I am saving `devEnv` here so the nearby steps can reuse the same value without rebuilding it each time.
    const devEnv = loadEnvFile(DEV_ENV_PATH, 'dev');
    // I am saving `prodEnv` here so the nearby steps can reuse the same value without rebuilding it each time.
    const prodEnv = loadEnvFile(PROD_ENV_PATH, 'prod');

    // I am saving `dev` here so the nearby steps can reuse the same value without rebuilding it each time.
    const dev = computeMissingAndOmitted(schema, devEnv, 'dev');
    // I am saving `prod` here so the nearby steps can reuse the same value without rebuilding it each time.
    const prod = computeMissingAndOmitted(schema, prodEnv, 'prod');

    // I am saving `devExtras` here so the nearby steps can reuse the same value without rebuilding it each time.
    const devExtras = computeExtras(schema, devEnv);
    // I am saving `prodExtras` here so the nearby steps can reuse the same value without rebuilding it each time.
    const prodExtras = computeExtras(schema, prodEnv);

    // I am saving `devConditionalMissing` here so the nearby steps can reuse the same value without rebuilding it each time.
    const devConditionalMissing = computeConditionalMissing(devEnv, 'dev');
    // I am saving `prodConditionalMissing` here so the nearby steps can reuse the same value without rebuilding it each time.
    const prodConditionalMissing = computeConditionalMissing(prodEnv, 'prod');

    // Summary
    printSection('Env Doctor Summary (required/optional + conditional)');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Schema keys:                    ${Object.keys(schema).length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Dev keys present:               ${Object.keys(devEnv).length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Prod keys present:              ${Object.keys(prodEnv).length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Dev missing REQUIRED:           ${dev.missingRequired.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Prod missing REQUIRED:          ${prod.missingRequired.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Dev missing optional (info):    ${dev.missingOptional.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Prod missing optional (info):   ${prod.missingOptional.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Dev omitted (=) REQUIRED:       ${dev.omittedRequired.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Prod omitted (=) REQUIRED:      ${prod.omittedRequired.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Dev omitted (=) optional (info):${dev.omittedOptional.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Prod omitted (=) optional (info):${prod.omittedOptional.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Dev conditional missing:        ${devConditionalMissing.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Prod conditional missing:       ${prodConditionalMissing.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Dev extra (not in schema):      ${devExtras.length}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Prod extra (not in schema):     ${prodExtras.length}`);

    // Required missing
    printSection('Missing REQUIRED in DEV (.env.development.local)');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (dev.missingRequired.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else dev.missingRequired.forEach((k) => console.log(`- ${k}`));

    // I am calling this helper here so the current workflow performs this step before it moves on.
    printSection('Missing REQUIRED in PROD (.env.production.full)');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (prod.missingRequired.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else prod.missingRequired.forEach((k) => console.log(`- ${k}`));

    // Required omitted
    printSection('Omitted (=) REQUIRED in DEV (.env.development.local)');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (dev.omittedRequired.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else dev.omittedRequired.forEach((k) => console.log(`- ${k} =`));

    // I am calling this helper here so the current workflow performs this step before it moves on.
    printSection('Omitted (=) REQUIRED in PROD (.env.production.full)');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (prod.omittedRequired.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else prod.omittedRequired.forEach((k) => console.log(`- ${k} =`));

    // Conditional
    printSection('Conditional missing (matches config validation posture)');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('DEV:');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (devConditionalMissing.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else devConditionalMissing.forEach((k) => console.log(`- ${k}`));

    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('PROD:');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (prodConditionalMissing.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else prodConditionalMissing.forEach((k) => console.log(`- ${k}`));

    // Optional (informational)
    printSection('Missing optional (informational)');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('DEV:');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (dev.missingOptional.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else dev.missingOptional.forEach((k) => console.log(`- ${k}`));

    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('PROD:');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (prod.missingOptional.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else prod.missingOptional.forEach((k) => console.log(`- ${k}`));

    // Extras
    printSection('Extra keys in DEV (not in schema)');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (devExtras.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else devExtras.forEach((k) => console.log(`- ${k}`));

    // I am calling this helper here so the current workflow performs this step before it moves on.
    printSection('Extra keys in PROD (not in schema)');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (prodExtras.length === 0) console.log('✓ None.');
    // This alternative runs only when the condition above did not use its first path.
    else prodExtras.forEach((k) => console.log(`- ${k}`));

    // Structured report
    const report = {
      // I am keeping the `generatedAt` field in this object so the receiving code can read that value by its expected name.
      generatedAt: new Date().toISOString(),
      // I am keeping the `schemaPath` field in this object so the receiving code can read that value by its expected name.
      schemaPath: SCHEMA_PATH,
      // I am keeping the `devEnvPath` field in this object so the receiving code can read that value by its expected name.
      devEnvPath: DEV_ENV_PATH,
      // I am keeping the `prodEnvPath` field in this object so the receiving code can read that value by its expected name.
      prodEnvPath: PROD_ENV_PATH,
      // I am keeping the `summary` field in this object so the receiving code can read that value by its expected name.
      summary: {
        // I am keeping the `schemaKeys` field in this object so the receiving code can read that value by its expected name.
        schemaKeys: Object.keys(schema).length,
        // I am keeping the `devKeys` field in this object so the receiving code can read that value by its expected name.
        devKeys: Object.keys(devEnv).length,
        // I am keeping the `prodKeys` field in this object so the receiving code can read that value by its expected name.
        prodKeys: Object.keys(prodEnv).length,
        // I am keeping the `devMissingRequired` field in this object so the receiving code can read that value by its expected name.
        devMissingRequired: dev.missingRequired.length,
        // I am keeping the `prodMissingRequired` field in this object so the receiving code can read that value by its expected name.
        prodMissingRequired: prod.missingRequired.length,
        // I am keeping the `devMissingOptional` field in this object so the receiving code can read that value by its expected name.
        devMissingOptional: dev.missingOptional.length,
        // I am keeping the `prodMissingOptional` field in this object so the receiving code can read that value by its expected name.
        prodMissingOptional: prod.missingOptional.length,
        // I am keeping the `devOmittedRequired` field in this object so the receiving code can read that value by its expected name.
        devOmittedRequired: dev.omittedRequired.length,
        // I am keeping the `prodOmittedRequired` field in this object so the receiving code can read that value by its expected name.
        prodOmittedRequired: prod.omittedRequired.length,
        // I am keeping the `devOmittedOptional` field in this object so the receiving code can read that value by its expected name.
        devOmittedOptional: dev.omittedOptional.length,
        // I am keeping the `prodOmittedOptional` field in this object so the receiving code can read that value by its expected name.
        prodOmittedOptional: prod.omittedOptional.length,
        // I am keeping the `devConditionalMissing` field in this object so the receiving code can read that value by its expected name.
        devConditionalMissing: devConditionalMissing.length,
        // I am keeping the `prodConditionalMissing` field in this object so the receiving code can read that value by its expected name.
        prodConditionalMissing: prodConditionalMissing.length,
        // I am keeping the `devExtras` field in this object so the receiving code can read that value by its expected name.
        devExtras: devExtras.length,
        // I am keeping the `prodExtras` field in this object so the receiving code can read that value by its expected name.
        prodExtras: prodExtras.length
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      schema,
      // I am keeping the `devMissingRequired` field in this object so the receiving code can read that value by its expected name.
      devMissingRequired: dev.missingRequired.sort(),
      // I am keeping the `prodMissingRequired` field in this object so the receiving code can read that value by its expected name.
      prodMissingRequired: prod.missingRequired.sort(),
      // I am keeping the `devMissingOptional` field in this object so the receiving code can read that value by its expected name.
      devMissingOptional: dev.missingOptional.sort(),
      // I am keeping the `prodMissingOptional` field in this object so the receiving code can read that value by its expected name.
      prodMissingOptional: prod.missingOptional.sort(),
      // I am keeping the `devOmittedRequired` field in this object so the receiving code can read that value by its expected name.
      devOmittedRequired: dev.omittedRequired.sort(),
      // I am keeping the `prodOmittedRequired` field in this object so the receiving code can read that value by its expected name.
      prodOmittedRequired: prod.omittedRequired.sort(),
      // I am keeping the `devOmittedOptional` field in this object so the receiving code can read that value by its expected name.
      devOmittedOptional: dev.omittedOptional.sort(),
      // I am keeping the `prodOmittedOptional` field in this object so the receiving code can read that value by its expected name.
      prodOmittedOptional: prod.omittedOptional.sort(),
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      devConditionalMissing,
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      prodConditionalMissing,
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      devExtras,
      // I am keeping this line here because the surrounding env-doctor.js workflow expects this value or operation before it continues.
      prodExtras
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am calling this helper here so the current workflow performs this step before it moves on.
    writeJsonReport(report);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    writeCsvReport(report);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('Done. Use this report to:');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('- Add missing REQUIRED keys (these should block boot);');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('- Review conditional missing keys (depends on feature toggles / DB_PROVIDER / STORAGE_PROVIDER / Stripe prices);');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('- Decide if optional keys should be set for your environment.');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('INFO: env-doctor finished successfully.');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('FATAL: Unhandled error in env-doctor.');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error(err && err.stack ? err.stack : String(err));
    // I am calling this helper here so the current workflow performs this step before it moves on.
    process.exit(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am calling this helper here so the current workflow performs this step before it moves on.
main();