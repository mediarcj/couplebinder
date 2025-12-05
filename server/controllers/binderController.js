// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: DB-backed version (uses Supabase tables + S3/local uploads)

'use strict';

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { supabase } = require('../utils/supabaseClient'); // kept for future use
const { saveBinderPhoto } = require('../services/storageProvider');

// -----------------------------------------------------------------------------
// Shared server-side image validation (aligns with binderRoutes + dashboard.js)
// -----------------------------------------------------------------------------
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
  // Accept if either MIME or extension says "image we support"
  return mimeOk || extOk;
}

/**
 * Small helper: ensure we have a logged-in user and a Supabase admin client.
 */
function getContext(req) {
  const userId = req.user?.id;

  if (!userId) {
    const err = new Error('Unauthorized: missing user id on request');
    err.status = 401;
    throw err;
  }

  if (!supabaseAdmin) {
    const err = new Error('Supabase admin client not initialized');
    err.status = 503;
    throw err;
  }

  return { userId, client: supabaseAdmin };
}

/**
 * GET /dashboard/binder
 * List binders for the current user (now backed by Supabase)
 */
async function list(req, res, next) {
  try {
    const { userId, client } = getContext(req);

    const { data, error } = await client
      .from('binders')
      .select('id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(
        {
          event: 'binder.list_query_failed',
          error: error.message,
          userId
        },
        'Binder list query failed'
      );
      const err = new Error('Unable to load binders');
      err.status = 500;
      throw err;
    }

    logger.info(
      {
        event: 'binder.list_ok',
        userId,
        count: data?.length || 0
      },
      'Binder list loaded'
    );

    return res.json({
      ok: true,
      binders: data || []
    });
  } catch (err) {
    logger.error(
      { event: 'binder.list_failed', error: err.message, userId: req.user?.id },
      'Binder list handler failed'
    );
    next(err);
  }
}

/**
 * GET /dashboard/binder/new
 * Show "new binder" builder UI (still placeholder, but wired for future EJS)
 */
function newForm(req, res, next) {
  try {
    // Later we’ll replace this with an EJS view like:
    //   res.render('binder/new', model)
    return res.send(
      'Binder builder placeholder – DB is wired, UI canvas comes next.'
    );
  } catch (err) {
    logger.error(
      { event: 'binder.new_form_failed', error: err.message, userId: req.user?.id },
      'Binder newForm handler failed'
    );
    next(err);
  }
}

/**
 * POST /dashboard/binder
 * Create a new binder record in Supabase
 */
