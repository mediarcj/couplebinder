// File: server/routes/binderRoutes.js
// Purpose: Routes for the proof-of-relationship binder feature
// Notes:
//   - Mounted at /dashboard/binder in bootstrap/routes.js
//   - Auth is handled by requireAuth in bootstrap/routes.js, so this router
//     does NOT apply its own auth middleware.

'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');

const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const binderController = require('../controllers/binderController');
const {
  binderPhotoLimiter,
  binderLayoutLimiter,
  binderExportLimiter
} = require('../middleware/rateLimiter');

function getUserIdFromReq(req) {
  return (req.user && (req.user.id || req.user.uid)) || null;
}

let storageProvider = null;
try {
  storageProvider = require('../services/storageProvider');
} catch (err) {
  logger.warn(
    {
      event: 'binder.storage_provider_unavailable',
      error: err.message
    },
    'Storage provider module not found; binder photo uploads/streaming will fail until configured'
  );
}

const router = express.Router();

/**
 * WHERE DO WE STORE UPLOADED PHOTOS?
 *
 * In Docker, /app (your code directory) is not always writable by the node user.
 * Safer: use OS temp dir (/tmp inside the container).
 */
const uploadRoot = path.join(os.tmpdir(), 'couplebinder', 'binder-photos');

try {
  fs.mkdirSync(uploadRoot, { recursive: true });
  logger.info(
    {
      event: 'binder.upload_dir.ready',
      uploadRoot
    },
    'Binder upload directory ready'
  );
} catch (err) {
  logger.error(
    {
      event: 'binder.upload_dir.error',
      uploadRoot,
      error: err.message
    },
    'Failed to ensure binder upload directory'
  );
}

// Multer writes into temp upload directory
const upload = multer({
  dest: uploadRoot,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 50                   // max 50 photos per request
  }
});

/**
 * Prevents abusive total payload sizes (Content-Length check before multer).
 */
const MAX_BINDER_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB total per request

function enforceBinderUploadSizeLimit(req, res, next) {
  const contentLengthHeader = req.headers['content-length'];
  if (!contentLengthHeader) return next();

  const length = Number(contentLengthHeader);
  if (!Number.isFinite(length)) return next();

  if (length > MAX_BINDER_UPLOAD_BYTES) {
    logger.warn(
      {
        event: 'binder.upload.too_large',
        binderId: req.params?.binderId,
        contentLength: length,
        maxBytes: MAX_BINDER_UPLOAD_BYTES,
        requestId: req.requestId
      },
      'Binder upload rejected: payload too large'
    );

    return res.status(413).json({
      ok: false,
      message: 'Upload too large. Maximum total size is 100MB per request.'
    });
  }

  return next();
}

async function resolveBinderUuidOrThrow({ binderIdParam, userId }) {
  if (!supabaseAdmin) {
    const err = new Error('Supabase admin client not initialized');
    err.status = 503;
    throw err;
  }

  const { binderId } = await binderController.resolveBinder({
    client: supabaseAdmin,
    userId,
    binderIdParam,
    createIfMissing: false
  });

  return binderId;
}

// Router is mounted at /dashboard/binder
router.get('/', binderController.list);
router.get('/new', binderController.newForm);
router.post('/', binderController.create);

/**
 * POST /dashboard/binder/:binderId/photos
 */
router.post(
  '/:binderId/photos',
  binderPhotoLimiter(),
  enforceBinderUploadSizeLimit,
  upload.array('photos', 50),
  binderController.addPhotos
);

/**
 * GET /dashboard/binder/:binderId/photos/view-url?storageKey=...
 *
 * Returns either:
 *  - CDN/public URL (if storage provider supports it), OR
 *  - internal raw streaming URL:
 *      /dashboard/binder/:binderId/photos/raw?storageKey=...
 */
