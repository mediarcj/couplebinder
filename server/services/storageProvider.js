// File: server/services/storageProvider.js
// Purpose: Central storage abstraction for binder photos (S3 now, others later)
//
// WHAT:
//  - saveBinderPhoto({ userId, binderId, file }) -> { provider, storageKey, ... }
//  - storeBinderPhotos({ userId, binderId, files }) -> array for the binder route
//  - getBinderPhotoViewUrl(storageKey) -> presigned URL (legacy, optional)
//  - getBinderPhotoStream(storageKey) -> { stream, contentType, contentLength }
//  - getBinderPhotoBuffer(storageKey) -> { buffer, contentType }
//  - deleteBinderPhoto(storageKey) -> delete from S3/local
//
// HOW:
//  - Today: supports 's3' and a fallback 'local' mode.
//  - S3 configuration is read from the central config (config.storage)
//    so this module never touches process.env directly.
//
// AWS credentials:
//  - Use standard AWS env vars (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN)
//    or an IAM role when running on EC2. We do NOT log secrets.

'use strict';

const fs = require('fs/promises');
const fsNative = require('fs'); // for createReadStream
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const { config } = require('../config');
const logger = require('../utils/logger');

// Optional: AWS SDK v3 presigner for short-lived view URLs
let getSignedUrl = null;
try {
  // This package must exist in your dependencies:
  //   npm install @aws-sdk/s3-request-presigner
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
} catch (err) {
  logger.warn(
    {
      event: 'storage.s3.presigner_missing',
      error: err.message
    },
    '[storageProvider] @aws-sdk/s3-request-presigner not installed; signed URLs will be disabled'
  );
}

// ------------------------------------------------------------
// Resolve provider and config (config only; no process.env here)
// ------------------------------------------------------------
const storageCfg = config.storage || { provider: 'local', s3: {} };

const provider = (storageCfg.provider || 'local').toLowerCase();
const s3Cfg = storageCfg.s3 || {};

// NEW: derive base path once from config
const s3BasePath = (s3Cfg.basePath || 'binders')
  .replace(/^\/+/, '')
  .replace(/\/+$/, '');

const s3Region = s3Cfg.region || 'us-west-2';
const s3Bucket = s3Cfg.bucket || '';

// IMPORTANT:
// - We *only* use a public base URL if you explicitly configure one
//   (STORAGE_S3_PUBLIC_BASE_URL / config.storage.s3.publicBaseUrl).
// - We NO LONGER auto-build https://bucket.s3.region.amazonaws.com,
//   because most buckets are private and that URL will 403/AccessDenied.
const s3PublicBaseUrl = (() => {
  const fromConfig = (s3Cfg.publicBaseUrl || '').trim();
  if (fromConfig) {
    return fromConfig.replace(/\/+$/, '');
  }
  return null;
})();

function buildS3PublicUrlForKey(storageKey) {
  if (!s3PublicBaseUrl || !storageKey) return null;

  const safeKey = String(storageKey)
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  return `${s3PublicBaseUrl}/${safeKey}`;
}

/**
 * For routes that only know storageKey (no file object), expose a helper
 * that returns the public CDN URL when S3 + STORAGE_S3_PUBLIC_BASE_URL are set.
 */
function getBinderPhotoPublicUrl(storageKey) {
  if (provider !== 's3') return null;
  return buildS3PublicUrlForKey(storageKey);
}

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
      region: s3Region
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
 *  - binderId: string (binder uuid or default-<userId>)
 *  - file: multer file object
 *
 * OUTPUT:
 *  {
 *    provider: 's3' | 'local',
 *    storageKey: string,
 *    bucket: string | null,
 *    sizeBytes: number,
 *    mimeType: string,
 *    originalFilename: string,
 *    publicUrl: string | null,
 *    signedUrl: string | null
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

    const cacheControl = s3PublicBaseUrl
      ? 'public, max-age=31536000, immutable' // long-lived CDN / browser cache
      : 'private, max-age=300';               // safer default when no CDN base is set

    const putCmd = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
      CacheControl: cacheControl,
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

      // build a stable CDN URL for this object.
      const publicUrl = buildS3PublicUrlForKey(key);

      // ALWAYS try to generate a short-lived signed URL for private buckets.
      // This works even when bucket-level public access is fully blocked.
      let signedUrl = null;
      if (getSignedUrl) {
        try {
          const getCmd = new GetObjectCommand({
            Bucket: s3Bucket,
            Key: key
          });
          // 1 hour is fine for interactive editing; adjust later if needed.
          signedUrl = await getSignedUrl(s3, getCmd, { expiresIn: 60 * 60 });
        } catch (err) {
          logger.warn(
            {
              event: 'storage.s3.signed_url_failed',
              bucket: s3Bucket,
              key,
              error: err.message
            },
            'Failed to generate signed URL for binder photo'
          );
        }
      }

      return {
        provider: 's3',
        storageKey: key,
        bucket: s3Bucket,
        sizeBytes,
        mimeType,
        originalFilename,
        publicUrl,
        signedUrl
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
    originalFilename,
    publicUrl: null, // no direct URL for local files (not web-served)
    signedUrl: null
  };
}

