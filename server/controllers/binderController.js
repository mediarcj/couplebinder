// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: First DB-backed version (uses Supabase tables + local temp uploads)

'use strict';

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { supabase } = require('../utils/supabaseClient');
const { saveBinderPhoto } = require('../services/storageProvider');

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

/**
 * POST /dashboard/binder/:binderId/photos
 * Accept uploaded photos, push to storage (S3/local), and record metadata.
 */
async function addPhotos(req, res, next) {
  const { binderId } = req.params;
  const userId = req.user?.id || null;
  const files = req.files || [];

  try {
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    if (!supabase) {
      logger.error(
        { event: 'binder.add_photos_no_supabase', binderId, userId },
        'Supabase client not available in addPhotos'
      );
      return res.status(503).json({ ok: false, error: 'Storage temporarily unavailable' });
    }

    if (!binderId) {
      return res.status(400).json({ ok: false, error: 'Missing binderId' });
    }

    if (!files.length) {
      return res.status(400).json({ ok: false, error: 'No files uploaded' });
    }

    // 1) Ensure binder exists and belongs to this user
    const { data: binders, error: binderErr } = await supabase
      .from('binders')
      .select('id')
      .eq('id', binderId)
      .eq('user_id', userId);

    if (binderErr) {
      logger.error(
        {
          event: 'binder.add_photos_binder_query_failed',
          binderId,
          userId,
          error: binderErr.message
        },
        'Failed to fetch binder in addPhotos'
      );
      return res.status(500).json({ ok: false, error: 'Could not verify binder' });
    }

    if (!binders || binders.length === 0) {
      return res.status(404).json({ ok: false, error: 'Binder not found' });
    }

    // 2) Save each file via the storage provider (S3/local)
    const stored = [];
    for (const [index, file] of files.entries()) {
      const result = await saveBinderPhoto({ userId, binderId, file });
      stored.push({ index, file, result });
    }

    // 3) Insert rows into binder_photos
    const rowsToInsert = stored.map(({ index, file, result }) => ({
      binder_id: binderId,
      user_id: userId,
      storage_provider: result.provider,
      storage_key: result.storageKey,
      original_filename: result.originalFilename,
      mime_type: result.mimeType,
      size_bytes: result.sizeBytes,
      sort_order: index
      // caption, created_at, updated_at use defaults/nulls for now
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from('binder_photos')
      .insert(rowsToInsert)
      .select('*');

    if (insertErr) {
      logger.error(
        {
          event: 'binder.add_photos_insert_failed',
          binderId,
          userId,
          error: insertErr.message
        },
        'Failed to insert binder_photos rows'
      );
      return res.status(500).json({ ok: false, error: 'Could not save photos' });
    }

    logger.info(
      {
        event: 'binder.photos_uploaded',
        binderId,
        userId,
        count: inserted.length
      },
      'Binder photos uploaded and recorded'
    );

    return res.json({
      ok: true,
      binderId,
      count: inserted.length,
      photos: inserted
    });
  } catch (err) {
    logger.error(
      {
        event: 'binder.add_photos_failed',
        binderId,
        userId,
        error: err.message
      },
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