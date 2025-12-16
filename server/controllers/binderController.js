// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: DB-backed version (uses Supabase tables + S3/local uploads)

'use strict';

const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { supabase } = require('../utils/supabaseClient'); // kept for future use
const { saveBinderPhoto, getBinderPhotoBuffer } = require('../services/storageProvider');
const { validateCaptionServerSide } = require('../middleware/security');

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
 * WHAT:
 * Resolve workspace ID (default-{userId}) to real binder UUID, or return existing UUID.
 * Creates binder if missing for workspace IDs.
 */
async function resolveBinder({ client, userId, binderIdParam, createIfMissing = true }) {
  if (!binderIdParam || !userId) {
    const err = new Error('Missing binderId or userId');
    err.status = 400;
    throw err;
  }

  // Case 1: Workspace ID (default-{userId})
  if (binderIdParam.startsWith('default-')) {
    const { data: existingBinder, error: binderSelectErr } = await client
      .from('binders')
      .select('id, user_id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (binderSelectErr) {
      logger.error(
        {
          event: 'binder.resolve.lookup_failed',
          binderId: binderIdParam,
          userId,
          error: binderSelectErr.message
        },
        'Binder lookup by user_id failed'
      );
      const err = new Error('Unable to resolve binder');
      err.status = 500;
      throw err;
    }

    if (existingBinder) {
      return { binder: existingBinder, binderId: existingBinder.id };
    }

    // No binder exists - create one if allowed
    if (!createIfMissing) {
      const err = new Error('Binder not found');
      err.status = 404;
      throw err;
    }

    const { data: createdBinder, error: binderInsertErr } = await client
      .from('binders')
      .insert({
        user_id: userId,
        title: 'My relationship story binder',
        status: 'draft'
      })
      .select('id, user_id, title, created_at, updated_at')
      .single();

    if (binderInsertErr) {
      logger.error(
        {
          event: 'binder.resolve.create_failed',
          binderId: binderIdParam,
          userId,
          error: binderInsertErr.message
        },
        'Failed to create default binder'
      );
      const err = new Error('Unable to create binder');
      err.status = 500;
      throw err;
    }

    return { binder: createdBinder, binderId: createdBinder.id };
  }

  // Case 2: Real UUID - verify ownership
  const { data: binderRow, error: binderErr } = await client
    .from('binders')
    .select('id, user_id, title, created_at, updated_at')
    .eq('id', binderIdParam)
    .eq('user_id', userId)
    .maybeSingle();

  if (binderErr) {
    logger.error(
      {
        event: 'binder.resolve.query_failed',
        binderId: binderIdParam,
        userId,
        error: binderErr.message
      },
      'Binder query failed'
    );
    const err = new Error('Unable to resolve binder');
    err.status = 500;
    throw err;
  }

  if (!binderRow) {
    const err = new Error('Binder not found');
    err.status = 404;
    throw err;
  }

  return { binder: binderRow, binderId: binderRow.id };
}

const SECTION_DEFS = {
  overview: { label: 'Our Story Overview', prefix: 'O' },
  photos: { label: 'Photos Together', prefix: 'P' },
  trips: { label: 'Trips & Visits', prefix: 'T' },
  family: { label: 'Family & Friends', prefix: 'F' },
  chats: { label: 'Screenshots & Chats', prefix: 'C' },
  receipts: { label: 'Receipts / Support / Financial', prefix: 'R' }
};

// Logical layout space: Actual A4 at 96 DPI (web standard)
// A4: 210mm × 297mm = 8.27" × 11.69" = 794px × 1122px at 96 DPI
const LAYOUT_LOGICAL_WIDTH = 794; // Actual A4 width at 96 DPI
const LAYOUT_LOGICAL_HEIGHT = 1122; // Actual A4 height at 96 DPI

const mmToPt = (v) => (v / 25.4) * 72; // pdfkit uses points

// -----------------------------------------------------------------------------
// Image fetch for PDF export (updated to use getBinderPhotoBuffer)
// -----------------------------------------------------------------------------
async function fetchImageBufferForLayer(layer) {
  // Prefer storageKey; use the storageProvider to grab bytes directly from S3/local
  if (layer?.storageKey) {
    try {
      const { buffer } = await getBinderPhotoBuffer(layer.storageKey);
      if (buffer && buffer.length > 0) return buffer;
    } catch (err) {
      logger.warn(
        {
          event: 'binder.pdf.image_fetch_failed',
          storageKey: layer.storageKey,
          error: err.message
        },
        'Failed to fetch image buffer for layer via storageProvider'
      );
    }
  }
  return null;
}