/**
 * storeBinderPhotos
 *
 * WHAT:
 *  Helper used by binderRoutes.js. It takes the array of multer files and returns
 *  a normalized array shaped for the binder photo route.
 */
async function storeBinderPhotos({ userId, binderId, files }) {
  if (!Array.isArray(files) || files.length === 0) return [];

  const results = [];

  for (const file of files) {
    try {
      const saved = await saveBinderPhoto({ userId, binderId, file });

      results.push({
        originalname: saved.originalFilename || file.originalname || file.filename || 'Photo',
        size: typeof saved.sizeBytes === 'number' ? saved.sizeBytes : file.size,
        storageKey: saved.storageKey,
        provider: saved.provider,
        bucket: saved.bucket || null,
        publicUrl: saved.publicUrl || null,
        signedUrl: saved.signedUrl || null
      });
    } catch (err) {
      logger.error(
        {
          event: 'storage.saveBinderPhoto_failed',
          binderId,
          userId,
          fileName: file && file.originalname,
          error: err.message
        },
        'Failed to save binder photo (file skipped)'
      );
      // We skip this one file but continue others
    }
  }

  return results;
}

/**
 * getBinderPhotoViewUrl
 *
 * Given a storageKey, return a short-lived signed URL so the browser can view it.
 *
 * NOTE:
 *  This is now mostly legacy. The binder editor and PDF pipeline can use
 *  getBinderPhotoStream/getBinderPhotoBuffer instead to avoid presigned URLs.
 */
async function getBinderPhotoViewUrl(storageKey) {
  if (!storageKey) {
    throw new Error('getBinderPhotoViewUrl called without storageKey');
  }

  // Only meaningful for S3; local provider has no HTTP URL
  const s3 = getS3();
  if (provider !== 's3' || !s3) {
    logger.warn(
      { event: 'storage.view_url_unsupported', provider },
      '[storageProvider] getBinderPhotoViewUrl called but provider is not s3'
    );
    return null;
  }

  if (!getSignedUrl) {
    logger.warn(
      { event: 'storage.s3.presigner_missing' },
      '[storageProvider] getBinderPhotoViewUrl: presigner not available'
    );
    return null;
  }

  try {
    const cmd = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: storageKey
    });

    // 1 hour is fine for editing sessions
    const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 60 });

    logger.info(
      {
        event: 'storage.s3.view_url_ok',
        bucket: s3Bucket,
        storageKey
      },
      'Generated fresh signed URL for binder photo'
    );

    return url;
  } catch (err) {
    logger.error(
      {
        event: 'storage.s3.view_url_failed',
        bucket: s3Bucket,
        storageKey,
        error: err.message
      },
      'Failed to generate view URL for binder photo'
    );
    throw err;
  }
}

/**
 * getBinderPhotoStream
 *
 * Given a storageKey, return a readable stream and basic metadata
 * so routes can pipe the image directly to the browser.
 */
