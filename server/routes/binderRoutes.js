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

      if (!storageKey) {
        return res.status(400).json({
          ok: false,
          message: 'storageKey query parameter is required'
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

      // Simple safety check: storageKey should include this binderId
      if (binderId && !String(storageKey).includes(String(binderId))) {
        logger.warn(
          {
            event: 'binder.view_url.key_mismatch',
            binderId,
            storageKey
          },
          'Requested storageKey does not appear to belong to this binder'
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
      const binderId = req.params.binderId;
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

      if (!storageProvider || typeof storageProvider.deleteBinderPhoto !== 'function') {
        logger.error(
          {
            event: 'binder.delete.storage_unavailable',
            binderId,
            storageKey
          },
          'Storage provider not configured for delete endpoint'
        );
        return res.status(500).json({
          ok: false,
          message: 'Photo storage is not configured.'
        });
      }

      // Safety check: storageKey should include this binderId
      if (binderId && !String(storageKey).includes(String(binderId))) {
        logger.warn(
          {
            event: 'binder.delete.key_mismatch',
            binderId,
            storageKey
          },
          'Delete request storageKey does not appear to belong to this binder'
        );
        return res.status(403).json({
          ok: false,
          message: 'Photo does not belong to this binder'
        });
      }

      // 1) Delete from storage (S3/local)
      await storageProvider.deleteBinderPhoto(storageKey);

      logger.info(
        {
          event: 'binder.photo_file_deleted',
          binderId,
          storageKey,
          userId
        },
        'Binder photo deleted from storage at user request'
      );

      // 2) Delete metadata row from binder_photos via supabaseAdmin
      if (!supabaseAdmin) {
        logger.error(
          {
            event: 'binder.photo_db_delete_client_missing',
            binderId,
            storageKey
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
        .eq('binder_id', binderId)
        .eq('storage_key', storageKey);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: deletedRows, error: dbErr } = await query.select('id');

      if (dbErr) {
        logger.error(
          {
            event: 'binder.photo_db_delete_failed',
            binderId,
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
          binderId,
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

router.post(
  '/:binderId/export',
  binderController.exportPdf
);

module.exports = router;