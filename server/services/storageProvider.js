// Purpose: Central storage abstraction for binder photos (S3 now, others later)
//
//  - saveBinderPhoto({ userId, binderId, file }) -> { provider, storageKey, ... }
//  - storeBinderPhotos({ userId, binderId, files }) -> array helper (kept for compatibility)
//  - getBinderPhotoViewUrl(storageKey) -> presigned URL (legacy, optional)
//  - getBinderPhotoStream(storageKey) -> { stream, contentType, contentLength }
//  - getBinderPhotoBuffer(storageKey) -> { buffer, contentType }
//  - deleteBinderPhoto(storageKey) -> delete from S3/local
//  - getBinderPhotoPublicUrl(storageKey) -> CDN/public URL when explicitly configured
//
//  - Supports 's3' and a fallback 'local' mode.
//  - S3 configuration is read from central config (config.storage)
//    so this module never touches process.env directly.
//
// Credentials:
//  - Uses the AWS SDK default credential resolution (IAM role, web identity,
//    or environment variables if you choose). This module never logs secrets.

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
  // Signed URLs are optional because authenticated raw streaming remains available.
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

// Resolve provider and config (config only; no process.env here)
const storageCfg = config.storage || { provider: 'local', s3: {} };

const provider = (storageCfg.provider || 'local').toLowerCase();
const s3Cfg = storageCfg.s3 || {};

const s3BasePath = (s3Cfg.basePath || 'binders')
  // Normalize once so generated object keys never begin or end with an accidental slash.
  .replace(/^\/+/, '')
  .replace(/\/+$/, '');

const s3Region = s3Cfg.region || 'us-west-2';
const s3Bucket = s3Cfg.bucket || '';

// Only use a public base URL if explicitly configured
const s3PublicBaseUrl = (() => {
  const fromConfig = (s3Cfg.publicBaseUrl || '').trim();
  return fromConfig ? fromConfig.replace(/\/+$/, '') : null;
})();

function buildS3PublicUrlForKey(storageKey) {
  // A public URL exists only when deployment config explicitly chose a CDN/base URL.
  if (!s3PublicBaseUrl || !storageKey) return null;

  // Encode path segments separately so folder separators remain meaningful in the URL.
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
  // Local mode should not construct an AWS client or try credential discovery.
  if (provider !== 's3') return null;

  if (!s3Bucket) {
    logger.warn(
      { event: 'storage.s3.missing_bucket', provider },
      '[storageProvider] S3 selected but bucket is not configured; falling back to local provider behavior'
    );
    return null;
  }

  if (!s3Client) {
    // Reuse one SDK client for all upload, read, and delete operations in this process.
    s3Client = new S3Client({
      region: s3Region
      // Credentials are picked up via AWS SDK default provider chain.
    });
  }
  return s3Client;
}

// Helpers

function sanitizeFilename(name) {
  // Keep only the basename and storage-safe characters before including it in an object key.
  if (!name) return 'file';
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
 *    originalFilename: string,
 *    publicUrl: string | null,
 *    signedUrl: string | null
 *  }
 */
async function saveBinderPhoto({ userId, binderId, file }) {
  // Multer supplies the temporary path and metadata consumed by both provider branches.
  if (!file) throw new Error('saveBinderPhoto called without file');

  const originalFilename = sanitizeFilename(file.originalname);
  const sizeBytes = file.size || 0;
  const mimeType = file.mimetype || 'application/octet-stream';

  // S3 provider
  const s3 = getS3();
  if (provider === 's3' && s3) {
    // User/binder path segments keep stored objects grouped for support and cleanup work.
    const key = `${s3BasePath}/${userId}/${binderId}/${Date.now()}_${originalFilename}`;

    // Multer wrote this file to the OS temp directory configured in binderRoutes.js.
    const body = await fs.readFile(file.path);

    const cacheControl = s3PublicBaseUrl
      ? 'public, max-age=31536000, immutable'
      : 'private, max-age=300';

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
      try { await fs.unlink(file.path); } catch (_) {}

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

      const publicUrl = buildS3PublicUrlForKey(key);

      // Also return a short-lived private URL when the optional presigner is installed.
      let signedUrl = null;
      if (getSignedUrl) {
        try {
          const getCmd = new GetObjectCommand({ Bucket: s3Bucket, Key: key });
          signedUrl = await getSignedUrl(s3, getCmd, { expiresIn: 60 * 60 });
        } catch (err) {
          logger.warn(
            { event: 'storage.s3.signed_url_failed', bucket: s3Bucket, key, error: err.message },
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
      // Keep the multer temp file intact so the local fallback below can still use it.
      logger.error(
        { event: 'storage.s3.upload_failed', bucket: s3Bucket, key, userId, binderId, error: err.message },
        'Failed to upload binder photo to S3; using local provider behavior'
      );
      // fall through to local behavior
    }
  }

  // Local provider behavior
  const localKey = file.path;

  // In local mode the multer temp path itself becomes the storage key recorded in the database.
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
    publicUrl: null,
    signedUrl: null
  };
}

/**
 * storeBinderPhotos
 *
 * Kept for compatibility (some callers may still use it).
 */
async function storeBinderPhotos({ userId, binderId, files }) {
  // This compatibility wrapper keeps successful files even when one file fails to store.
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
    }
  }

  return results;
}

