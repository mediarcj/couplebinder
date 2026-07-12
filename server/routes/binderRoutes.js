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
const binderController = require('../controllers/binderController');
const {
  binderPhotoLimiter,
  binderLayoutLimiter,
  binderExportLimiter
} = require('../middleware/rateLimiter');

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
 */
router.get(
  '/:binderId/photos/view-url',
  binderPhotoLimiter(),
  binderController.getPhotoViewUrl
);

/**
 * GET /dashboard/binder/:binderId/photos/raw?storageKey=...
 */
router.get(
  '/:binderId/photos/raw',
  binderPhotoLimiter(),
  binderController.streamPhotoRaw
);

/**
 * DELETE /dashboard/binder/:binderId/photos?storageKey=...
 */
router.delete(
  '/:binderId/photos',
  binderPhotoLimiter(),
  binderController.deletePhoto
);

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