async function renderBinderPageBody({
  doc,
  pageLayout,
  exhibitInfo,
  binderTitle,
  totalPages,
  contentPageNumber,
  marginPt = mmToPt(18),
  client = null,
  userId = null,
  binderId = null,
  captionByStorageKey = null
}) {
  const sectionDef = SECTION_DEFS[pageLayout.sectionKey] || SECTION_DEFS.photos;
  const exhibitCode = exhibitInfo
    ? `${(SECTION_DEFS[exhibitInfo.sectionKey] || sectionDef).prefix}-${exhibitInfo.exhibitNo}`
    : `${sectionDef.prefix}-1`;

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - marginPt * 2;
  const contentHeight = pageHeight - marginPt * 2;

  const scale = Math.min(contentWidth / LAYOUT_LOGICAL_WIDTH, contentHeight / LAYOUT_LOGICAL_HEIGHT);

  const surfaceWidth = LAYOUT_LOGICAL_WIDTH * scale;
  const surfaceHeight = LAYOUT_LOGICAL_HEIGHT * scale;

  const baseX = marginPt + (contentWidth - surfaceWidth) / 2;
  const baseY = marginPt;

  // Header
  doc.fontSize(10).text(
    `${sectionDef.label} · Exhibit ${exhibitCode} · Page ${contentPageNumber} of ${totalPages}`,
    { align: 'center' }
  );
  doc.moveDown(0.5);
  doc
    .fontSize(12)
    .text(binderTitle ? `Couplebinder – ${binderTitle}` : 'Couplebinder', { align: 'center' });
  doc.moveDown(0.5);

  // Page surface
  doc.save().rect(baseX, baseY, surfaceWidth, surfaceHeight).fill('#ffffff').stroke('#dddddd').restore();

  // Layers
  const layers = (pageLayout.layers || []).slice().sort((a, b) => {
    const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
    const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
    return za - zb;
  });

  // Process layers sequentially
  for (const layer of layers) {
    try {
      const x = Number(layer.x) || 0;
      const y = Number(layer.y) || 0;
      const w = Number(layer.width) || 0;
      const h = Number(layer.height) || 0;

      if (w <= 0 || h <= 0) continue;

      const pdfX = baseX + x * scale;
      const pdfY = baseY + y * scale;
      const pdfW = w * scale;
      const pdfH = h * scale;

      if (layer.type === 'photo') {
        // Get storageKey from layer (preferred) or lookup by photoId
        let layerWithStorageKey = { ...layer };

        if (
          !layerWithStorageKey.storageKey &&
          layerWithStorageKey.photoId &&
          client &&
          userId &&
          binderId
        ) {
          try {
            const { data: photo } = await client
              .from('binder_photos')
              .select('storage_key')
              .eq('id', layerWithStorageKey.photoId)
              .eq('binder_id', binderId)
              .eq('user_id', userId)
              .maybeSingle();

            if (photo && photo.storage_key) {
              layerWithStorageKey.storageKey = photo.storage_key;
            }
          } catch (lookupErr) {
            logger.warn(
              {
                event: 'binder.pdf.photo_lookup_failed',
                layerId: layer.id,
                photoId: layerWithStorageKey.photoId,
                error: lookupErr.message
              },
              'Failed to lookup photo storageKey'
            );
          }
        }

        // Reserve space for caption at bottom of photo tile
        const maxCaptionFrac = 0.22;
        const maxCaptionPts = 80;
        const captionBand = Math.min(pdfH * maxCaptionFrac, maxCaptionPts);
        const imgHeight = pdfH - captionBand;
        const imgY = pdfY;

        // Fetch bytes
        const buf = await fetchImageBufferForLayer(layerWithStorageKey);

        if (!buf) {
          doc.save().rect(pdfX, imgY, pdfW, imgHeight).fill('#f3f4f6').stroke('#e5e7eb').restore();
          doc
            .fontSize(9)
            .fillColor('#6b7280')
            .text('Photo unavailable', pdfX + 4, imgY + 4, {
              width: pdfW - 8,
              height: imgHeight - 8
            })
            .fillColor('#000000');
        } else {
          // object-fit: cover
          const img = doc.openImage(buf);
          const scaleByWidth = pdfW / img.width;
          const scaleByHeight = imgHeight / img.height;
          const coverScale = Math.max(scaleByWidth, scaleByHeight);

          const scaledWidth = img.width * coverScale;
          const scaledHeight = img.height * coverScale;

          const drawX = pdfX + (pdfW - scaledWidth) / 2;
          const drawY = imgY + (imgHeight - scaledHeight) / 2;

          doc.save();
          doc.rect(pdfX, imgY, pdfW, imgHeight).clip();
          doc.translate(drawX, drawY);
          doc.scale(coverScale, coverScale);
          doc.image(img, 0, 0, { width: img.width, height: img.height });
          doc.restore();
        }

        // Caption below photo
        let caption = '';
        if (captionByStorageKey && layerWithStorageKey.storageKey) {
          const rawCap = captionByStorageKey.get(layerWithStorageKey.storageKey);
          if (typeof rawCap === 'string') caption = rawCap.trim();
        }

        if (caption) {
          const captionY = imgY + imgHeight + 4;
          const captionHeight = captionBand - 8;

          doc
            .fontSize(9)
            .fillColor('#374151')
            .text(caption, pdfX + 4, captionY, {
              width: pdfW - 8,
              height: captionHeight,
              align: 'center'
            })
            .fillColor('#000000');
        }
      } else if (layer.type === 'text') {
        doc.save().rect(pdfX, pdfY, pdfW, pdfH).fill('#ffffff').stroke('#e5e7eb').restore();
        if (layer.text) {
          doc
            .fontSize(11)
            .fillColor('#111827')
            .text(layer.text, pdfX + 4, pdfY + 4, {
              width: pdfW - 8,
              height: pdfH - 8
            })
            .fillColor('#000000');
        }
      } else {
        doc.save().rect(pdfX, pdfY, pdfW, pdfH).stroke('#e5e7eb').restore();
      }
    } catch (err) {
      logger.warn(
        {
          event: 'binder.pdf.layer_render_failed',
          layerId: layer.id,
          layerType: layer.type,
          error: err.message
        },
        'Failed to render layer in PDF'
      );
    }
  }
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
      logger.error({ event: 'binder.list_query_failed', error: error.message, userId }, 'Binder list query failed');
      const err = new Error('Unable to load binders');
      err.status = 500;
      throw err;
    }

    logger.info({ event: 'binder.list_ok', userId, count: data?.length || 0 }, 'Binder list loaded');

    return res.json({ ok: true, binders: data || [] });
  } catch (err) {
    logger.error({ event: 'binder.list_failed', error: err.message, userId: req.user?.id }, 'Binder list handler failed');
    next(err);
  }
}

