#!/usr/bin/env node
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
const path = require('path');
const yaml = require('js-yaml');

// __dirname = server/scripts
// ROOT = server/
const ROOT = path.join(__dirname, '..');
// REPO_ROOT = project root (one level above server/)
const REPO_ROOT = path.join(ROOT, '..');

// Paths
const SCHEMA_PATH = path.join(ROOT, 'config', 'env.schema.yml');
const DEV_ENV_PATH = path.join(REPO_ROOT, '.env.development.local');
const PROD_ENV_PATH = path.join(REPO_ROOT, '.env.production.full');

// Allowed environment labels in the schema
const ALLOWED_ENVS = new Set(['dev', 'prod', 'test']);

function safeReadFile(filePath, labelForError) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`ERROR: Failed to read ${labelForError} at ${filePath}`);
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

function loadSchema(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Schema file not found at ${filePath}`);
    process.exit(1);
  }

  const raw = safeReadFile(filePath, 'schema file');
  let doc;
  try {
    doc = yaml.load(raw) || {};
  } catch (err) {
    console.error('ERROR: Failed to parse YAML schema.');
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }

  if (typeof doc !== 'object' || Array.isArray(doc)) {
    console.error('ERROR: Schema YAML is not an object at the top level.');
    process.exit(1);
  }

  const keys = Object.keys(doc);
  if (keys.length === 0) {
    console.warn('WARN: Schema has zero keys. Is env.schema.yml populated?');
  }

  const invalidEnvs = new Set();
  for (const key of keys) {
    const info = doc[key] || {};
    const envs = info.environments || [];
    if (!Array.isArray(envs)) continue;
    for (const env of envs) {
      if (!ALLOWED_ENVS.has(env)) invalidEnvs.add(env);
    }
  }

  if (invalidEnvs.size > 0) {
    console.warn(
      `WARN: Schema contains unknown environment labels: ${Array.from(invalidEnvs).join(', ')}`
    );
  }

  return doc;
}

function stripOuterQuotes(v) {
  const s = String(v ?? '');
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function loadEnvFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`WARN: Env file not found at ${filePath} (treating as empty).`);
    return {};
  }

  const raw = safeReadFile(filePath, `${label} env file`);
  const lines = raw.split(/\r?\n/);
  const out = {};
  let skippedInvalidLines = 0;

  for (const line of lines) {
    const trimmed0 = line.trim();
    if (!trimmed0 || trimmed0.startsWith('#')) continue;

    // Allow: export KEY=value
    const trimmed = trimmed0.startsWith('export ') ? trimmed0.slice('export '.length).trim() : trimmed0;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      skippedInvalidLines++;
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    const valueRaw = trimmed.slice(eqIdx + 1).trim();
    const value = stripOuterQuotes(valueRaw);

    if (!key) {
      skippedInvalidLines++;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(out, key)) {
      console.warn(
        `WARN: Duplicate key "${key}" in ${label} env file ${filePath}; last value wins.`
      );
    }

    out[key] = value;
  }

  console.log(
    `INFO: Loaded ${Object.keys(out).length} keys from ${label} env file (${filePath}).`
  );
  if (skippedInvalidLines > 0) {
    console.warn(
      `WARN: Skipped ${skippedInvalidLines} invalid/unknown lines in ${label} env file.`
    );
  }

  return out;
}

function printSection(title) {
  console.log('');
  console.log('='.repeat(title.length));
  console.log(title);
  console.log('='.repeat(title.length));
}

function formatTimestampForFilename(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const min = pad(date.getMinutes());
  const sec = pad(date.getSeconds());
  return `${year}${month}${day}-${hour}${min}${sec}`;
}

function writeJsonReport(report) {
  const stamp = formatTimestampForFilename(new Date());
  const filePath = path.join(REPO_ROOT, `env-doctor-report-${stamp}.json`);

  try {
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`INFO: JSON report written to ${filePath}`);
  } catch (err) {
    console.error(`ERROR: Failed to write JSON report at ${filePath}`);
    console.error(err && err.stack ? err.stack : String(err));
  }
}

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsvReport(report) {
  const stamp = formatTimestampForFilename(new Date());
  const filePath = path.join(REPO_ROOT, `env-doctor-report-${stamp}.csv`);

  const rows = [];
  rows.push([
    'environment',
    'type',          // missing_required | missing_optional | omitted_required | omitted_optional | extra | conditional_missing
    'key',
    'required',      // yes | no
    'description'
  ]);

  const schema = report.schema || {};

  const addRow = (env, type, key) => {
    const info = schema[key] || {};
    const required = info && info.required ? 'yes' : 'no';
    const description = info && info.description ? info.description : '';
    rows.push([env, type, key, required, description]);
  };

  for (const key of report.devMissingRequired) addRow('dev', 'missing_required', key);
  for (const key of report.prodMissingRequired) addRow('prod', 'missing_required', key);

  for (const key of report.devMissingOptional) addRow('dev', 'missing_optional', key);
  for (const key of report.prodMissingOptional) addRow('prod', 'missing_optional', key);

  for (const key of report.devOmittedRequired) addRow('dev', 'omitted_required', key);
  for (const key of report.prodOmittedRequired) addRow('prod', 'omitted_required', key);

  for (const key of report.devOmittedOptional) addRow('dev', 'omitted_optional', key);
  for (const key of report.prodOmittedOptional) addRow('prod', 'omitted_optional', key);

  for (const key of report.devConditionalMissing) addRow('dev', 'conditional_missing', key);
  for (const key of report.prodConditionalMissing) addRow('prod', 'conditional_missing', key);

  for (const key of report.devExtras) rows.push(['dev', 'extra', key, '', '']);
  for (const key of report.prodExtras) rows.push(['prod', 'extra', key, '', '']);

  const csvContent = rows.map((cols) => cols.map(csvEscape).join(',')).join('\n');

  try {
    fs.writeFileSync(filePath, csvContent, 'utf8');
    console.log(`INFO: CSV report written to ${filePath}`);
  } catch (err) {
    console.error(`ERROR: Failed to write CSV report at ${filePath}`);
    console.error(err && err.stack ? err.stack : String(err));
  }
}

function boolFromEnvValue(v, def = false) {
  if (v === undefined || v === null) return def;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'off', 'n'].includes(s)) return false;
  return def;
}

function hasKey(envObj, key) {
  return Object.prototype.hasOwnProperty.call(envObj, key);
}

function computeMissingAndOmitted(schema, envObj, envLabel) {
  const schemaKeys = Object.keys(schema);

  const missingRequired = [];
  const missingOptional = [];
  const omittedRequired = [];
  const omittedOptional = [];

  for (const key of schemaKeys) {
    const info = schema[key] || {};
    const envs = Array.isArray(info.environments) ? info.environments : [];
    if (!envs.includes(envLabel)) continue;

    const required = !!info.required;

    if (!hasKey(envObj, key)) {
      if (required) missingRequired.push(key);
      else missingOptional.push(key);
      continue;
    }

    if (String(envObj[key]) === '') {
      if (required) omittedRequired.push(key);
      else omittedOptional.push(key);
    }
  }

  return { missingRequired, missingOptional, omittedRequired, omittedOptional };
}

function computeExtras(schema, envObj) {
  const schemaSet = new Set(Object.keys(schema));
  return Object.keys(envObj).filter((k) => !schemaSet.has(k)).sort();
}

function computeConditionalMissing(envObj, envLabel) {
  const missing = [];

  // Match config default: (process.env.DB_PROVIDER || 'supabase-http').toLowerCase()
  const provider = String(envObj.DB_PROVIDER || 'supabase-http').trim().toLowerCase();
  if (provider === 'postgres') {
    if (!hasKey(envObj, 'SUPABASE_DB_URL') || String(envObj.SUPABASE_DB_URL) === '') {
      missing.push('SUPABASE_DB_URL');
    }
  }

  // Match config validation: if AUTH_SET_COOKIE_ENFORCE_TURNSTILE=true => require turnstile keys
  const enforceTurnstile = boolFromEnvValue(envObj.AUTH_SET_COOKIE_ENFORCE_TURNSTILE, false);
  if (enforceTurnstile) {
    if (!hasKey(envObj, 'TURNSTILE_SITE_KEY') || String(envObj.TURNSTILE_SITE_KEY) === '') {
      missing.push('TURNSTILE_SITE_KEY');
    }
    if (!hasKey(envObj, 'TURNSTILE_SECRET_KEY') || String(envObj.TURNSTILE_SECRET_KEY) === '') {
      missing.push('TURNSTILE_SECRET_KEY');
    }
  }

  // Match config validation: STORAGE_PROVIDER=s3 => require bucket and region (STORAGE_S3_REGION or AWS_REGION)
  const storageProvider = String(envObj.STORAGE_PROVIDER || 'local').trim().toLowerCase();
  if (storageProvider === 's3') {
    if (!hasKey(envObj, 'STORAGE_S3_BUCKET') || String(envObj.STORAGE_S3_BUCKET) === '') {
      missing.push('STORAGE_S3_BUCKET');
    }
    const region = (envObj.STORAGE_S3_REGION || envObj.AWS_REGION || '').toString().trim();
    if (!region) {
      // Prefer prompting for STORAGE_S3_REGION, but accept AWS_REGION as fallback.
      missing.push('STORAGE_S3_REGION');
      missing.push('AWS_REGION');
    }
  }

  // Optional: if Stripe prices are configured, PUBLIC_ORIGIN should exist (mirrors config validateConfig()).
  // Mode mapping matches your config:
  // - dev => test
  // - prod => live
  const stripeMode = envLabel === 'prod' ? 'live' : 'test';
  const priceKeys =
    stripeMode === 'live'
      ? ['STRIPE_PRICE_RESUME_ONE_TIME_LIVE', 'STRIPE_PRICE_RESUME_EXPERT_LIVE']
      : ['STRIPE_PRICE_RESUME_ONE_TIME_TEST', 'STRIPE_PRICE_RESUME_EXPERT_TEST'];

  const hasAnyPrice = priceKeys.some((k) => hasKey(envObj, k) && String(envObj[k]) !== '');
  if (hasAnyPrice) {
    if (!hasKey(envObj, 'PUBLIC_ORIGIN') || String(envObj.PUBLIC_ORIGIN) === '') {
      missing.push('PUBLIC_ORIGIN');
    }
  }

  return Array.from(new Set(missing)).sort();
}

function main() {
  try {
    console.log('INFO: Starting env-doctor...');
    console.log(`INFO: Schema path: ${SCHEMA_PATH}`);
    console.log(`INFO: Dev env path: ${DEV_ENV_PATH}`);
    console.log(`INFO: Prod env path: ${PROD_ENV_PATH}`);

    const schema = loadSchema(SCHEMA_PATH);

    const devEnv = loadEnvFile(DEV_ENV_PATH, 'dev');
    const prodEnv = loadEnvFile(PROD_ENV_PATH, 'prod');

    const dev = computeMissingAndOmitted(schema, devEnv, 'dev');
    const prod = computeMissingAndOmitted(schema, prodEnv, 'prod');

    const devExtras = computeExtras(schema, devEnv);
    const prodExtras = computeExtras(schema, prodEnv);

    const devConditionalMissing = computeConditionalMissing(devEnv, 'dev');
    const prodConditionalMissing = computeConditionalMissing(prodEnv, 'prod');

    // Summary
    printSection('Env Doctor Summary (required/optional + conditional)');
    console.log(`Schema keys:                    ${Object.keys(schema).length}`);
    console.log(`Dev keys present:               ${Object.keys(devEnv).length}`);
    console.log(`Prod keys present:              ${Object.keys(prodEnv).length}`);
    console.log(`Dev missing REQUIRED:           ${dev.missingRequired.length}`);
    console.log(`Prod missing REQUIRED:          ${prod.missingRequired.length}`);
    console.log(`Dev missing optional (info):    ${dev.missingOptional.length}`);
    console.log(`Prod missing optional (info):   ${prod.missingOptional.length}`);
    console.log(`Dev omitted (=) REQUIRED:       ${dev.omittedRequired.length}`);
    console.log(`Prod omitted (=) REQUIRED:      ${prod.omittedRequired.length}`);
    console.log(`Dev omitted (=) optional (info):${dev.omittedOptional.length}`);
    console.log(`Prod omitted (=) optional (info):${prod.omittedOptional.length}`);
    console.log(`Dev conditional missing:        ${devConditionalMissing.length}`);
    console.log(`Prod conditional missing:       ${prodConditionalMissing.length}`);
    console.log(`Dev extra (not in schema):      ${devExtras.length}`);
    console.log(`Prod extra (not in schema):     ${prodExtras.length}`);

    // Required missing
    printSection('Missing REQUIRED in DEV (.env.development.local)');
    if (dev.missingRequired.length === 0) console.log('✓ None.');
    else dev.missingRequired.forEach((k) => console.log(`- ${k}`));

    printSection('Missing REQUIRED in PROD (.env.production.full)');
    if (prod.missingRequired.length === 0) console.log('✓ None.');
    else prod.missingRequired.forEach((k) => console.log(`- ${k}`));

    // Required omitted
    printSection('Omitted (=) REQUIRED in DEV (.env.development.local)');
    if (dev.omittedRequired.length === 0) console.log('✓ None.');
    else dev.omittedRequired.forEach((k) => console.log(`- ${k} =`));

    printSection('Omitted (=) REQUIRED in PROD (.env.production.full)');
    if (prod.omittedRequired.length === 0) console.log('✓ None.');
    else prod.omittedRequired.forEach((k) => console.log(`- ${k} =`));

    // Conditional
    printSection('Conditional missing (matches config validation posture)');
    console.log('DEV:');
    if (devConditionalMissing.length === 0) console.log('✓ None.');
    else devConditionalMissing.forEach((k) => console.log(`- ${k}`));

    console.log('');
    console.log('PROD:');
    if (prodConditionalMissing.length === 0) console.log('✓ None.');
    else prodConditionalMissing.forEach((k) => console.log(`- ${k}`));

    // Optional (informational)
    printSection('Missing optional (informational)');
    console.log('DEV:');
    if (dev.missingOptional.length === 0) console.log('✓ None.');
    else dev.missingOptional.forEach((k) => console.log(`- ${k}`));

    console.log('');
    console.log('PROD:');
    if (prod.missingOptional.length === 0) console.log('✓ None.');
    else prod.missingOptional.forEach((k) => console.log(`- ${k}`));

    // Extras
    printSection('Extra keys in DEV (not in schema)');
    if (devExtras.length === 0) console.log('✓ None.');
    else devExtras.forEach((k) => console.log(`- ${k}`));

    printSection('Extra keys in PROD (not in schema)');
    if (prodExtras.length === 0) console.log('✓ None.');
    else prodExtras.forEach((k) => console.log(`- ${k}`));

    // Structured report
    const report = {
      generatedAt: new Date().toISOString(),
      schemaPath: SCHEMA_PATH,
      devEnvPath: DEV_ENV_PATH,
      prodEnvPath: PROD_ENV_PATH,
      summary: {
        schemaKeys: Object.keys(schema).length,
        devKeys: Object.keys(devEnv).length,
        prodKeys: Object.keys(prodEnv).length,
        devMissingRequired: dev.missingRequired.length,
        prodMissingRequired: prod.missingRequired.length,
        devMissingOptional: dev.missingOptional.length,
        prodMissingOptional: prod.missingOptional.length,
        devOmittedRequired: dev.omittedRequired.length,
        prodOmittedRequired: prod.omittedRequired.length,
        devOmittedOptional: dev.omittedOptional.length,
        prodOmittedOptional: prod.omittedOptional.length,
        devConditionalMissing: devConditionalMissing.length,
        prodConditionalMissing: prodConditionalMissing.length,
        devExtras: devExtras.length,
        prodExtras: prodExtras.length
      },
      schema,
      devMissingRequired: dev.missingRequired.sort(),
      prodMissingRequired: prod.missingRequired.sort(),
      devMissingOptional: dev.missingOptional.sort(),
      prodMissingOptional: prod.missingOptional.sort(),
      devOmittedRequired: dev.omittedRequired.sort(),
      prodOmittedRequired: prod.omittedRequired.sort(),
      devOmittedOptional: dev.omittedOptional.sort(),
      prodOmittedOptional: prod.omittedOptional.sort(),
      devConditionalMissing,
      prodConditionalMissing,
      devExtras,
      prodExtras
    };

    writeJsonReport(report);
    writeCsvReport(report);

    console.log('');
    console.log('Done. Use this report to:');
    console.log('- Add missing REQUIRED keys (these should block boot);');
    console.log('- Review conditional missing keys (depends on feature toggles / DB_PROVIDER / STORAGE_PROVIDER / Stripe prices);');
    console.log('- Decide if optional keys should be set for your environment.');
    console.log('INFO: env-doctor finished successfully.');
  } catch (err) {
    console.error('FATAL: Unhandled error in env-doctor.');
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

main();