/**
 * getBinderPhotoViewUrl
 *
 * Legacy helper: presigned URL for S3 objects.
 */
async function getBinderPhotoViewUrl(storageKey) {
  // Current browser code normally uses the owned controller endpoint instead of this legacy helper.
  if (!storageKey) throw new Error('getBinderPhotoViewUrl called without storageKey');

  const s3 = getS3();
  if (provider !== 's3' || !s3) return null;
  if (!getSignedUrl) return null;

  const cmd = new GetObjectCommand({
    Bucket: s3Bucket,
    Key: storageKey
  });

  return getSignedUrl(s3, cmd, { expiresIn: 60 * 60 });
}

/**
 * getBinderPhotoStream
 *
 * Returns a readable stream + basic metadata so routes can pipe bytes directly.
 */
async function getBinderPhotoStream(storageKey) {
  // binderController.streamPhotoRaw calls this only after database ownership verification.
  if (!storageKey) throw new Error('getBinderPhotoStream called without storageKey');

  const s3 = getS3();

  if (provider === 's3' && s3) {
    // AWS returns a readable Body stream, so the controller can pipe without full buffering.
    const cmd = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: storageKey
    });

    const data = await s3.send(cmd);

    return {
      stream: data.Body,
      contentType: data.ContentType || 'application/octet-stream',
      contentLength: typeof data.ContentLength === 'number' ? data.ContentLength : undefined
    };
  }

  if (provider === 'local') {
    // Local development streams directly from the multer path saved as storageKey.
    const stream = fsNative.createReadStream(storageKey);

    let contentType = 'application/octet-stream';
    const ext = path.extname(storageKey || '').toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.heic') contentType = 'image/heic';
    else if (ext === '.heif') contentType = 'image/heif';
    else if (ext === '.avif') contentType = 'image/avif';

    return { stream, contentType, contentLength: undefined };
  }

  throw new Error('getBinderPhotoStream: unsupported provider');
}

/**
 * getBinderPhotoBuffer
 *
 * Reads the entire object into a Buffer (used by PDF export).
 */
async function getBinderPhotoBuffer(storageKey) {
  // PDFKit needs a complete Buffer, unlike the raw-photo route that can stream chunks.
  const { stream, contentType } = await getBinderPhotoStream(storageKey);

  const chunks = [];
  // Async iteration respects stream errors and collects each provider chunk in order.
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return { buffer: Buffer.concat(chunks), contentType };
}

/**
 * deleteBinderPhoto
 *
 * Deletes an object from storage (S3/local).
 */
async function deleteBinderPhoto(storageKey) {
  // binderController verifies ownership before passing a storage key into this provider boundary.
  if (!storageKey) throw new Error('deleteBinderPhoto called without storageKey');

  const s3 = getS3();

  if (provider === 's3' && s3) {
    const cmd = new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: storageKey
    });

    await s3.send(cmd);
    return { provider: 's3', deleted: true };
  }

  if (provider === 'local') {
    try {
      // A missing local file is treated as already deleted so metadata cleanup can continue.
      await fs.unlink(storageKey);
      return { provider: 'local', deleted: true };
    } catch (err) {
      if (err.code === 'ENOENT') return { provider: 'local', deleted: false };
      throw err;
    }
  }

  return { provider, deleted: false };
}

module.exports = {
  provider,
  saveBinderPhoto,
  storeBinderPhotos,
  getBinderPhotoViewUrl,
  getBinderPhotoStream,
  getBinderPhotoBuffer,
  deleteBinderPhoto,
  getBinderPhotoPublicUrl
};