async function create(req, res, next) {
  try {
    const { userId, client } = getContext(req);
    const rawTitle = (req.body && req.body.title) || '';
    const title = rawTitle.trim() || 'Untitled binder';

    const { data, error } = await client
      .from('binders')
      .insert({
        user_id: userId,
        title
      })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) {
      logger.error(
        {
          event: 'binder.create_query_failed',
          error: error.message,
          userId,
          title
        },
        'Binder create insert failed'
      );
      const err = new Error('Unable to create binder');
      err.status = 500;
      throw err;
    }

    logger.info(
      {
        event: 'binder.created',
        binderId: data.id,
        userId,
        title: data.title
      },
      'Binder created'
    );

    return res.status(201).json({
      ok: true,
      binderId: data.id,
      binder: data,
      message: 'Binder created successfully'
    });
  } catch (err) {
    logger.error(
      { event: 'binder.create_failed', error: err.message, userId: req.user?.id },
      'Binder create handler failed'
    );
    next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/photos
 * Accept uploaded photos (via multer) and persist to storage + binder_photos
 *
 * Assumptions:
 *  - Multer is configured in binderRoutes to write files under a temp root
 *    like /tmp/couplebinder/binder-photos.
 *  - DB table: binder_photos with at least:
 *      id (uuid, default),
 *      binder_id (uuid or text),
 *      user_id (uuid),
 *      storage_key (text),
 *      original_filename (text),
 *      mime_type (text),
 *      size_bytes (bigint),
 *      status (text),
 *      created_at (timestamptz)
 *
 * NOTE:
 *  This controller is written to match the JSON shape your dashboard expects:
 *  {
 *    ok: true,
 *    binderId,
 *    uploadedCount: <number>,
 *    photos: [
 *      {
 *        storageKey,
 *        originalname,
 *        mimetype,
 *        size,
 *        provider,
 *        bucket,
 *        publicUrl,
 *        signedUrl
 *      },
 *      ...
 *    ]
 *  }
 */

/**
 * POST /dashboard/binder/:binderId/photos
 * Accept uploaded photos (via multer) and persist to storage + binder_photos
 *
 * NOTE:
 *  - :binderId in the URL is a *workspace* id (e.g. "default-<userId>") used by the UI
 *    and for S3 path building.
 *  - The actual DB primary key is binders.id (uuid).
 *  - We now resolve "the binder row for this user" by user_id, not by :binderId,
 *    and use that uuid for binder_photos.binder_id.
 */
async function addPhotos(req, res, next) {
  const workspaceBinderId = req.params.binderId; // e.g. "default-<userId>"

  try {
    const userId = req.user?.id || req.user?.uid || null;

    if (!userId) {
      logger.warn(
        { event: 'binder.add_photos_no_user', workspaceBinderId },
        'addPhotos called without authenticated user'
      );
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    // Raw files from Multer
    const allFiles = Array.isArray(req.files) ? req.files : [];
    if (!allFiles.length) {
      return res.status(400).json({ ok: false, error: 'No files uploaded' });
    }

    // Server-side image filter (aligns with router + dashboard.js)
    const safeFiles = allFiles.filter(isAllowedImageUpload);

    if (!safeFiles.length) {
      logger.warn(
        {
          event: 'binder.add_photos.rejected_non_images',
          workspaceBinderId,
          userId,
          totalSelected: allFiles.length
        },
        'Binder upload rejected: no valid image files'
      );
      return res.status(400).json({
        ok: false,
        error: 'Only image files (JPG, PNG, HEIC, WEBP, AVIF) are allowed.'
      });
    }

    if (safeFiles.length < allFiles.length) {
      logger.warn(
        {
          event: 'binder.add_photos.partial_non_images',
          workspaceBinderId,
          userId,
          totalSelected: allFiles.length,
          accepted: safeFiles.length
        },
        'Binder upload: some non-image files were rejected'
      );
    }

    logger.info(
      {
        event: 'binder.add_photos_start',
        workspaceBinderId,
        userId,
        fileCount: safeFiles.length
      },
      'Starting binder photo upload'
    );

    if (!supabaseAdmin) {
      const err = new Error('Supabase admin client not initialized');
      err.status = 503;
      throw err;
    }

    // -----------------------------------------------------------------------
    // 1) Resolve the REAL binder row for this user (DB uuid id)
    //    We treat the URL :binderId as a UI/workspace id, not as binders.id.
    // -----------------------------------------------------------------------
    let binderRow = null;

    const { data: existingBinder, error: binderSelectErr } = await supabaseAdmin
      .from('binders')
      .select('id, user_id, title')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (binderSelectErr) {
      logger.error(
        {
          event: 'binder.lookup_failed',
          workspaceBinderId,
          userId,
          code: binderSelectErr.code,
          error: binderSelectErr.message
        },
        'Binder lookup by user_id failed before upload'
      );
      throw binderSelectErr;
    }

    if (existingBinder) {
      binderRow = existingBinder;
    } else {
      // No binder for this user yet → create a default one
      const { data: createdBinder, error: binderInsertErr } = await supabaseAdmin
        .from('binders')
        .insert({
          user_id: userId,
          title: 'My relationship story binder',
          status: 'draft'
        })
        .select('id, user_id, title')
        .single();

      if (binderInsertErr) {
        logger.error(
          {
            event: 'binder.create_default_failed',
            workspaceBinderId,
            userId,
            error: binderInsertErr.message,
            code: binderInsertErr.code
          },
          'Failed to create default binder for user before upload'
        );
        throw binderInsertErr;
      }

      binderRow = createdBinder;
    }

    const binderDbId = binderRow.id;

    logger.info(
      {
        event: 'binder.lookup_ok',
        workspaceBinderId,
        binderDbId,
        userId
      },
      'Binder resolved for photo upload'
    );

    // Extra ownership check in app code (should always match)
    if (binderRow.user_id && binderRow.user_id !== userId) {
      logger.warn(
        {
          event: 'binder.not_owned',
          workspaceBinderId,
          binderDbId,
          userId,
          binderUserId: binderRow.user_id
        },
        'User tried to upload photos to binder they do not own'
      );
      return res.status(404).json({ ok: false, error: 'Binder not found' });
    }

    // -----------------------------------------------------------------------
    // 2) Upload each file via saveBinderPhoto and record in binder_photos
    //    IMPORTANT:
    //      - For storage/S3 path we keep using workspaceBinderId (string).
    //      - For DB binder_photos.binder_id we use binderDbId (uuid).
    // -----------------------------------------------------------------------
    const uploaded = [];

    for (const file of safeFiles) {
      logger.info(
        {
          event: 'binder.photo_upload_begin',
          workspaceBinderId,
          binderDbId,
          userId,
          originalname: file.originalname,
          sizeBytes: file.size,
          mimeType: file.mimetype
        },
        'Starting upload for single binder photo'
      );

      // For storage paths and later substring checks in binderRoutes,
      // we keep the workspace binder id in the key (e.g. "default-<userId>").
      const storageResult = await saveBinderPhoto({
        userId,
        binderId: workspaceBinderId || binderDbId,
        file
      });

      logger.info(
        {
          event: 'binder.photo_storage_ok',
          workspaceBinderId,
          binderDbId,
          userId,
          storageKey: storageResult.storageKey,
          provider: storageResult.provider,
          bucket: storageResult.bucket,
          sizeBytes: storageResult.sizeBytes,
          mimeType: storageResult.mimeType
        },
        'Binder photo stored in provider'
      );

      // Insert metadata row in binder_photos with the REAL uuid binder id
      const { data: photoRows, error: photoErr } = await supabaseAdmin
        .from('binder_photos')
        .insert({
          binder_id: binderDbId, // <<< uuid FK to binders(id)
          user_id: userId,
          storage_key: storageResult.storageKey,
          original_filename: storageResult.originalFilename,
          mime_type: storageResult.mimeType,
          size_bytes: storageResult.sizeBytes,
          status: 'stored'
        })
        .select('id, created_at')
        .limit(1);

      if (photoErr) {
        logger.error(
          {
            event: 'binder.photo_insert_failed',
            workspaceBinderId,
            binderDbId,
            userId,
            storageKey: storageResult.storageKey,
            error: photoErr.message,
            code: photoErr.code
          },
          'Failed to insert binder_photos row'
        );
        throw photoErr;
      }

      const inserted = Array.isArray(photoRows) && photoRows[0] ? photoRows[0] : null;

      logger.info(
        {
          event: 'binder.photo_db_insert_ok',
          workspaceBinderId,
          binderDbId,
          userId,
          storageKey: storageResult.storageKey,
          photoId: inserted?.id || null
        },
        'Binder photo metadata inserted into DB'
      );

      // Shape JSON for client (dashboard.js expects storageKey + optional URLs)
      uploaded.push({
        storageKey: storageResult.storageKey,
        originalname: storageResult.originalFilename,
        mimetype: storageResult.mimeType,
        size: storageResult.sizeBytes,
        provider: storageResult.provider,
        bucket: storageResult.bucket,
        publicUrl: storageResult.publicUrl || null,
        signedUrl: storageResult.signedUrl || null
      });
    }

    logger.info(
      {
        event: 'binder.photos_uploaded',
        workspaceBinderId,
        binderDbId,
        userId,
        count: uploaded.length
      },
      'Binder photos uploaded successfully'
    );

    return res.json({
      ok: true,
      // For the front-end we keep returning the workspace id so nothing breaks.
      binderId: workspaceBinderId || binderDbId,
      uploadedCount: uploaded.length,
      photos: uploaded
    });
  } catch (err) {
    logger.error(
      {
        event: 'binder.add_photos_failed',
        workspaceBinderId,
        error: err.message,
        stack: err.stack,
        userId: req.user?.id || req.user?.uid || null
      },
      'Binder addPhotos handler failed'
    );
    return next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/export
 * Generate a simple PDF as a proof-of-life for the pipeline
 */
function exportPdf(req, res, next) {
  const { binderId } = req.params;

  try {
    const doc = new PDFDocument({ autoFirstPage: true });

    // Set download headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="relationship-binder-${binderId || 'draft'}.pdf"`
    );

    // Stream PDF directly to response
    doc.pipe(res);

    // Simple placeholder PDF content for now
    doc.fontSize(22).text('Relationship Evidence Binder (Draft)', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text(`Binder ID: ${binderId || 'N/A'}`);
    if (req.user?.email) {
      doc.text(`Owner email: ${req.user.email}`);
    } else if (req.user?.id) {
      doc.text(`Owner user ID: ${req.user.id}`);
    }
    doc.moveDown();

    doc.fontSize(12).text(
      'This is a temporary PDF export to prove that the binder engine is wired up. ' +
      'Next steps will add:'
    );
    doc.moveDown();
    doc.list([
      'Cover page with title and hero couple photo',
      'Chronological pages with photos and captions',
      'Layout tuned for USCIS-style submissions',
      'Clear disclaimer that this is not legal or immigration advice'
    ]);

    doc.end();

    logger.info(
      {
        event: 'binder.pdf_exported',
        binderId,
        userId: req.user?.id
      },
      'Binder PDF exported (placeholder)'
    );
  } catch (err) {
    logger.error(
      { event: 'binder.export_failed', error: err.message, binderId, userId: req.user?.id },
      'Binder exportPdf handler failed'
    );
    next(err);
  }
}

module.exports = {
  list,
  newForm,
  create,
  addPhotos,
  exportPdf
};