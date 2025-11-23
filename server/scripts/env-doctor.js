#!/usr/bin/env node

// env-doctor.js
//
// Compares config/env.schema.yml with:
//   - ../.env.development.local  (dev values at repo root)
//   - ../.env.production.full    (prod snapshot at repo root)
//
// Shows (in terminal):
//   - Missing keys in dev
//   - Missing keys in prod
//   - Extra keys in dev (not in schema)
//   - Extra keys in prod (not in schema)
//   - Omitted (=) keys in dev (present but empty)
//   - Omitted (=) keys in prod (present but empty)
//
// Also writes evidence files to repo root:
//   - env-doctor-report-YYYYMMDD-HHmmss.json
//   - env-doctor-report-YYYYMMDD-HHmmss.csv
//
// This gives you a durable record you can inspect or open in Excel.

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

  // Basic validation and warnings
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
      if (!ALLOWED_ENVS.has(env)) {
        invalidEnvs.add(env);
      }
    }
  }

  if (invalidEnvs.size > 0) {
    console.warn(
      `WARN: Schema contains unknown environment labels: ${Array.from(
        invalidEnvs
      ).join(', ')}`
    );
  }

  return doc;
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
    const trimmed = line.trim();

    // Ignore empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      skippedInvalidLines++;
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    if (!key) {
      skippedInvalidLines++;
      continue;
    }

    // If the same key appears twice, last one wins, but we log it
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
  // Simple CSV rule: if it has comma, quote or newline, wrap in quotes and escape quotes
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsvReport(report) {
  const stamp = formatTimestampForFilename(new Date());
  const filePath = path.join(REPO_ROOT, `env-doctor-report-${stamp}.csv`);

  const rows = [];
  // Header
  rows.push([
    'environment',
    'type',         // missing | extra | omitted
    'key',
    'required',     // yes | no | empty
    'description'
  ]);

  const addRow = (env, type, key, schemaInfo) => {
    const required = schemaInfo && schemaInfo.required ? 'yes' : 'no';
    const description = schemaInfo && schemaInfo.description ? schemaInfo.description : '';
    rows.push([
      env,
      type,
      key,
      required,
      description
    ]);
  };

  const schema = report.schema || {};

  // Missing in dev
  for (const key of report.devMissing) {
    addRow('dev', 'missing', key, schema[key]);
  }

  // Missing in prod
  for (const key of report.prodMissing) {
    addRow('prod', 'missing', key, schema[key]);
  }

  // Omitted in dev
  for (const key of report.devOmitted) {
    addRow('dev', 'omitted', key, schema[key]);
  }

  // Omitted in prod
  for (const key of report.prodOmitted) {
    addRow('prod', 'omitted', key, schema[key]);
  }

  // Extra in dev
  for (const key of report.devExtras) {
    rows.push(['dev', 'extra', key, '', '']);
  }

  // Extra in prod
  for (const key of report.prodExtras) {
    rows.push(['prod', 'extra', key, '', '']);
  }

  const csvContent = rows.map((cols) => cols.map(csvEscape).join(',')).join('\n');

  try {
    fs.writeFileSync(filePath, csvContent, 'utf8');
    console.log(`INFO: CSV report written to ${filePath}`);
  } catch (err) {
    console.error(`ERROR: Failed to write CSV report at ${filePath}`);
    console.error(err && err.stack ? err.stack : String(err));
  }
}

