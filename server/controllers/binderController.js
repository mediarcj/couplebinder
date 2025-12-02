// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: Minimal "wire-up" version so routes load and respond safely

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

/**
 * GET /dashboard/binder
 * List binders for the current user (placeholder)
 */
function list(req, res, next) {
  try {
    // Later: load binders from Supabase using req.user.id
    return res.send(
      'Binder list placeholder – routes are wired, UI and storage come next.'
    );
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
 * Show "new binder" builder UI (placeholder)
 */
function newForm(req, res, next) {
  try {
    // Later: render an EJS view like res.render('binder/new', model)
    return res.send(
      'Binder builder placeholder – UI canvas and upload controls come next.'
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
 * Create a new binder record (placeholder)
 */
function create(req, res, next) {
  try {
    const { title } = req.body || {};

    // Later: insert binder into Supabase and return real ID
    const binderId = `binder_${Date.now()}`;

    logger.info(
      {
        event: 'binder.created',
        binderId,
        userId: req.user?.id,
        title: title || 'Untitled binder'
      },
      'Binder created (placeholder)'
    );

    return res.status(201).json({
      ok: true,
      binderId,
      title: title || 'Untitled binder',
      message: 'Binder created (placeholder – not persisted yet)'
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
 * Accept uploaded photos (via multer) – placeholder
 */
async function addPhotos(req, res, next) {
  try {
    const { binderId } = req.params;
    const files = req.files || [];

    logger.info(
      {
        event: 'binder.photos_uploaded',
        binderId,
        userId: req.user?.id,
        count: files.length
      },
      'Binder photos upload (placeholder)'
    );

    // Later: persist file metadata (paths, order, captions) in Supabase.
    return res.json({
      ok: true,
      binderId,
      uploadedCount: files.length,
      files: files.map(f => ({
        fieldname: f.fieldname,
        originalname: f.originalname,
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.size
      })),
      message: 'Photos accepted (placeholder – not yet linked to a real binder record)'
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

    // Very simple placeholder PDF content for now
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
      'In the next steps, we will add:'
    );
    doc.moveDown();
    doc.list([
      'Cover page with title + hero couple photo',
      'Chronological pages with photos and captions',
      'Clean layout tuned for USCIS-style submissions',
      'Safe disclaimer that this is not legal or immigration advice'
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
  exportPdf,
};