router.get('/:binderId/photos/view-url', async (req, res) => {
  const binderIdParam = String(req.params.binderId || '');
  const storageKey = String(req.query.storageKey || '');
  const userId = getUserIdFromReq(req);

  try {
    if (!storageKey) {
      return res.status(400).json({ ok: false, message: 'storageKey query parameter is required' });
    }
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'Authentication required' });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ ok: false, message: 'Photo storage is not configured.' });
    }

    // Resolve binder UUID and verify the photo belongs to THIS binder + user
    const binderUuid = await resolveBinderUuidOrThrow({ binderIdParam, userId });

    const { data: photo, error: photoErr } = await supabaseAdmin
      .from('binder_photos')
      .select('id, binder_id, user_id')
      .eq('binder_id', binderUuid)
      .eq('user_id', userId)
      .eq('storage_key', storageKey)
      .maybeSingle();

    if (photoErr) {
      logger.error(
        {
          event: 'binder.view_url.photo_lookup_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: photoErr.message
        },
        'Failed to verify photo ownership for view-url'
      );
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    }

    if (!photo) {
      logger.warn(
        {
          event: 'binder.view_url.photo_not_found',
          binderIdParam,
          binderUuid,
          storageKey,
          userId
        },
        'Photo not found for binder/user in view-url'
      );
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    }

    // Prefer a public URL if the provider supports it (CDN)
    let publicUrl = null;
    if (storageProvider && typeof storageProvider.getBinderPhotoPublicUrl === 'function') {
      publicUrl = storageProvider.getBinderPhotoPublicUrl(storageKey);
    }

    if (publicUrl) {
      return res.json({ ok: true, url: publicUrl, via: 'cdn' });
    }

    const rawPath =
      `/dashboard/binder/${encodeURIComponent(binderIdParam)}` +
      `/photos/raw?storageKey=${encodeURIComponent(storageKey)}`;

    return res.json({ ok: true, url: rawPath, via: 'raw' });
  } catch (err) {
    const status = err.status || 500;
    logger.error(
      {
        event: 'binder.view_url.error',
        binderIdParam,
        storageKey,
        userId,
        status,
        error: err.message,
        stack: err.stack
      },
      'Failed to generate view url for binder photo'
    );
    return res.status(status).json({ ok: false, message: err.message || 'Unable to generate photo URL right now.' });
  }
});

/**
 * GET /dashboard/binder/:binderId/photos/raw?storageKey=...
 * Streams the photo bytes from S3/local to the browser (no presigned URL on frontend).
 */
