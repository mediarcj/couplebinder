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

const binderController = require('../controllers/binderController');

const router = express.Router();

/**
 * WHERE DO WE STORE UPLOADED PHOTOS?
 *
 * In Docker, /app (your code directory) is not always writable by the node user.
 * Trying to mkdir /app/uploads causes:
 *   EACCES: permission denied, mkdir '/app/uploads'
 *
 * Safer choice: use OS temp dir (/tmp inside the container).
 */
const uploadRoot = path.join(os.tmpdir(), 'couplebinder', 'binder-photos');

try {
  fs.mkdirSync(uploadRoot, { recursive: true });
  // You can swap this to logger.info if you prefer
  console.log('[binder] Upload directory ready:', uploadRoot);
} catch (err) {
  console.error('[binder] Failed to ensure upload directory:', uploadRoot, err.message);
  // We still let the app boot; first upload will fail if this path is bad.
}

// Configure multer to write into the temp upload directory
const upload = multer({
  dest: uploadRoot,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 50,                  // max 50 photos per request
  },
});

// IMPORTANT:
// This router is mounted at /dashboard/binder, so:
//   GET  /dashboard/binder        -> list()
//   GET  /dashboard/binder/new    -> newForm()
//   POST /dashboard/binder        -> create()
//   POST /dashboard/binder/:id/... -> etc.

router.get('/', binderController.list);
router.get('/new', binderController.newForm);

router.post('/', binderController.create);

router.post(
  '/:binderId/photos',
  upload.array('photos', 50),
  binderController.addPhotos
);

router.post(
  '/:binderId/export',
  binderController.exportPdf
);

module.exports = router;