async function getBinderPhotoStream(storageKey) {
  if (!storageKey) {
    throw new Error('getBinderPhotoStream called without storageKey');
  }

  const s3 = getS3();

  // S3 provider
  if (provider === 's3' && s3) {
    try {
      const cmd = new GetObjectCommand({
        Bucket: s3Bucket,
        Key: storageKey
      });

      const data = await s3.send(cmd);

      const stream = data.Body; // Readable stream
      const contentType = data.ContentType || 'application/octet-stream';
      const contentLength = typeof data.ContentLength === 'number'
        ? data.ContentLength
        : undefined;

      logger.info(
        {
          event: 'storage.s3.stream_ok',
          bucket: s3Bucket,
          storageKey
        },
        'Streaming binder photo from S3'
      );

      return { stream, contentType, contentLength };
    } catch (err) {
      logger.error(
        {
          event: 'storage.s3.stream_failed',
          bucket: s3Bucket,
          storageKey,
          error: err.message
        },
        'Failed to stream binder photo from S3'
      );
      throw err;
    }
  }

  // Local provider
  if (provider === 'local') {
    try {
      const stream = fsNative.createReadStream(storageKey);
      // Best-effort content type based on extension
      let contentType = 'application/octet-stream';
      const ext = path.extname(storageKey || '').toLowerCase();
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.heic') contentType = 'image/heic';
      else if (ext === '.heif') contentType = 'image/heif';
      else if (ext === '.avif') contentType = 'image/avif';

      logger.info(
        {
          event: 'storage.local.stream_ok',
          path: storageKey
        },
        'Streaming binder photo from local filesystem'
      );

      return { stream, contentType, contentLength: undefined };
    } catch (err) {
      logger.error(
        {
          event: 'storage.local.stream_failed',
          path: storageKey,
          error: err.message
        },
        'Failed to stream binder photo from local filesystem'
      );
      throw err;
    }
  }

  logger.warn(
    {
      event: 'storage.stream_unsupported_provider',
      provider,
      storageKey
    },
    '[storageProvider] getBinderPhotoStream: unsupported provider'
  );
  throw new Error('getBinderPhotoStream: unsupported provider');
}

/**
 * getBinderPhotoBuffer
 *
 * Convenience wrapper on getBinderPhotoStream: reads the whole object
 * into a Buffer. Used by PDF export.
 */
async function getBinderPhotoBuffer(storageKey) {
  const { stream, contentType } = await getBinderPhotoStream(storageKey);

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const buffer = Buffer.concat(chunks);
  return { buffer, contentType };
}

/**
 * deleteBinderPhoto
 *
 * Given a storageKey, delete the underlying object from storage.
 * - For S3: DeleteObject
 * - For local: fs.unlink()
 */
async function deleteBinderPhoto(storageKey) {
  if (!storageKey) {
    throw new Error('deleteBinderPhoto called without storageKey');
  }

  // S3 delete
  const s3 = getS3();
  if (provider === 's3' && s3) {
    try {
      const cmd = new DeleteObjectCommand({
        Bucket: s3Bucket,
        Key: storageKey
      });

      await s3.send(cmd);

      logger.info(
        {
          event: 'storage.s3.delete_ok',
          bucket: s3Bucket,
          storageKey
        },
        'Deleted binder photo from S3'
      );

      return { provider: 's3', deleted: true };
    } catch (err) {
      logger.error(
        {
          event: 'storage.s3.delete_failed',
          bucket: s3Bucket,
          storageKey,
          error: err.message
        },
        'Failed to delete binder photo from S3'
      );
      throw err;
    }
  }

  // Local provider: storageKey is a filesystem path
  if (provider === 'local') {
    try {
      await fs.unlink(storageKey);
      logger.info(
        {
          event: 'storage.local.delete_ok',
          path: storageKey
        },
        'Deleted binder photo from local filesystem'
      );
      return { provider: 'local', deleted: true };
    } catch (err) {
      // If it's already gone, treat as success
      if (err.code === 'ENOENT') {
        logger.warn(
          {
            event: 'storage.local.delete_missing',
            path: storageKey
          },
          'Local binder photo file did not exist at delete time'
        );
        return { provider: 'local', deleted: false };
      }

      logger.error(
        {
          event: 'storage.local.delete_failed',
          path: storageKey,
          error: err.message
        },
        'Failed to delete binder photo from local filesystem'
      );
      throw err;
    }
  }

  // Some other provider / mis-config
  logger.warn(
    {
      event: 'storage.delete_unsupported_provider',
      provider,
      storageKey
    },
    '[storageProvider] deleteBinderPhoto: provider does not support deletes'
  );

  return { provider, deleted: false };
}

module.exports = {
  provider,
  saveBinderPhoto,
  storeBinderPhotos,
  getBinderPhotoViewUrl,   // legacy, kept for compatibility
  getBinderPhotoStream,    // NEW
  getBinderPhotoBuffer,    // NEW
  deleteBinderPhoto,
  getBinderPhotoPublicUrl  // NEW: used by binderRoutes for CDN URLs
};