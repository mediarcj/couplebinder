// File: server/services/storageProvider.js
// Purpose: Central storage abstraction for binder photos (S3 now, others later)
//
// WHAT:
//  - saveBinderPhoto({ userId, binderId, file }) -> { provider, storageKey, ... }
//  - storeBinderPhotos({ userId, binderId, files }) -> array helper (kept for compatibility)
//  - getBinderPhotoViewUrl(storageKey) -> presigned URL (legacy, optional)
//  - getBinderPhotoStream(storageKey) -> { stream, contentType, contentLength }
//  - getBinderPhotoBuffer(storageKey) -> { buffer, contentType }
//  - deleteBinderPhoto(storageKey) -> delete from S3/local
//  - getBinderPhotoPublicUrl(storageKey) -> CDN/public URL when explicitly configured
//
// HOW:
//  - Supports 's3' and a fallback 'local' mode.
//  - S3 configuration is read from central config (config.storage)
//    so this module never touches process.env directly.
//
// Credentials:
//  - Uses the AWS SDK default credential resolution (IAM role, web identity,
//    or environment variables if you choose). This module never logs secrets.

'use strict';

// I am loading `fs/promises` into `fs` so this file can reuse that dependency below.
const fs = require('fs/promises');
const fsNative = require('fs'); // for createReadStream
// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');
// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  S3Client,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  PutObjectCommand,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  GetObjectCommand,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  DeleteObjectCommand
// I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
} = require('@aws-sdk/client-s3');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');