/**
 * GET /dashboard/binder/new
 * Show "new binder" builder UI (still placeholder, but wired for future EJS)
 */
function newForm(req, res, next) {
  try {
    return res.send('Binder builder placeholder – DB is wired, UI canvas comes next.');
  } catch (err) {
    logger.error({ event: 'binder.new_form_failed', error: err.message, userId: req.user?.id }, 'Binder newForm handler failed');
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
      .insert({ user_id: userId, title })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) {
      logger.error({ event: 'binder.create_query_failed', error: error.message, userId, title }, 'Binder create insert failed');
      const err = new Error('Unable to create binder');
      err.status = 500;
      throw err;
    }

    logger.info({ event: 'binder.created', binderId: data.id, userId, title: data.title }, 'Binder created');

    return res.status(201).json({
      ok: true,
      binderId: data.id,
      binder: data,
      message: 'Binder created successfully'
    });
  } catch (err) {
    logger.error({ event: 'binder.create_failed', error: err.message, userId: req.user?.id }, 'Binder create handler failed');
    next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/photos
 * Accept uploaded photos (via multer) and persist to storage + binder_photos
 */
async function addPhotos(req, res, next) {
  const workspaceBinderId = req.params.binderId; // e.g. "default-<userId>"

  try {
    const userId = req.user?.id || req.user?.uid || null;

    if (!userId) {
      logger.warn({ event: 'binder.add_photos_no_user', workspaceBinderId }, 'addPhotos called without authenticated user');
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const allFiles = Array.isArray(req.files) ? req.files : [];
    if (!allFiles.length) return res.status(400).json({ ok: false, error: 'No files uploaded' });

    const safeFiles = allFiles.filter(isAllowedImageUpload);

    if (!safeFiles.length) {
      logger.warn(
        { event: 'binder.add_photos.rejected_non_images', workspaceBinderId, userId, totalSelected: allFiles.length },
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
      { event: 'binder.add_photos_start', workspaceBinderId, userId, fileCount: safeFiles.length },
      'Starting binder photo upload'
    );

    if (!supabaseAdmin) {
      const err = new Error('Supabase admin client not initialized');
      err.status = 503;
      throw err;
    }

    // Resolve/create binder row for this user
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
        { event: 'binder.lookup_failed', workspaceBinderId, userId, code: binderSelectErr.code, error: binderSelectErr.message },
        'Binder lookup by user_id failed before upload'
      );
      throw binderSelectErr;
    }

    if (existingBinder) {
      binderRow = existingBinder;
    } else {
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

    logger.info({ event: 'binder.lookup_ok', workspaceBinderId, binderDbId, userId }, 'Binder resolved for photo upload');

    if (binderRow.user_id && binderRow.user_id !== userId) {
      logger.warn(
        { event: 'binder.not_owned', workspaceBinderId, binderDbId, userId, binderUserId: binderRow.user_id },
        'User tried to upload photos to binder they do not own'
      );
      return res.status(404).json({ ok: false, error: 'Binder not found' });
    }

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

      const { data: photoRows, error: photoErr } = await supabaseAdmin
        .from('binder_photos')
        .insert({
          binder_id: binderDbId,
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
        { event: 'binder.photo_db_insert_ok', workspaceBinderId, binderDbId, userId, storageKey: storageResult.storageKey, photoId: inserted?.id || null },
        'Binder photo metadata inserted into DB'
      );

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
      { event: 'binder.photos_uploaded', workspaceBinderId, binderDbId, userId, count: uploaded.length },
      'Binder photos uploaded successfully'
    );

    return res.json({
      ok: true,
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
 * PATCH /dashboard/binder/:binderId/photos/caption
 */
async function updatePhotoCaption(req, res, next) {
  const binderIdParam = req.params.binderId;

  try {
    const { userId, client } = getContext(req);
    const storageKey = (req.body && req.body.storageKey) || '';
    const rawCaption = (req.body && req.body.caption) || '';

    if (!storageKey) {
      return res.status(400).json({ ok: false, message: 'storageKey is required' });
    }

    const { binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    // (kept) pages table load (useful for future response shapes / debugging)
    const { data: pageRows, error: pagesErr } = await client
      .from('pages')
      .select('id, page_number')
      .eq('binder_id', binderId)
      .eq('user_id', userId)
      .order('page_number', { ascending: true });

    if (pagesErr) {
      logger.warn(
        { event: 'binder.pages.load_failed_for_layout', binderId, userId, error: pagesErr.message },
        'Could not load pages table for layout response'
      );
    }

    const pagesByIndex = Array.isArray(pageRows) ? pageRows : [];
    void pagesByIndex; // intentionally unused today

    const { data: photoRow, error: photoErr } = await client
      .from('binder_photos')
      .select('id, caption')
      .eq('binder_id', binderId)
      .eq('storage_key', storageKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (photoErr) {
      logger.error(
        {
          event: 'binder.caption.photo_lookup_failed',
          binderIdParam,
          binderId,
          storageKey,
          userId,
          error: photoErr.message
        },
        'Failed to verify photo ownership before caption update'
      );
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    }

    if (!photoRow) {
      logger.warn({ event: 'binder.caption.photo_not_found', binderIdParam, binderId, storageKey, userId }, 'Photo not found for caption update');
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    }

    const { valid, error, sanitized } = validateCaptionServerSide(rawCaption);

    if (!valid) {
      return res.status(400).json({ ok: false, message: error || 'Invalid caption' });
    }

    const captionToStore = sanitized || null;

    const { error: updateErr } = await client
      .from('binder_photos')
      .update({ caption: captionToStore })
      .eq('id', photoRow.id)
      .eq('user_id', userId);

    if (updateErr) {
      logger.error(
        { event: 'binder.caption.update_failed', binderIdParam, binderId, storageKey, userId, error: updateErr.message },
        'Failed to update binder photo caption'
      );
      return res.status(500).json({ ok: false, message: 'Unable to save caption right now.' });
    }

    logger.info(
      { event: 'binder.caption.updated', binderIdParam, binderId, storageKey, photoId: photoRow.id, userId, hasCaption: !!captionToStore },
      'Binder photo caption updated'
    );

    return res.json({ ok: true, caption: captionToStore || '' });
  } catch (err) {
    logger.error(
      {
        event: 'binder.caption.unhandled_error',
        binderIdParam,
        storageKey: req.body?.storageKey,
        userId: req.user?.id || req.user?.uid || null,
        error: err.message,
        stack: err.stack
      },
      'Unhandled error in updatePhotoCaption'
    );
    return next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/export
 * Generate PDF with index + exhibit labels
 */
async function exportPdf(req, res, next) {
  const binderIdParam = req.params.binderId;

  try {
    const { userId, client } = getContext(req);

    const { binder, binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    const { data: layoutRows, error: layoutErr } = await client
      .from('binder_layouts')
      .select('page_number, layout_json')
      .eq('binder_id', String(binderId))
      .eq('user_id', userId)
      .order('page_number', { ascending: true });

    if (layoutErr) {
      logger.error({ event: 'binder.pdf.layout_query_failed', error: layoutErr.message, binderId, userId }, 'Layout query failed for PDF');
      return res.status(500).json({ ok: false, message: 'Unable to export PDF' });
    }

    const { data: photoRows, error: photosErr } = await client
      .from('binder_photos')
      .select('storage_key, caption')
      .eq('binder_id', binderId)
      .eq('user_id', userId);

    if (photosErr) {
      logger.error({ event: 'binder.pdf.captions_query_failed', binderId, userId, error: photosErr.message }, 'Failed to load binder photo captions for PDF');
    }

    const captionByStorageKey = new Map();
    (photoRows || []).forEach((row) => {
      if (row.storage_key && typeof row.caption === 'string') {
        captionByStorageKey.set(row.storage_key, row.caption);
      }
    });

    let pages = (layoutRows || []).map((row, idx) => {
      const layoutJson = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      return {
        pageIndex: typeof row.page_number === 'number' ? row.page_number - 1 : idx,
        sectionKey: layoutJson?.sectionKey || null,
        layers: layoutJson?.layers || []
      };
    });

    const anySection = pages.some((p) => p.sectionKey);
    pages = pages.map((p, idx) => {
      const sectionKey = p.sectionKey ? p.sectionKey : anySection ? null : idx === 0 ? 'overview' : 'photos';
      return { ...p, sectionKey: sectionKey || 'photos' };
    });

    const contentPages = pages.length;
    const totalPages = contentPages + 1;

    const sectionCounters = {};
    const exhibits = [];
    let current = null;

    pages.forEach((p, idx) => {
      const key = p.sectionKey || 'photos';
      if (!current || current.sectionKey !== key) {
        sectionCounters[key] = (sectionCounters[key] || 0) + 1;
        current = {
          sectionKey: key,
          exhibitNo: sectionCounters[key],
          startContentPage: idx + 2,
          endContentPage: idx + 2
        };
        exhibits.push(current);
      } else {
        current.endContentPage = idx + 2;
      }
    });

    const getExhibitForPage = (contentPageNumber) =>
      exhibits.find((ex) => contentPageNumber >= ex.startContentPage && contentPageNumber <= ex.endContentPage);

    const doc = new PDFDocument({ autoFirstPage: true, size: 'A4', margin: 0 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relationship-binder-${binderId || 'draft'}.pdf"`);

    doc.pipe(res);

    doc.fontSize(20).text('Index', { align: 'center' });
    doc.moveDown(1);

    if (exhibits.length === 0) {
      doc.fontSize(12).text('No pages available.', { align: 'left' });
    } else {
      exhibits.forEach((ex) => {
        const def = SECTION_DEFS[ex.sectionKey] || SECTION_DEFS.photos;
        const code = `${def.prefix}-${ex.exhibitNo}`;
        doc.fontSize(12).text(`Exhibit ${code} – ${def.label} – Pages ${ex.startContentPage}–${ex.endContentPage}`);
      });
    }

    for (let idx = 0; idx < pages.length; idx++) {
      const p = pages[idx];
      doc.addPage();
      const contentPageNumber = idx + 2;
      const exhibit = getExhibitForPage(contentPageNumber);

      await renderBinderPageBody({
        doc,
        pageLayout: p,
        exhibitInfo: exhibit,
        binderTitle: binder.title,
        totalPages,
        contentPageNumber,
        client,
        userId,
        binderId,
        captionByStorageKey
      });
    }

    doc.end();

    logger.info({ event: 'binder.pdf_exported', binderId, userId, pageCount: contentPages }, 'Binder PDF exported with index/exhibits');
  } catch (err) {
    logger.error({ event: 'binder.export_failed', error: err.message, binderId: binderIdParam, userId: req.user?.id }, 'Binder exportPdf handler failed');
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/editor
 * Render binder editor page with React app
 */
async function renderBinderEditor(req, res, next) {
  const binderIdParam = req.params.binderId;

  logger.info(
    { event: 'binder.editor.handler_called', binderId: binderIdParam, path: req.path, method: req.method },
    'Binder editor handler invoked'
  );

  try {
    const { userId, client } = getContext(req);
    let binder = null;

    if (binderIdParam && binderIdParam.startsWith('default-')) {
      const { data: existingBinder, error: binderSelectErr } = await client
        .from('binders')
        .select('id, user_id, title, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (binderSelectErr) {
        logger.error(
          { event: 'binder.editor.lookup_failed_default', binderId: binderIdParam, userId, error: binderSelectErr.message },
          'Binder lookup by user_id failed for editor (workspace id)'
        );
        const err = new Error('Unable to load binder');
        err.status = 500;
        throw err;
      }

      if (existingBinder) {
        binder = existingBinder;
      } else {
        const { data: createdBinder, error: binderInsertErr } = await client
          .from('binders')
          .insert({ user_id: userId, title: 'My relationship story binder', status: 'draft' })
          .select('id, user_id, title, created_at, updated_at')
          .single();

        if (binderInsertErr) {
          logger.error(
            { event: 'binder.editor.create_default_failed', binderId: binderIdParam, userId, error: binderInsertErr.message },
            'Failed to create default binder for editor (workspace id)'
          );
          const err = new Error('Unable to create binder');
          err.status = 500;
          throw err;
        }

        binder = createdBinder;
      }
    } else {
      const { data: binderRow, error: binderErr } = await client
        .from('binders')
        .select('id, user_id, title, created_at, updated_at')
        .eq('id', binderIdParam)
        .eq('user_id', userId)
        .maybeSingle();

      if (binderErr) {
        logger.error({ event: 'binder.editor.lookup_failed', binderId: binderIdParam, userId, error: binderErr.message }, 'Binder lookup failed for editor');
        const err = new Error('Unable to load binder');
        err.status = 500;
        throw err;
      }

      if (!binderRow) {
        logger.warn({ event: 'binder.editor.not_found', binderId: binderIdParam, userId }, 'Binder not found for editor');
        const err = new Error('Binder not found');
        err.status = 404;
        throw err;
      }

      if (binderRow.user_id !== userId) {
        logger.warn(
          { event: 'binder.editor.unauthorized', binderId: binderIdParam, userId, binderUserId: binderRow.user_id },
          'User attempted to access binder editor they do not own'
        );
        const err = new Error('Binder not found');
        err.status = 404;
        throw err;
      }

      binder = binderRow;
    }

    const { buildDashboardPageModel } = require('../ui_contract/presenters');
    const pageModel = await buildDashboardPageModel(req, res);

    pageModel.page = pageModel.page || {};
    pageModel.ui = pageModel.ui || {};

    pageModel.binder = {
      id: binder.id,
      title: binder.title,
      created_at: binder.created_at,
      updated_at: binder.updated_at
    };

    pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
    pageModel.ui.csrfToken = res.locals.csrfToken || pageModel.ui.csrfToken || '';

    logger.info({ event: 'binder.editor.rendered', binderId: binder.id, userId, binderIdParam }, 'Binder editor page rendered');

    res.render('dashboard/binder-editor', pageModel);
  } catch (err) {
    logger.error({ event: 'binder.editor.render_failed', error: err.message, binderId: binderIdParam, userId: req.user?.id }, 'Binder editor render failed');
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/layout
 * Get current layout JSON for a binder
 */
async function getBinderLayout(req, res, next) {
  const binderIdParam = req.params.binderId;

  try {
    const { userId, client } = getContext(req);

    const { binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    // Pull layouts
    const { data: layoutRows, error: layoutErr } = await client
      .from('binder_layouts')
      .select('page_number, layout_json, updated_at')
      .eq('user_id', userId)
      .eq('binder_id', String(binderId))
      .order('page_number', { ascending: true })
      .limit(200);

    if (layoutErr) {
      logger.error({ event: 'binder.layout.get.query_failed', binderId, userId, error: layoutErr.message }, 'Layout query failed');
      return res.status(500).json({ ok: false, message: 'Unable to load layout' });
    }

    // Pull pages table (for stable page ids)
    const { data: pageRows, error: pagesErr } = await client
      .from('pages')
      .select('id, page_number')
      .eq('binder_id', binderId)
      .eq('user_id', userId)
      .order('page_number', { ascending: true });

    if (pagesErr) {
      logger.warn({ event: 'binder.pages.load_failed_for_layout', binderId, userId, error: pagesErr.message }, 'Could not load pages table for layout');
    }

    const pageIdByNumber = {};
    (pageRows || []).forEach((p) => {
      if (p?.page_number && p?.id) pageIdByNumber[Number(p.page_number)] = String(p.id);
    });

    const layout = {
      binderId,
      pages: [],
      updatedAt: new Date().toISOString()
    };

    if (!layoutRows || layoutRows.length === 0) {
      // No saved layout yet: return one empty page WITH a stable id
      const newPageId = crypto.randomUUID();
      layout.pages = [{ id: newPageId, pageId: newPageId, pageIndex: 0, layers: [], sectionKey: 'photos' }];
      return res.json({ ok: true, layout });
    }

    // Collect photoIds needing storage_key lookup
    const photoIdsToLookup = [];
    for (const row of layoutRows) {
      const layoutJson = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      const layers = layoutJson?.layers || [];
      for (const layer of layers) {
        if (layer?.type === 'photo' && layer.photoId && !layer.storageKey) {
          photoIdsToLookup.push(layer.photoId);
        }
      }
    }

    // Build photoId -> storage_key map
    const photoStorageMap = {};
    if (photoIdsToLookup.length > 0) {
      const { data: photos, error: photosErr } = await client
        .from('binder_photos')
        .select('id, storage_key')
        .eq('binder_id', binderId)
        .eq('user_id', userId)
        .in('id', photoIdsToLookup);

      if (photosErr) {
        logger.warn({ event: 'binder.layout.photo_storage_lookup_failed', binderId, userId, error: photosErr.message }, 'Failed to lookup photo storage_keys for layout');
      } else if (photos) {
        for (const p of photos) {
          if (p?.id && p?.storage_key) photoStorageMap[String(p.id)] = p.storage_key;
        }
      }
    }

    // Load captions for all photos in this binder
    const { data: photoRows, error: captionsErr } = await client
      .from('binder_photos')
      .select('storage_key, caption')
      .eq('binder_id', binderId)
      .eq('user_id', userId);

    if (captionsErr) {
      logger.error({ event: 'binder.layout.captions_query_failed', binderId, userId, error: captionsErr.message }, 'Failed to load binder photo captions for layout');
    }

    const captionByStorageKey = new Map();
    (photoRows || []).forEach((row) => {
      if (row.storage_key && typeof row.caption === 'string') {
        captionByStorageKey.set(row.storage_key, row.caption);
      }
    });

    // Build pages from layout rows (and FIX missing pageId issues)
    const pagesNeedingUpsert = [];
    const layoutRowsNeedingPatch = [];

    layout.pages = layoutRows.map((row, idx) => {
      const pageNumber = typeof row.page_number === 'number' ? row.page_number : idx + 1;
      const pageIndex = pageNumber - 1;

      const layoutJsonRaw = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      const layoutJson = layoutJsonRaw && typeof layoutJsonRaw === 'object' ? layoutJsonRaw : {};

      // Stable pageId priority:
      //  1) layout_json.pageId (new)
      //  2) pages table id by page_number (backfill)
      //  3) generate (and upsert into pages + patch layout row)
      let pageId = layoutJson.pageId ? String(layoutJson.pageId) : null;

      if (!pageId && pageIdByNumber[pageNumber]) {
        pageId = String(pageIdByNumber[pageNumber]);
      }

      if (!pageId) {
        pageId = crypto.randomUUID();

        pagesNeedingUpsert.push({
          id: pageId,
          binder_id: binderId,
          user_id: userId,
          page_number: pageNumber
        });

        layoutRowsNeedingPatch.push({
          page_number: pageNumber,
          next_layout_json: { ...layoutJson, pageId }
        });
      }

      const rawLayers = layoutJson.layers || [];
      const layers = rawLayers.map((layer) => {
        let enriched = layer;

        if (enriched?.type === 'photo' && enriched.photoId && !enriched.storageKey) {
          const storageKey = photoStorageMap[String(enriched.photoId)];
          if (storageKey) enriched = { ...enriched, storageKey };
        }

        if (enriched?.type === 'photo' && enriched.storageKey) {
          const cap = captionByStorageKey.get(enriched.storageKey);
          if (typeof cap === 'string' && cap.length > 0) {
            enriched = { ...enriched, caption: cap };
          }
        }

        return enriched;
      });

      return {
        id: pageId,
        pageId,
        pageIndex,
        layers,
        sectionKey: layoutJson.sectionKey || null
      };
    });

    // Backfill persistence (best-effort)
    if (pagesNeedingUpsert.length > 0) {
      const { error: upsertErr } = await client.from('pages').upsert(pagesNeedingUpsert, { onConflict: 'id' });
      if (upsertErr) {
        logger.warn({ event: 'binder.pages.backfill_failed', binderId, userId, error: upsertErr.message }, 'Failed to backfill pages table with generated pageIds');
      }
    }

    for (const patch of layoutRowsNeedingPatch) {
      try {
        const { error: patchErr } = await client
          .from('binder_layouts')
          .update({ layout_json: patch.next_layout_json })
          .eq('user_id', userId)
          .eq('binder_id', String(binderId))
          .eq('page_number', patch.page_number);

        if (patchErr) {
          logger.warn(
            { event: 'binder.layout.backfill_pageid_failed', binderId, userId, pageNumber: patch.page_number, error: patchErr.message },
            'Failed to backfill layout_json.pageId'
          );
        }
      } catch (e) {
        logger.warn(
          { event: 'binder.layout.backfill_pageid_exception', binderId, userId, pageNumber: patch.page_number, error: e.message },
          'Exception while backfilling layout_json.pageId'
        );
      }
    }

    // updatedAt: use newest if possible
    const latestUpdatedAt =
      (layoutRows || [])
        .map((r) => r.updated_at)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null;

    layout.updatedAt = latestUpdatedAt || layout.updatedAt;

    logger.info({ event: 'binder.layout.get.success', binderId, userId, pageCount: layout.pages.length }, 'Layout retrieved successfully');

    return res.json({ ok: true, layout });
  } catch (err) {
    logger.error({ event: 'binder.layout.get.failed', error: err.message, binderId: binderIdParam, userId: req.user?.id }, 'Binder layout get failed');
    next(err);
  }
}

// -----------------------------------------------------------------------------
// Pages order persistence (writes to Supabase "pages" table)
// -----------------------------------------------------------------------------
async function syncPagesTableOrder({ client, userId, binderId, layoutPages }) {
  if (!Array.isArray(layoutPages)) {
    const err = new Error('layoutPages must be an array');
    err.status = 400;
    throw err;
  }

  const incomingIds = layoutPages
    .map((p) => String(p?.pageId || p?.id || p?.page_id || ''))
    .filter(Boolean);

  if (incomingIds.length !== layoutPages.length) {
    const err = new Error('Each page must have a stable pageId/id for reorder');
    err.status = 400;
    throw err;
  }

  // Load ALL existing pages for this binder/user (so we don't collide with "orphan" rows)
  const { data: existingRows, error: existingErr } = await client
    .from('pages')
    .select('id, binder_id, user_id, page_number')
    .eq('binder_id', binderId)
    .eq('user_id', userId)
    .order('page_number', { ascending: true })
    .limit(5000);

  if (existingErr) {
    const err = new Error(`Unable to load pages for reorder: ${existingErr.message || 'unknown error'}`);
    err.status = 500;
    throw err;
  }

  const existing = Array.isArray(existingRows) ? existingRows : [];
  const existingIdSet = new Set(existing.map((r) => String(r.id)));

  // Keep any DB pages that aren't in the incoming list (shouldn't happen, but prevents constraint collisions)
  const incomingSet = new Set(incomingIds);
  const extraIds = existing
    .filter((r) => !incomingSet.has(String(r.id)))
    .map((r) => String(r.id));

  const fullOrder = [...incomingIds, ...extraIds];

  // Safety: verify ownership for any IDs we *think* exist
  for (const row of existing) {
    if (String(row.binder_id) !== String(binderId) || String(row.user_id) !== String(userId)) {
      const err = new Error('Invalid pageId provided (does not belong to this binder)');
      err.status = 400;
      throw err;
    }
  }

  // Choose a temp base above the current max page_number to guarantee no collisions
  const maxPageNumber = existing.reduce((m, r) => {
    const n = Number(r.page_number);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);

  const tempBase = maxPageNumber + 1000;

  // Phase 1: ensure every page in fullOrder exists, and move all to a temp safe range
  // Use upsert so missing page rows get created (no conflict on (binder_id, page_number) because temp is > max)
  const tempRows = fullOrder.map((id, idx) => ({
    id,
    binder_id: binderId,
    user_id: userId,
    page_number: tempBase + idx + 1
  }));

  const { error: tempErr } = await client.from('pages').upsert(tempRows, { onConflict: 'id' });
  if (tempErr) {
    const err = new Error(`Unable to reorder pages (temp step): ${tempErr.message || 'unknown error'}`);
    err.status = 500;
    throw err;
  }

  // Phase 2: write final 1..N numbers (now safe because nothing else uses 1..N anymore)
  const finalRows = fullOrder.map((id, idx) => ({
    id,
    binder_id: binderId,
    user_id: userId,
    page_number: idx + 1
  }));

  const { error: finalErr } = await client.from('pages').upsert(finalRows, { onConflict: 'id' });
  if (finalErr) {
    const err = new Error(`Unable to reorder pages (final step): ${finalErr.message || 'unknown error'}`);
    err.status = 500;
    throw err;
  }

  return {
    pageCount: incomingIds.length,
    usedClientIds: true,
    extraDbPagesAppended: extraIds.length
  };
}

/**
 * POST /dashboard/binder/:binderId/layout/apply
 * Save layout changes to database
 */
async function applyBinderLayout(req, res, next) {
  const binderIdParam = req.params.binderId;

  try {
    const { userId, client } = getContext(req);
    const layout = req.body;

    if (!layout || typeof layout !== 'object') {
      return res.status(400).json({ ok: false, message: 'Invalid layout data' });
    }

    if (!Array.isArray(layout.pages)) {
      return res.status(400).json({ ok: false, message: 'Layout pages must be an array' });
    }

    const { binder, binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: true
    });

    // Normalize pages: ensure pageId exists (so pages table + binder_layouts always store it)
    const normalizedPages = layout.pages.map((page, idx) => {
      const pageId = String(page?.pageId || page?.id || page?.page_id || crypto.randomUUID());
      return {
        ...page,
        pageId,
        id: pageId,
        pageIndex: typeof page.pageIndex === 'number' ? page.pageIndex : idx,
        layers: Array.isArray(page.layers) ? page.layers : [],
        sectionKey: page.sectionKey || null
      };
    });

    // Persist page reorder into Supabase "pages" table (page_number)
    try {
      await syncPagesTableOrder({
        client,
        userId,
        binderId,
        layoutPages: normalizedPages
      });
    } catch (e) {
      const status = e.status || 500;
      logger.error(
        { event: 'binder.pages.reorder_failed', binderId, binderIdParam, userId, error: e.message },
        'Failed to persist page order to pages table'
      );
      return res.status(status).json({ ok: false, message: e.message || 'Unable to reorder pages right now.' });
    }

    // Validate binderId matches if provided in layout
    if (layout.binderId && layout.binderId !== binderIdParam && layout.binderId !== binderId) {
      return res.status(400).json({ ok: false, message: 'Binder ID mismatch' });
    }

    // Delete existing layouts
    const { error: deleteErr } = await client
      .from('binder_layouts')
      .delete()
      .eq('user_id', userId)
      .eq('binder_id', String(binderId));

    if (deleteErr) {
      logger.error({ event: 'binder.layout.apply.delete_failed', binderId, userId, error: deleteErr.message }, 'Failed to delete existing layouts');
      return res.status(500).json({ ok: false, message: 'Unable to save layout' });
    }

    // Insert new layouts (one row per page)
    const layoutRows = normalizedPages.map((page, idx) => ({
      user_id: userId,
      binder_id: String(binderId),
      page_number: idx + 1,
      layout_json: {
        pageId: page.pageId,
        layers: page.layers || [],
        sectionKey: page.sectionKey || null
      }
    }));

    if (layoutRows.length > 0) {
      const { error: insertErr } = await client.from('binder_layouts').insert(layoutRows);
      if (insertErr) {
        logger.error({ event: 'binder.layout.apply.insert_failed', binderId, userId, error: insertErr.message }, 'Failed to insert new layouts');
        return res.status(500).json({ ok: false, message: 'Unable to save layout' });
      }
    }

    await client
      .from('binders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', binderId)
      .eq('user_id', userId);

    const updatedAt = new Date().toISOString();

    logger.info({ event: 'binder.layout.apply.success', binderId: binder.id, userId, pageCount: normalizedPages.length }, 'Layout saved successfully');

    // Keep response backward compatible, but include pageIds so client can sync if it needs to
    return res.json({
      ok: true,
      updatedAt,
      pageIds: normalizedPages.map((p) => p.pageId)
    });
  } catch (err) {
    logger.error({ event: 'binder.layout.apply.failed', error: err.message, binderId: binderIdParam, userId: req.user?.id }, 'Binder layout apply failed');
    next(err);
  }
}

function safeJsonParse(v) {
  try {
    return JSON.parse(v);
  } catch (_) {
    return null;
  }
}

module.exports = {
  list,
  newForm,
  create,
  addPhotos,
  updatePhotoCaption,
  exportPdf,
  renderBinderEditor,
  getBinderLayout,
  applyBinderLayout,
  resolveBinder
};