router.get('/:binderId/photos/raw', async (req, res) => {
  const binderIdParam = String(req.params.binderId || '');
  const storageKey = String(req.query.storageKey || '');
  const userId = getUserIdFromReq(req);

  try {
    if (!storageKey) return res.status(400).send('storageKey is required');
    if (!userId) return res.status(401).send('Not authenticated');
    if (!supabaseAdmin) return res.status(503).send('Photo storage is not configured.');
    if (!storageProvider || typeof storageProvider.getBinderPhotoStream !== 'function') {
      return res.status(503).send('Photo storage is not configured.');
    }

    const binderUuid = await resolveBinderUuidOrThrow({ binderIdParam, userId });

    const { data: photoRow, error: photoErr } = await supabaseAdmin
      .from('binder_photos')
      .select('id, mime_type')
      .eq('binder_id', binderUuid)
      .eq('storage_key', storageKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (photoErr) {
      logger.error(
        {
          event: 'binder.raw.photo_lookup_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: photoErr.message
        },
        'Failed to verify photo ownership for raw endpoint'
      );
      return res.status(500).send('Unable to verify photo ownership.');
    }

    if (!photoRow) {
      logger.warn(
        {
          event: 'binder.raw.photo_not_found',
          binderIdParam,
          binderUuid,
          storageKey,
          userId
        },
        'Photo not found for binder/user during raw view'
      );
      return res.status(404).send('Photo not found for this binder.');
    }

    const { stream, contentType, contentLength } = await storageProvider.getBinderPhotoStream(storageKey);

    const finalContentType = contentType || photoRow.mime_type || 'application/octet-stream';

    res.setHeader('Content-Type', finalContentType);
    if (contentLength) res.setHeader('Content-Length', String(contentLength));
    res.setHeader('Cache-Control', 'private, max-age=10800'); // 3 hours
    res.setHeader('Vary', 'Cookie');

    stream.on('error', (err) => {
      logger.error(
        {
          event: 'binder.raw.stream_error',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: err.message
        },
        'Error while streaming binder photo'
      );
      if (!res.headersSent) res.status(500).end('Error streaming photo');
      else res.end();
    });

    stream.pipe(res);
  } catch (err) {
    const status = err.status || 500;
    logger.error(
      {
        event: 'binder.raw.unhandled_error',
        binderIdParam,
        storageKey,
        userId,
        status,
        error: err.message,
        stack: err.stack
      },
      'Unhandled error in raw photo endpoint'
    );
    if (!res.headersSent) res.status(status).end(err.message || 'Unable to load photo right now.');
  }
});

/**
 * DELETE /dashboard/binder/:binderId/photos?storageKey=...
 */
router.delete('/:binderId/photos', async (req, res) => {
  const binderIdParam = String(req.params.binderId || '');
  const storageKey =
    String((req.query && req.query.storageKey) || (req.body && req.body.storageKey) || '');
  const userId = getUserIdFromReq(req);

  try {
    if (!storageKey) {
      return res.status(400).json({ ok: false, message: 'storageKey is required to delete a photo.' });
    }
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'Not authenticated.' });
    }
    if (!supabaseAdmin) {
      return res.status(503).json({ ok: false, message: 'Photo storage is not configured.' });
    }
    if (!storageProvider || typeof storageProvider.deleteBinderPhoto !== 'function') {
      return res.status(503).json({ ok: false, message: 'Photo storage is not configured.' });
    }

    const binderUuid = await resolveBinderUuidOrThrow({ binderIdParam, userId });

    const { data: photoRow, error: photoErr } = await supabaseAdmin
      .from('binder_photos')
      .select('id')
      .eq('binder_id', binderUuid)
      .eq('storage_key', storageKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (photoErr) {
      logger.error(
        {
          event: 'binder.delete.photo_lookup_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: photoErr.message,
          code: photoErr.code
        },
        'Failed to verify photo ownership for delete'
      );
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    }

    if (!photoRow) {
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    }

    // 1) Delete from storage
    await storageProvider.deleteBinderPhoto(storageKey);

    // 2) Delete from DB
    const { error: dbErr } = await supabaseAdmin
      .from('binder_photos')
      .delete()
      .eq('id', photoRow.id)
      .eq('user_id', userId)
      .select('id');

    if (dbErr) {
      logger.error(
        {
          event: 'binder.photo_db_delete_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: dbErr.message,
          code: dbErr.code
        },
        'Failed to delete binder photo metadata from DB'
      );
      return res.status(500).json({ ok: false, message: 'Unable to delete photo metadata right now.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    const status = err.status || 500;
    logger.error(
      {
        event: 'binder.delete.error',
        binderIdParam,
        storageKey,
        userId,
        status,
        error: err.message,
        stack: err.stack
      },
      'Failed to delete binder photo'
    );
    return res.status(status).json({ ok: false, message: err.message || 'Unable to delete photo right now.' });
  }
});

/**
 * PATCH /dashboard/binder/:binderId/photos/caption
 */
router.patch(
  '/:binderId/photos/caption',
  binderLayoutLimiter(),
  binderController.updatePhotoCaption
);

/**
 * GET /dashboard/binder/:binderId/editor
 */
router.get('/:binderId/editor', binderController.renderBinderEditor);

/**
 * GET /dashboard/binder/:binderId/layout
 */
router.get('/:binderId/layout', binderController.getBinderLayout);

/**
 * POST /dashboard/binder/:binderId/layout/apply
 */
router.post(
  '/:binderId/layout/apply',
  binderLayoutLimiter(),
  binderController.applyBinderLayout
);

/**
 * POST /dashboard/binder/:binderId/export
 */
router.post(
  '/:binderId/export',
  binderExportLimiter(),
  binderController.exportPdf
);

module.exports = router;