// Optional: AWS SDK v3 presigner for short-lived view URLs
let getSignedUrl = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // Signed URLs are optional because authenticated raw streaming remains available.
  ({ getSignedUrl } = require('@aws-sdk/s3-request-presigner'));
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (err) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.warn(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'storage.s3.presigner_missing',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: err.message
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    '[storageProvider] @aws-sdk/s3-request-presigner not installed; signed URLs will be disabled'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ------------------------------------------------------------
// Resolve provider and config (config only; no process.env here)
// ------------------------------------------------------------
const storageCfg = config.storage || { provider: 'local', s3: {} };

// I am saving `provider` here so the nearby steps can reuse the same value without rebuilding it each time.
const provider = (storageCfg.provider || 'local').toLowerCase();
// I am saving `s3Cfg` here so the nearby steps can reuse the same value without rebuilding it each time.
const s3Cfg = storageCfg.s3 || {};

// I am saving `s3BasePath` here so the nearby steps can reuse the same value without rebuilding it each time.
const s3BasePath = (s3Cfg.basePath || 'binders')
  // Normalize once so generated object keys never begin or end with an accidental slash.
  .replace(/^\/+/, '')
  // I am continuing the existing call chain here so this option stays attached to the same operation started above.
  .replace(/\/+$/, '');

// I am saving `s3Region` here so the nearby steps can reuse the same value without rebuilding it each time.
const s3Region = s3Cfg.region || 'us-west-2';
// I am saving `s3Bucket` here so the nearby steps can reuse the same value without rebuilding it each time.
const s3Bucket = s3Cfg.bucket || '';

// Only use a public base URL if explicitly configured
const s3PublicBaseUrl = (() => {
  // I am saving `fromConfig` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fromConfig = (s3Cfg.publicBaseUrl || '').trim();
  // This return sends the completed value or response back to the code that called this function.
  return fromConfig ? fromConfig.replace(/\/+$/, '') : null;
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
})();

// I am keeping `buildS3PublicUrlForKey` as a named helper so the surrounding workflow can call this step when it needs it.
function buildS3PublicUrlForKey(storageKey) {
  // A public URL exists only when deployment config explicitly chose a CDN/base URL.
  if (!s3PublicBaseUrl || !storageKey) return null;

  // Encode path segments separately so folder separators remain meaningful in the URL.
  const safeKey = String(storageKey)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .split('/')
    // I am mapping the collection here so each input item becomes the output shape expected by the next step.
    .map(encodeURIComponent)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .join('/');

  // This return sends the completed value or response back to the code that called this function.
  return `${s3PublicBaseUrl}/${safeKey}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * For routes that only know storageKey (no file object), expose a helper
 * that returns the public CDN URL when S3 + STORAGE_S3_PUBLIC_BASE_URL are set.
 */
function getBinderPhotoPublicUrl(storageKey) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider !== 's3') return null;
  // This return sends the completed value or response back to the code that called this function.
  return buildS3PublicUrlForKey(storageKey);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Lazily created S3 client (only if provider === 's3')
let s3Client = null;

// I am keeping `getS3` as a named helper so the surrounding workflow can call this step when it needs it.
function getS3() {
  // Local mode should not construct an AWS client or try credential discovery.
  if (provider !== 's3') return null;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!s3Bucket) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
      { event: 'storage.s3.missing_bucket', provider },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      '[storageProvider] S3 selected but bucket is not configured; falling back to local provider behavior'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!s3Client) {
    // Reuse one SDK client for all upload, read, and delete operations in this process.
    s3Client = new S3Client({
      // I am keeping the `region` field in this object so the receiving code can read that value by its expected name.
      region: s3Region
      // Credentials are picked up via AWS SDK default provider chain.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return s3Client;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function sanitizeFilename(name) {
  // Keep only the basename and storage-safe characters before including it in an object key.
  if (!name) return 'file';
  // I am saving `base` here so the nearby steps can reuse the same value without rebuilding it each time.
  const base = path.basename(name);
  // This return sends the completed value or response back to the code that called this function.
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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

  // I am saving `originalFilename` here so the nearby steps can reuse the same value without rebuilding it each time.
  const originalFilename = sanitizeFilename(file.originalname);
  // I am saving `sizeBytes` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sizeBytes = file.size || 0;
  // I am saving `mimeType` here so the nearby steps can reuse the same value without rebuilding it each time.
  const mimeType = file.mimetype || 'application/octet-stream';

  // ----------------------------------------------------------
  // S3 provider
  // ----------------------------------------------------------
  const s3 = getS3();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider === 's3' && s3) {
    // User/binder path segments keep stored objects grouped for support and cleanup work.
    const key = `${s3BasePath}/${userId}/${binderId}/${Date.now()}_${originalFilename}`;

    // Multer wrote this file to the OS temp directory configured in binderRoutes.js.
    const body = await fs.readFile(file.path);

    // I am saving `cacheControl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cacheControl = s3PublicBaseUrl
      // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
      ? 'public, max-age=31536000, immutable'
      // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
      : 'private, max-age=300';

    // I am saving `putCmd` here so the nearby steps can reuse the same value without rebuilding it each time.
    const putCmd = new PutObjectCommand({
      // I am keeping the `Bucket` field in this object so the receiving code can read that value by its expected name.
      Bucket: s3Bucket,
      // I am keeping the `Key` field in this object so the receiving code can read that value by its expected name.
      Key: key,
      // I am keeping the `Body` field in this object so the receiving code can read that value by its expected name.
      Body: body,
      // I am keeping the `ContentType` field in this object so the receiving code can read that value by its expected name.
      ContentType: mimeType,
      // I am keeping the `CacheControl` field in this object so the receiving code can read that value by its expected name.
      CacheControl: cacheControl,
      // I am keeping the `Metadata` field in this object so the receiving code can read that value by its expected name.
      Metadata: {
        // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
        user_id: String(userId || ''),
        // I am keeping the `binder_id` field in this object so the receiving code can read that value by its expected name.
        binder_id: String(binderId || '')
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await s3.send(putCmd);

      // Best-effort: remove local temp file
      try { await fs.unlink(file.path); } catch (_) {}

      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'storage.s3.upload_ok',
          // I am keeping the `bucket` field in this object so the receiving code can read that value by its expected name.
          bucket: s3Bucket,
          // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
          key,
          // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
          binderId,
          // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
          sizeBytes
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Uploaded binder photo to S3'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

      // I am saving `publicUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
      const publicUrl = buildS3PublicUrlForKey(key);

      // Also return a short-lived private URL when the optional presigner is installed.
      let signedUrl = null;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (getSignedUrl) {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am saving `getCmd` here so the nearby steps can reuse the same value without rebuilding it each time.
          const getCmd = new GetObjectCommand({ Bucket: s3Bucket, Key: key });
          // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
          signedUrl = await getSignedUrl(s3, getCmd, { expiresIn: 60 * 60 });
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (err) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.warn(
            // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
            { event: 'storage.s3.signed_url_failed', bucket: s3Bucket, key, error: err.message },
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'Failed to generate signed URL for binder photo'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This return sends the completed value or response back to the code that called this function.
      return {
        // I am keeping the `provider` field in this object so the receiving code can read that value by its expected name.
        provider: 's3',
        // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
        storageKey: key,
        // I am keeping the `bucket` field in this object so the receiving code can read that value by its expected name.
        bucket: s3Bucket,
        // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
        sizeBytes,
        // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
        mimeType,
        // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
        originalFilename,
        // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
        publicUrl,
        // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
        signedUrl
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // Keep the multer temp file intact so the local fallback below can still use it.
      logger.error(
        // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
        { event: 'storage.s3.upload_failed', bucket: s3Bucket, key, userId, binderId, error: err.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to upload binder photo to S3; using local provider behavior'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // fall through to local behavior
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // ----------------------------------------------------------
  // Local provider behavior
  // ----------------------------------------------------------
  const localKey = file.path;

  // In local mode the multer temp path itself becomes the storage key recorded in the database.
  logger.info(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'storage.local.saved',
      // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
      path: localKey,
      // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
      binderId,
      // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
      sizeBytes
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Binder photo kept on local filesystem'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `provider` field in this object so the receiving code can read that value by its expected name.
    provider: 'local',
    // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
    storageKey: localKey,
    // I am keeping the `bucket` field in this object so the receiving code can read that value by its expected name.
    bucket: null,
    // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
    sizeBytes,
    // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
    mimeType,
    // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
    originalFilename,
    // I am keeping the `publicUrl` field in this object so the receiving code can read that value by its expected name.
    publicUrl: null,
    // I am keeping the `signedUrl` field in this object so the receiving code can read that value by its expected name.
    signedUrl: null
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * storeBinderPhotos
 *
 * Kept for compatibility (some callers may still use it).
 */
async function storeBinderPhotos({ userId, binderId, files }) {
  // This compatibility wrapper keeps successful files even when one file fails to store.
  if (!Array.isArray(files) || files.length === 0) return [];

  // I am saving `results` here so the nearby steps can reuse the same value without rebuilding it each time.
  const results = [];

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const file of files) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `saved` here so the nearby steps can reuse the same value without rebuilding it each time.
      const saved = await saveBinderPhoto({ userId, binderId, file });

      // I am calling this helper here so the current workflow performs this step before it moves on.
      results.push({
        // I am keeping the `originalname` field in this object so the receiving code can read that value by its expected name.
        originalname: saved.originalFilename || file.originalname || file.filename || 'Photo',
        // I am keeping the `size` field in this object so the receiving code can read that value by its expected name.
        size: typeof saved.sizeBytes === 'number' ? saved.sizeBytes : file.size,
        // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
        storageKey: saved.storageKey,
        // I am keeping the `provider` field in this object so the receiving code can read that value by its expected name.
        provider: saved.provider,
        // I am keeping the `bucket` field in this object so the receiving code can read that value by its expected name.
        bucket: saved.bucket || null,
        // I am keeping the `publicUrl` field in this object so the receiving code can read that value by its expected name.
        publicUrl: saved.publicUrl || null,
        // I am keeping the `signedUrl` field in this object so the receiving code can read that value by its expected name.
        signedUrl: saved.signedUrl || null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'storage.saveBinderPhoto_failed',
          // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
          binderId,
          // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `fileName` field in this object so the receiving code can read that value by its expected name.
          fileName: file && file.originalname,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: err.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to save binder photo (file skipped)'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return results;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * getBinderPhotoViewUrl
 *
 * Legacy helper: presigned URL for S3 objects.
 */
async function getBinderPhotoViewUrl(storageKey) {
  // Current browser code normally uses the owned controller endpoint instead of this legacy helper.
  if (!storageKey) throw new Error('getBinderPhotoViewUrl called without storageKey');

  // I am saving `s3` here so the nearby steps can reuse the same value without rebuilding it each time.
  const s3 = getS3();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider !== 's3' || !s3) return null;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!getSignedUrl) return null;

  // I am saving `cmd` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cmd = new GetObjectCommand({
    // I am keeping the `Bucket` field in this object so the receiving code can read that value by its expected name.
    Bucket: s3Bucket,
    // I am keeping the `Key` field in this object so the receiving code can read that value by its expected name.
    Key: storageKey
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This return sends the completed value or response back to the code that called this function.
  return getSignedUrl(s3, cmd, { expiresIn: 60 * 60 });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * getBinderPhotoStream
 *
 * Returns a readable stream + basic metadata so routes can pipe bytes directly.
 */
async function getBinderPhotoStream(storageKey) {
  // binderController.streamPhotoRaw calls this only after database ownership verification.
  if (!storageKey) throw new Error('getBinderPhotoStream called without storageKey');

  // I am saving `s3` here so the nearby steps can reuse the same value without rebuilding it each time.
  const s3 = getS3();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider === 's3' && s3) {
    // AWS returns a readable Body stream, so the controller can pipe without full buffering.
    const cmd = new GetObjectCommand({
      // I am keeping the `Bucket` field in this object so the receiving code can read that value by its expected name.
      Bucket: s3Bucket,
      // I am keeping the `Key` field in this object so the receiving code can read that value by its expected name.
      Key: storageKey
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const data = await s3.send(cmd);

    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `stream` field in this object so the receiving code can read that value by its expected name.
      stream: data.Body,
      // I am keeping the `contentType` field in this object so the receiving code can read that value by its expected name.
      contentType: data.ContentType || 'application/octet-stream',
      // I am keeping the `contentLength` field in this object so the receiving code can read that value by its expected name.
      contentLength: typeof data.ContentLength === 'number' ? data.ContentLength : undefined
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider === 'local') {
    // Local development streams directly from the multer path saved as storageKey.
    const stream = fsNative.createReadStream(storageKey);

    // I am saving `contentType` here so the nearby steps can reuse the same value without rebuilding it each time.
    let contentType = 'application/octet-stream';
    // I am saving `ext` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ext = path.extname(storageKey || '').toLowerCase();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (ext === '.png') contentType = 'image/png';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (ext === '.webp') contentType = 'image/webp';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (ext === '.heic') contentType = 'image/heic';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (ext === '.heif') contentType = 'image/heif';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (ext === '.avif') contentType = 'image/avif';

    // This return sends the completed value or response back to the code that called this function.
    return { stream, contentType, contentLength: undefined };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
  throw new Error('getBinderPhotoStream: unsupported provider');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * getBinderPhotoBuffer
 *
 * Reads the entire object into a Buffer (used by PDF export).
 */
async function getBinderPhotoBuffer(storageKey) {
  // PDFKit needs a complete Buffer, unlike the raw-photo route that can stream chunks.
  const { stream, contentType } = await getBinderPhotoStream(storageKey);

  // I am saving `chunks` here so the nearby steps can reuse the same value without rebuilding it each time.
  const chunks = [];
  // Async iteration respects stream errors and collects each provider chunk in order.
  for await (const chunk of stream) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    chunks.push(chunk);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return { buffer: Buffer.concat(chunks), contentType };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * deleteBinderPhoto
 *
 * Deletes an object from storage (S3/local).
 */
async function deleteBinderPhoto(storageKey) {
  // binderController verifies ownership before passing a storage key into this provider boundary.
  if (!storageKey) throw new Error('deleteBinderPhoto called without storageKey');

  // I am saving `s3` here so the nearby steps can reuse the same value without rebuilding it each time.
  const s3 = getS3();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider === 's3' && s3) {
    // I am saving `cmd` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cmd = new DeleteObjectCommand({
      // I am keeping the `Bucket` field in this object so the receiving code can read that value by its expected name.
      Bucket: s3Bucket,
      // I am keeping the `Key` field in this object so the receiving code can read that value by its expected name.
      Key: storageKey
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await s3.send(cmd);
    // This return sends the completed value or response back to the code that called this function.
    return { provider: 's3', deleted: true };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (provider === 'local') {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // A missing local file is treated as already deleted so metadata cleanup can continue.
      await fs.unlink(storageKey);
      // This return sends the completed value or response back to the code that called this function.
      return { provider: 'local', deleted: true };
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (err.code === 'ENOENT') return { provider: 'local', deleted: false };
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return { provider, deleted: false };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from storageProvider.js.
module.exports = {
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  provider,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  saveBinderPhoto,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  storeBinderPhotos,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  getBinderPhotoViewUrl,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  getBinderPhotoStream,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  getBinderPhotoBuffer,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  deleteBinderPhoto,
  // I am keeping this line here because the surrounding storageProvider.js workflow expects this value or operation before it continues.
  getBinderPhotoPublicUrl
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};