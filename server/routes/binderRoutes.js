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

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif'
]);

const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

function isAllowedImageUpload(file) {
  if (!file) return false;
  const mimeOk = file.mimetype && ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype);
  const name = file.originalname || '';
  const extOk = ALLOWED_IMAGE_EXTENSIONS.test(name);
  return mimeOk || extOk;
}

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

// Photo upload route used by dashboard.js
router.post(
  '/:binderId/photos',
  upload.array('photos', 50), // Multer parses multipart form, field name "photos"
  async (req, res) => {
    try {
      const binderId = req.params.binderId;
      const allFiles = Array.isArray(req.files) ? req.files : [];

      const safeFiles = allFiles.filter(isAllowedImageUpload);

      if (!safeFiles.length) {
        logger.warn(
          {
            event: 'binder.upload.rejected_non_images',
            binderId,
            totalSelected: allFiles.length
          },
          'Binder upload rejected: no valid image files'
        );

        return res.status(400).json({
          ok: false,
          message: 'Only image files (JPG, PNG, HEIC, WEBP, AVIF) are allowed.'
        });
      }

      if (safeFiles.length < allFiles.length) {
        logger.warn(
          {
            event: 'binder.upload.partial_non_images',
            binderId,
            totalSelected: allFiles.length,
            accepted: safeFiles.length
          },
          'Binder upload: some non-image files were rejected'
        );
      }

      if (!storageProvider || typeof storageProvider.storeBinderPhotos !== 'function') {
        logger.error(
          {
            event: 'binder.upload.storage_unavailable',
            binderId
          },
          'Storage provider not configured; cannot persist binder photos'
        );

        return res.status(500).json({
          ok: false,
          message: 'Photo storage is not configured yet. Please try again later.'
        });
      }

      const userId = req.user && req.user.id;

      // EXPECTED SHAPE (you can adjust to match your real service):
      // storageProvider.storeBinderPhotos({
      //   binderId,
      //   userId,
      //   files: safeFiles
      // }) -> returns an array like:
      // [
      //   {
      //     originalname,
      //     size,
      //     storageKey,
      //     publicUrl
      //   },
      //   ...
      // ]
      const uploaded = await storageProvider.storeBinderPhotos({
        binderId,
        userId,
        files: safeFiles
      });

      const payloadPhotos = (uploaded || []).map((p) => ({
        originalname: p.originalname || p.name || 'Photo',
        size: typeof p.size === 'number' ? p.size : undefined,
        storageKey: p.storageKey || p.key || p.id || null,
        publicUrl: p.publicUrl || p.url || p.signedUrl || null
      }));

      return res.json({
        ok: true,
        uploadedCount: payloadPhotos.length,
        photos: payloadPhotos
      });
    } catch (err) {
      logger.error(
        {
          event: 'binder.upload.error',
          error: err.message,
          stack: err.stack
        },
        'Binder photo upload failed'
      );

      return res.status(500).json({
        ok: false,
        message: 'Unable to upload photos right now.'
      });
    }
  }
);

router.post(
  '/:binderId/export',
  binderController.exportPdf
);

module.exports = router;