// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: First DB-backed version (uses Supabase tables + local temp uploads)

'use strict';

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');

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
          userId,
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
        count: data?.length || 0,
      },
      'Binder list loaded'
    );

    // For now, just return JSON so you can see real rows.
    // Later we can render an EJS template instead.
    return res.json({
      ok: true,
      binders: data || [],
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
        title,
      })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) {
      logger.error(
        {
          event: 'binder.create_query_failed',
          error: error.message,
          userId,
          title,
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
        title: data.title,
      },
      'Binder created'
    );

    return res.status(201).json({
      ok: true,
      binderId: data.id,
      binder: data,
      message: 'Binder created successfully',
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
 * Accept uploaded photos (via multer) and persist metadata
 *
 * Assumptions:
 *  - Multer is configured in binderRoutes to write files under a temp root
 *    like /tmp/couplebinder/binder-photos.
 *  - DB table: binder_photos with at least:
 *      id (uuid, default),
 *      binder_id (uuid),
 *      user_id (uuid),
 *      storage_key (text),
 *      original_filename (text),
 *      mime_type (text),
 *      size_bytes (bigint),
 *      position (int),
 *      created_at (timestamptz)
 */
async function addPhotos(req, res, next) {
  try {
    const { binderId } = req.params;
    const { userId, client } = getContext(req);
    const files = Array.isArray(req.files) ? req.files : [];

    if (!binderId) {
      const err = new Error('Missing binderId');
      err.status = 400;
      throw err;
    }

    if (!files.length) {
      return res.status(400).json({
        ok: false,
        message: 'No files uploaded',
      });
    }

    // Optional: cheap existence check for binder
    const { data: binder, error: binderErr } = await client
      .from('binders')
      .select('id, user_id')
      .eq('id', binderId)
      .eq('user_id', userId)
      .single();

    if (binderErr || !binder) {
      logger.warn(
        {
          event: 'binder.add_photos_binder_missing',
          binderId,
          userId,
          error: binderErr?.message,
        },
        'Binder not found or not owned by user when uploading photos'
      );
      const err = new Error('Binder not found');
      err.status = 404;
      throw err;
    }

    // Build rows for binder_photos
    const rows = files.map((f, index) => ({
      binder_id: binderId,
      user_id: userId,
      storage_key: f.path,            // local temp path for now (will be replaced by S3 key later)
      original_filename: f.originalname,
      mime_type: f.mimetype,
      size_bytes: f.size,
      position: index + 1,           // simple incremental order; later we can pass from client
    }));

    const { data, error } = await client
      .from('binder_photos')
      .insert(rows)
      .select('id, binder_id, storage_key, original_filename, mime_type, size_bytes, position, created_at');

    if (error) {
      logger.error(
        {
          event: 'binder.add_photos_insert_failed',
          error: error.message,
          binderId,
          userId,
          fileCount: files.length,
        },
        'Binder photo insert failed'
      );
      const err = new Error('Unable to save photo metadata');
      err.status = 500;
      throw err;
    }

    logger.info(
      {
        event: 'binder.photos_uploaded',
        binderId,
        userId,
        count: files.length,
      },
      'Binder photos uploaded and stored'
    );

    return res.json({
      ok: true,
      binderId,
      uploadedCount: files.length,
      photos: data || [],
      message: 'Photos saved for binder',
    });
  } catch (err) {
    logger.error(
      { event: 'binder.add_photos_failed', error: err.message, userId: req.user?.id },
      'Binder addPhotos handler failed'
    );
    next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/export
 * Generate a simple PDF as a proof-of-life for the pipeline
 *
 * For now this does NOT query photos; it just proves the export path works.
 * Later we will:
 *   - Load binder + photos from Supabase
 *   - Render a proper multi-page PDF with images and captions
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
      'Clear disclaimer that this is not legal or immigration advice',
    ]);

    doc.end();

    logger.info(
      {
        event: 'binder.pdf_exported',
        binderId,
        userId: req.user?.id,
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
  exportPdf,
};