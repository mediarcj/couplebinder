// File: server/routes/binderRoutes.js
// Purpose: Routes for the proof-of-relationship binder feature
// Notes:
//   - Mounted at /dashboard/binder in bootstrap/routes.js
//   - Auth is handled by requireAuth in bootstrap/routes.js, so this router
//     does NOT apply its own auth middleware.

const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');

const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const binderController = require('../controllers/binderController');

let storageProvider = null;
try {
  // Adjust this path if your storage provider lives somewhere else
  storageProvider = require('../services/storageProvider');
} catch (err) {
  logger.warn(
    {
      event: 'binder.storage_provider_unavailable',
      error: err.message
    },
    'Storage provider module not found; binder photo uploads will fail until configured'
  );
}

const router = express.Router();

/**
 * WHERE DO WE STORE UPLOADED PHOTOS?
 *
 * In Docker, /app (your code directory) is not always writable by the node user.
 * Trying to mkdir /app/uploads can cause EACCES.
 *
 * Safer choice: use OS temp dir (/tmp inside the container).
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
  // App still boots; first upload will fail if this path is really unusable.
}

// Configure multer to write into the temp upload directory
const upload = multer({
  dest: uploadRoot,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 50                    // max 50 photos per request
  }
});

// IMPORTANT:
// This router is mounted at /dashboard/binder, so:
//   GET  /dashboard/binder          -> list()
//   GET  /dashboard/binder/new      -> newForm()
//   POST /dashboard/binder          -> create()
//   POST /dashboard/binder/:id/...  -> etc.

router.get('/', binderController.list);
router.get('/new', binderController.newForm);

router.post('/', binderController.create);

/**
 * POST /dashboard/binder/:binderId/photos
 *
 * Flow:
 *  - Multer parses multipart form and writes to temp dir
 *  - binderController.addPhotos:
 *      - Validates safe image types
 *      - Uploads each file via saveBinderPhoto (S3/local)
 *      - Inserts metadata rows into binder_photos
 *      - Logs success/failure per photo
 */
router.post(
  '/:binderId/photos',
  upload.array('photos', 50), // Multer parses multipart form, field name "photos"
  binderController.addPhotos
);

/**
 * GET /dashboard/binder/:binderId/photos/view-url?storageKey=...
 *
 * Given a storageKey (stored in binder_layouts.layout_json.elements[].storageKey),
 * return a fresh, signed URL the browser can use in <img src="...">.
 */