function main() {
  try {
    console.log('INFO: Starting env-doctor...');
    console.log(`INFO: Schema path: ${SCHEMA_PATH}`);
    console.log(`INFO: Dev env path: ${DEV_ENV_PATH}`);
    console.log(`INFO: Prod env path: ${PROD_ENV_PATH}`);

    const schema = loadSchema(SCHEMA_PATH);
    const schemaKeys = Object.keys(schema).sort();

    const devEnv = loadEnvFile(DEV_ENV_PATH, 'dev');
    const prodEnv = loadEnvFile(PROD_ENV_PATH, 'prod');

    const devKeys = Object.keys(devEnv).sort();
    const prodKeys = Object.keys(prodEnv).sort();

    const devMissing = [];
    const prodMissing = [];
    const devExtras = [];
    const prodExtras = [];
    const devOmitted = []; // present in dev, value === ''
    const prodOmitted = []; // present in prod, value === ''

    // Check missing / omitted keys (schema says this key should exist in dev/prod)
    for (const key of schemaKeys) {
      const info = schema[key] || {};
      const envs = Array.isArray(info.environments) ? info.environments : [];

      if (envs.includes('dev')) {
        if (!Object.prototype.hasOwnProperty.call(devEnv, key)) {
          devMissing.push(key);
        } else if (devEnv[key] === '') {
          devOmitted.push(key);
        }
      }

      if (envs.includes('prod')) {
        if (!Object.prototype.hasOwnProperty.call(prodEnv, key)) {
          prodMissing.push(key);
        } else if (prodEnv[key] === '') {
          prodOmitted.push(key);
        }
      }
    }

    // Check extra keys (present in env files but not in schema)
    for (const key of devKeys) {
      if (!schemaKeys.includes(key)) devExtras.push(key);
    }

    for (const key of prodKeys) {
      if (!schemaKeys.includes(key)) prodExtras.push(key);
    }

    // Basic sanity checks
    if (schemaKeys.length === 0) {
      console.warn('WARN: Schema has 0 keys. All env keys will appear as "extra".');
    }

    // Summary
    printSection('Env Doctor Summary');
    console.log(`Schema keys:          ${schemaKeys.length}`);
    console.log(`Dev keys present:     ${devKeys.length}`);
    console.log(`Prod keys present:    ${prodKeys.length}`);
    console.log(`Dev missing count:    ${devMissing.length}`);
    console.log(`Prod missing count:   ${prodMissing.length}`);
    console.log(`Dev omitted (=) count:${devOmitted.length}`);
    console.log(`Prod omitted (=) count:${prodOmitted.length}`);
    console.log(`Dev extra count:      ${devExtras.length}`);
    console.log(`Prod extra count:     ${prodExtras.length}`);

    // Missing in DEV
    printSection('Missing in DEV (.env.development.local)');
    if (devMissing.length === 0) {
      console.log('✓ None (all schema keys for dev are present).');
    } else {
      devMissing.forEach((key) => {
        const info = schema[key] || {};
        const required = info.required ? 'required' : 'optional';
        console.log(`- ${key} (${required})`);
      });
    }

    // Missing in PROD
    printSection('Missing in PROD (.env.production.full)');
    if (prodMissing.length === 0) {
      console.log('✓ None (all schema keys for prod are present).');
    } else {
      prodMissing.forEach((key) => {
        const info = schema[key] || {};
        const required = info.required ? 'required' : 'optional';
        console.log(`- ${key} (${required})`);
      });
    }

    // Omitted in DEV (present but empty)
    printSection('Omitted (=) in DEV (.env.development.local)');
    if (devOmitted.length === 0) {
      console.log('✓ None (no schema keys in dev are set to empty values).');
    } else {
      devOmitted.forEach((key) => {
        const info = schema[key] || {};
        const required = info.required ? 'required' : 'optional';
        console.log(`- ${key} (${required}) =`);
      });
    }

    // Omitted in PROD (present but empty)
    printSection('Omitted (=) in PROD (.env.production.full)');
    if (prodOmitted.length === 0) {
      console.log('✓ None (no schema keys in prod are set to empty values).');
    } else {
      prodOmitted.forEach((key) => {
        const info = schema[key] || {};
        const required = info.required ? 'required' : 'optional';
        console.log(`- ${key} (${required}) =`);
      });
    }

    // Extra in DEV
    printSection('Extra keys in DEV (not in schema)');
    if (devExtras.length === 0) {
      console.log('✓ None.');
    } else {
      devExtras.forEach((key) => console.log(`- ${key}`));
    }

    // Extra in PROD
    printSection('Extra keys in PROD (not in schema)');
    if (prodExtras.length === 0) {
      console.log('✓ None.');
    } else {
      prodExtras.forEach((key) => console.log(`- ${key}`));
    }

    // Build structured report for JSON/CSV
    const report = {
      generatedAt: new Date().toISOString(),
      schemaPath: SCHEMA_PATH,
      devEnvPath: DEV_ENV_PATH,
      prodEnvPath: PROD_ENV_PATH,
      summary: {
        schemaKeys: schemaKeys.length,
        devKeys: devKeys.length,
        prodKeys: prodKeys.length,
        devMissing: devMissing.length,
        prodMissing: prodMissing.length,
        devOmitted: devOmitted.length,
        prodOmitted: prodOmitted.length,
        devExtras: devExtras.length,
        prodExtras: prodExtras.length
      },
      schema,       // full schema object (for context)
      devMissing,
      prodMissing,
      devOmitted,
      prodOmitted,
      devExtras,
      prodExtras
    };

    writeJsonReport(report);
    writeCsvReport(report);

    console.log('');
    console.log('Done. Use this report to:');
    console.log('- Add missing keys to the env files;');
    console.log('- Decide if omitted (=) keys should be given real values; or');
    console.log('- Fix config/env.schema.yml if the schema is out of date.');
    console.log('INFO: env-doctor finished successfully.');
  } catch (err) {
    console.error('FATAL: Unhandled error in env-doctor.');
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

main();