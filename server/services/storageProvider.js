// File: server/services/storageProvider.js
// Purpose: Central storage abstraction for binder photos (S3 now, others later)
//
// WHAT:
//  - saveBinderPhoto({ userId, binderId, file }) -> { provider, storageKey, ... }
//
// HOW:
//  - Today: supports 's3' and a fallback 'local' mode.
//  - S3 configuration is read from the central config first, then falls back
//    to environment variables as a last resort.
//
// ENV (fallbacks, if config.storage is not wired yet):
//  - STORAGE_PROVIDER=s3|local
//  - STORAGE_S3_BUCKET=your-bucket-name
//  - STORAGE_S3_REGION=us-west-2 (or your region)
//  - STORAGE_S3_BASE_PATH=binders (optional)
//
// AWS credentials:
//  - Use standard AWS env vars (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN)
//    or an IAM role when running on EC2. We do NOT log secrets.

'use strict';

const fs = require('fs/promises');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { config } = require('../config');
const logger = require('../utils/logger');

// ------------------------------------------------------------
// Resolve provider and config (config first, then env fallback)
// ------------------------------------------------------------
const storageCfg = config.storage || {};
const provider =
  storageCfg.provider ||
  process.env.STORAGE_PROVIDER ||
  'local';

const s3Cfg = storageCfg.s3 || {};

const s3Region =
  s3Cfg.region ||
  process.env.STORAGE_S3_REGION ||
  process.env.AWS_REGION ||
  'us-west-2';

const s3Bucket =
  s3Cfg.bucket ||
  process.env.STORAGE_S3_BUCKET ||
  '';

const s3BasePath =
  s3Cfg.basePath ||
  process.env.STORAGE_S3_BASE_PATH ||
  'binders';

// Lazily created S3 client (only if provider === 's3')
let s3Client = null;

function getS3() {
  if (provider !== 's3') return null;

  if (!s3Bucket) {
    logger.warn(
      { event: 'storage.s3.missing_bucket', provider },
      '[storageProvider] S3 selected but bucket is not configured; falling back to local provider'
    );
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: s3Region,
      // Credentials are picked up from env/role; we don’t pass them explicitly.
    });
  }
  return s3Client;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function sanitizeFilename(name) {
  if (!name) return 'file';
  // Remove directory parts and anything weird
  const base = path.basename(name);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * saveBinderPhoto
 *
 * INPUT:
 *  - userId: string (Supabase auth user id)
 *  - binderId: string (binder uuid)
 *  - file: multer file object
 *
 * OUTPUT:
 *  {
 *    provider: 's3' | 'local',
 *    storageKey: string,
 *    bucket: string | null,
 *    sizeBytes: number,
 *    mimeType: string,
 *    originalFilename: string
 *  }
 */
async function saveBinderPhoto({ userId, binderId, file }) {
  if (!file) {
    throw new Error('saveBinderPhoto called without file');
  }

  const originalFilename = sanitizeFilename(file.originalname);
  const sizeBytes = file.size || 0;
  const mimeType = file.mimetype || 'application/octet-stream';

  // ----------------------------------------------------------
  // S3 provider
  // ----------------------------------------------------------
  const s3 = getS3();
  if (provider === 's3' && s3) {
    const key = `${s3BasePath}/${userId}/${binderId}/${Date.now()}_${originalFilename}`;

    // Read file contents from local temp path written by multer
    const body = await fs.readFile(file.path);

    const putCmd = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      Metadata: {
        user_id: String(userId || ''),
        binder_id: String(binderId || '')
      }
    });

    try {
      await s3.send(putCmd);
      // Best-effort: remove local temp file
      try {
        await fs.unlink(file.path);
      } catch (_) {
        // non-fatal
      }

      logger.info(
        {
          event: 'storage.s3.upload_ok',
          bucket: s3Bucket,
          key,
          userId,
          binderId,
          sizeBytes
        },
        'Uploaded binder photo to S3'
      );

      return {
        provider: 's3',
        storageKey: key,
        bucket: s3Bucket,
        sizeBytes,
        mimeType,
        originalFilename
      };
    } catch (err) {
      logger.error(
        {
          event: 'storage.s3.upload_failed',
          bucket: s3Bucket,
          key,
          userId,
          binderId,
          error: err.message
        },
        'Failed to upload binder photo to S3; falling back to local path'
      );
      // If S3 fails, we fall back to treating the local path as the storage key.
      // The caller can decide how to handle this.
    }
  }

  // ----------------------------------------------------------
  // Local provider (or S3 misconfigured)
  // ----------------------------------------------------------
  const localKey = file.path;

  logger.info(
    {
      event: 'storage.local.saved',
      path: localKey,
      userId,
      binderId,
      sizeBytes
    },
    'Binder photo kept on local filesystem'
  );

  return {
    provider: 'local',
    storageKey: localKey,
    bucket: null,
    sizeBytes,
    mimeType,
    originalFilename
  };
}

module.exports = {
  provider,
  saveBinderPhoto
};