router.get(
  '/:binderId/photos/view-url',
  async (req, res) => {
    try {
      const binderId = req.params.binderId;
      const storageKey = req.query.storageKey;
      const userId = req.user?.id || req.user?.uid;

      if (!storageKey) {
        return res.status(400).json({
          ok: false,
          message: 'storageKey query parameter is required'
        });
      }

      if (!userId) {
        return res.status(401).json({
          ok: false,
          message: 'Authentication required'
        });
      }

      if (!storageProvider || typeof storageProvider.getBinderPhotoViewUrl !== 'function') {
        logger.error(
          {
            event: 'binder.view_url.storage_unavailable',
            binderId,
            storageKey
          },
          'Storage provider not configured for view-url endpoint'
        );
        return res.status(500).json({
          ok: false,
          message: 'Photo storage is not configured.'
        });
      }

      // Verify ownership by checking if storageKey belongs to user's photos
      // This handles both workspace IDs (default-{userId}) and UUID binder IDs
      const { supabaseAdmin } = require('../utils/supabaseClient');
      const { data: photo, error: photoErr } = await supabaseAdmin
        .from('binder_photos')
        .select('id, binder_id, user_id')
        .eq('storage_key', storageKey)
        .eq('user_id', userId)
        .maybeSingle();

      if (photoErr) {
        logger.error(
          {
            event: 'binder.view_url.photo_lookup_failed',
            binderId,
            storageKey,
            error: photoErr.message
          },
          'Failed to verify photo ownership'
        );
        return res.status(500).json({
          ok: false,
          message: 'Unable to verify photo ownership.'
        });
      }

      if (!photo) {
        logger.warn(
          {
            event: 'binder.view_url.photo_not_found',
            binderId,
            storageKey,
            userId
          },
          'Photo not found or does not belong to user'
        );
        return res.status(403).json({
          ok: false,
          message: 'Photo does not belong to this binder'
        });
      }

      // Additional check: verify the binderId in URL matches the photo's binder
      // Handle both workspace IDs (default-{userId}) and UUID binder IDs
      const photoBinderId = String(photo.binder_id);
      const urlBinderId = String(binderId);
      
      // If URL binderId is a workspace ID, we're more lenient (workspace IDs are per-user)
      // If URL binderId is a UUID, it must match the photo's binder_id
      let binderMatches = false;
      
      if (binderId.startsWith('default-')) {
        // Workspace ID: if photo belongs to user, it's valid (workspace IDs are user-scoped)
        binderMatches = true;
      } else {
        // UUID: must match photo's binder_id exactly
        binderMatches = photoBinderId === urlBinderId;
      }

      if (!binderMatches) {
        logger.warn(
          {
            event: 'binder.view_url.binder_mismatch',
            binderId,
            photoBinderId,
            storageKey,
            userId
          },
          'Photo binder does not match URL binder ID'
        );
        return res.status(403).json({
          ok: false,
          message: 'Photo does not belong to this binder'
        });
      }

      const url = await storageProvider.getBinderPhotoViewUrl(storageKey);
      if (!url) {
        return res.status(404).json({
          ok: false,
          message: 'No view URL available for this photo.'
        });
      }

      return res.json({
        ok: true,
        url
      });
    } catch (err) {
      logger.error(
        {
          event: 'binder.view_url.error',
          error: err.message,
          stack: err.stack
        },
        'Failed to generate view url for binder photo'
      );
      return res.status(500).json({
        ok: false,
        message: 'Unable to generate photo URL right now.'
      });
    }
  }
);

/**
 * DELETE /dashboard/binder/:binderId/photos?storageKey=...
 *
 * Full system delete:
 *  - Validates that the storageKey looks like it belongs to this binder
 *  - Calls storageProvider.deleteBinderPhoto(storageKey) to remove from S3/local
 *  - Deletes the matching row from public.binder_photos using supabaseAdmin
 *
 * The canvas/layout is handled client-side and re-saved after delete.
 */
