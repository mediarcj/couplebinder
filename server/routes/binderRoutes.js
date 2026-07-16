// File: server/routes/binderRoutes.js
// Purpose: Routes for the proof-of-relationship binder feature
// Notes:
//   - Mounted at /dashboard/binder in bootstrap/routes.js
//   - Auth is handled by requireAuth in bootstrap/routes.js, so this router
//     does NOT apply its own auth middleware.

'use strict';

// I am loading `express` into `express` so this file can reuse that dependency below.
const express = require('express');
// I am loading `multer` into `multer` so this file can reuse that dependency below.
const multer = require('multer');
// I am loading `path` into `path` so this file can reuse that dependency below.
const path = require('path');
// I am loading `os` into `os` so this file can reuse that dependency below.
const os = require('os');
// I am loading `fs` into `fs` so this file can reuse that dependency below.
const fs = require('fs');

// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../controllers/binderController` into `binderController` so this file can reuse that dependency below.
const binderController = require('../controllers/binderController');
// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderPhotoLimiter,
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderLayoutLimiter,
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderExportLimiter
// I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
} = require('../middleware/rateLimiter');

// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

/**
 * WHERE DO WE STORE UPLOADED PHOTOS?
 *
 * In Docker, /app (your code directory) is not always writable by the node user.
 * Safer: use OS temp dir (/tmp inside the container).
 */
const uploadRoot = path.join(os.tmpdir(), 'couplebinder', 'binder-photos');

// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // Create the shared multer destination once while this router module is loaded.
  fs.mkdirSync(uploadRoot, { recursive: true });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'binder.upload_dir.ready',
      // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
      uploadRoot
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Binder upload directory ready'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (err) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.error(
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'binder.upload_dir.error',
      // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
      uploadRoot,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: err.message
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Failed to ensure binder upload directory'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Multer writes into temp upload directory
const upload = multer({
  // binderController/storageProvider moves accepted temporary files into their final provider.
  dest: uploadRoot,
  // I am keeping the `limits` field in this object so the receiving code can read that value by its expected name.
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 50                   // max 50 photos per request
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/**
 * Prevents abusive total payload sizes (Content-Length check before multer).
 */
const MAX_BINDER_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB total per request

// I am keeping `enforceBinderUploadSizeLimit` as a named helper so the surrounding workflow can call this step when it needs it.
function enforceBinderUploadSizeLimit(req, res, next) {
  // Reject a known-oversized request before multer writes temporary files. Per-file and
  // file-count limits still provide the authoritative checks while the body is parsed.
  const contentLengthHeader = req.headers['content-length'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!contentLengthHeader) return next();

  // I am saving `length` here so the nearby steps can reuse the same value without rebuilding it each time.
  const length = Number(contentLengthHeader);
  // Let multer enforce real streamed limits when a client omits or mangles Content-Length.
  if (!Number.isFinite(length)) return next();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (length > MAX_BINDER_UPLOAD_BYTES) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.upload.too_large',
        // I am keeping the `binderId` field in this object so the receiving code can read that value by its expected name.
        binderId: req.params?.binderId,
        // I am keeping the `contentLength` field in this object so the receiving code can read that value by its expected name.
        contentLength: length,
        // I am keeping the `maxBytes` field in this object so the receiving code can read that value by its expected name.
        maxBytes: MAX_BINDER_UPLOAD_BYTES,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Binder upload rejected: payload too large'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // This return sends the completed value or response back to the code that called this function.
    return res.status(413).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Upload too large. Maximum total size is 100MB per request.'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Router is mounted at /dashboard/binder
// bootstrap/routes.js supplies authentication before requests enter this router.
router.get('/', binderController.list);
// This registers the GET `/new` route so Express can send matching requests through the handlers listed here.
router.get('/new', binderController.newForm);
// This registers the POST `/` route so Express can send matching requests through the handlers listed here.
router.post('/', binderController.create);

/**
 * POST /dashboard/binder/:binderId/photos
 */
router.post(
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '/:binderId/photos',
  // Rate limit first, reject known total size next, parse temporary files, then store metadata.
  binderPhotoLimiter(),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  enforceBinderUploadSizeLimit,
  // I am calling this helper here so the current workflow performs this step before it moves on.
  upload.array('photos', 50),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderController.addPhotos
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

/**
 * GET /dashboard/binder/:binderId/photos/view-url?storageKey=...
 */
router.get(
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '/:binderId/photos/view-url',
  // The controller verifies binder_photos ownership before returning CDN or raw route access.
  binderPhotoLimiter(),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderController.getPhotoViewUrl
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

/**
 * GET /dashboard/binder/:binderId/photos/raw?storageKey=...
 */
router.get(
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '/:binderId/photos/raw',
  // This protected fallback streams bytes through storageProvider when no public URL is configured.
  binderPhotoLimiter(),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderController.streamPhotoRaw
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

/**
 * DELETE /dashboard/binder/:binderId/photos?storageKey=...
 */
router.delete(
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '/:binderId/photos',
  // Reuse the photo limiter because deletes also reach both storage and the database.
  binderPhotoLimiter(),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderController.deletePhoto
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

/**
 * PATCH /dashboard/binder/:binderId/photos/caption
 */
router.patch(
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '/:binderId/photos/caption',
  // Caption edits change layout-adjacent data and share the layout mutation budget.
  binderLayoutLimiter(),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderController.updatePhotoCaption
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '/:binderId/layout/apply',
  // App autosave lands here after api.applyLayout attaches the CSRF header.
  binderLayoutLimiter(),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderController.applyBinderLayout
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

/**
 * POST /dashboard/binder/:binderId/export
 */
router.post(
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  '/:binderId/export',
  // PDF work can fetch many stored images, so it has a separate expensive-operation limiter.
  binderExportLimiter(),
  // I am keeping this line here because the surrounding binderRoutes.js workflow expects this value or operation before it continues.
  binderController.exportPdf
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
);

// I am exporting this value here so another module can deliberately reuse the completed piece from binderRoutes.js.
module.exports = router;