router.delete(
  '/:binderId/photos',
  async (req, res) => {
    try {
      const binderIdParam = req.params.binderId;
      const storageKey =
        (req.query && req.query.storageKey) ||
        (req.body && req.body.storageKey) ||
        '';
      const userId = (req.user && (req.user.id || req.user.uid)) || null;

      if (!storageKey) {
        return res.status(400).json({
          ok: false,
          message: 'storageKey is required to delete a photo.'
        });
      }

      if (!userId) {
        return res.status(401).json({
          ok: false,
          message: 'Not authenticated.'
        });
      }

      // Resolve binder (workspace ID or UUID) without creating missing binders
      let resolvedBinderId = null;
      try {
        const { binderId: resolvedId } = await binderController.resolveBinder({
          client: supabaseAdmin,
          userId,
          binderIdParam,
          createIfMissing: false
        });
        resolvedBinderId = resolvedId;
      } catch (err) {
        const status = err.status || 500;
        return res.status(status).json({
          ok: false,
          message: err.message || 'Unable to resolve binder.'
        });
      }

      if (!storageProvider || typeof storageProvider.deleteBinderPhoto !== 'function') {
        logger.error(
          {
            event: 'binder.delete.storage_unavailable',
            binderId: binderIdParam,
            storageKey
          },
          'Storage provider not configured for delete endpoint'
        );
        return res.status(500).json({
          ok: false,
          message: 'Photo storage is not configured.'
        });
      }

      // Verify the photo belongs to this user and binder
      const { data: photoRow, error: photoErr } = await supabaseAdmin
        .from('binder_photos')
        .select('id')
        .eq('binder_id', resolvedBinderId)
        .eq('storage_key', storageKey)
        .eq('user_id', userId)
        .maybeSingle();

      if (photoErr) {
        logger.error(
          {
            event: 'binder.delete.photo_lookup_failed',
            binderId: binderIdParam,
            resolvedBinderId,
            storageKey,
            userId,
            error: photoErr.message,
            code: photoErr.code
          },
          'Failed to verify photo ownership for delete'
        );
        return res.status(500).json({
          ok: false,
          message: 'Unable to verify photo ownership.'
        });
      }

      if (!photoRow) {
        logger.warn(
          {
            event: 'binder.delete.photo_not_found',
            binderId: binderIdParam,
            resolvedBinderId,
            storageKey,
            userId
          },
          'Photo not found for user+binder during delete'
        );
        return res.status(404).json({
          ok: false,
          message: 'Photo not found for this binder.'
        });
      }

      // 1) Delete from storage (S3/local)
      await storageProvider.deleteBinderPhoto(storageKey);

      logger.info(
        {
          event: 'binder.photo_file_deleted',
          binderId: binderIdParam,
          resolvedBinderId,
          storageKey,
          userId
        },
        'Binder photo deleted from storage at user request'
      );

      if (!supabaseAdmin) {
        logger.error(
          {
            event: 'binder.photo_db_delete_client_missing',
            binderIdParam,
            resolvedBinderId,
            storageKey,
            userId
          },
          'Supabase admin client not initialized for binder photo delete'
        );
        return res.status(500).json({
          ok: false,
          message: 'Unable to delete photo metadata right now.'
        });
      }

      let query = supabaseAdmin
        .from('binder_photos')
        .delete()
        .eq('binder_id', resolvedBinderId) // Use resolved UUID
        .eq('storage_key', storageKey);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: deletedRows, error: dbErr } = await query.select('id');

      if (dbErr) {
        logger.error(
          {
            event: 'binder.photo_db_delete_failed',
            binderIdParam,
            resolvedBinderId,
            storageKey,
            userId,
            error: dbErr.message,
            code: dbErr.code
          },
          'Failed to delete binder photo metadata from DB'
        );
        return res.status(500).json({
          ok: false,
          message: 'Unable to delete photo metadata right now.'
        });
      }

      const deletedCount = Array.isArray(deletedRows) ? deletedRows.length : 0;

      logger.info(
        {
          event: 'binder.photo_db_deleted',
          binderIdParam,
          resolvedBinderId,
          storageKey,
          userId,
          deletedCount
        },
        'Binder photo metadata deleted from DB'
      );

      return res.json({
        ok: true
      });
    } catch (err) {
      logger.error(
        {
          event: 'binder.delete.error',
          error: err.message,
          stack: err.stack
        },
        'Failed to delete binder photo'
      );
      return res.status(500).json({
        ok: false,
        message: 'Unable to delete photo right now.'
      });
    }
  }
);

/**
 * GET /dashboard/binder/:binderId/editor
 * Render binder editor page with React app
 */
router.get('/:binderId/editor', binderController.renderBinderEditor);

/**
 * GET /dashboard/binder/:binderId/layout
 * Get current layout JSON for a binder
 */
router.get('/:binderId/layout', binderController.getBinderLayout);

/**
 * POST /dashboard/binder/:binderId/layout/apply
 * Save layout changes to database
 */
router.post('/:binderId/layout/apply', binderController.applyBinderLayout);

/**
 * POST /dashboard/binder/:binderId/layout/auto
 * Generate auto layout using server-side algorithm
 */
router.post('/:binderId/layout/auto', binderController.autoLayoutBinder);

router.post(
  '/:binderId/export',
  binderController.exportPdf
);

module.exports = router;