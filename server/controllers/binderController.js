// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: DB-backed version (uses Supabase tables + S3/local uploads)

'use strict';

const crypto = require('crypto');
const PDFDocument = require('pdfkit');

const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { validateCaptionServerSide } = require('../middleware/security');
const { buildDashboardPageModel } = require('../ui_contract/presenters');
const {
  validateAndNormalizeLayout,
  assertOwnedPhotoReferences
} = require('../services/binderLayoutValidator');

// Storage provider (safe-load so the app can boot even if not configured)
let storageProvider = null;
try {
  storageProvider = require('../services/storageProvider');
} catch (err) {
  logger.warn(
    { event: 'binder.storage_provider_unavailable', error: err.message },
    'Storage provider module not found; binder uploads/export image fetch may fail until configured'
  );
}

// -----------------------------------------------------------------------------
// Shared server-side image validation (aligns with dashboard.js client filtering)
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

function getUserIdFromReq(req) {
  return (req.user && (req.user.id || req.user.uid)) || null;
}

/**
 * Small helper: ensure we have a logged-in user and a Supabase admin client.
 */
function getContext(req) {
  const userId = getUserIdFromReq(req);

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

  const binderIdStr = String(binderIdParam);

  // Case 1: Workspace ID (default-{userId})
  if (binderIdStr.startsWith('default-')) {
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
          binderId: binderIdStr,
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
          binderId: binderIdStr,
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
    .eq('id', binderIdStr)
    .eq('user_id', userId)
    .maybeSingle();

  if (binderErr) {
    logger.error(
      {
        event: 'binder.resolve.query_failed',
        binderId: binderIdStr,
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

// -----------------------------------------------------------------------------

const SECTION_DEFS = {
  overview: { label: 'Our Story Overview', prefix: 'O' },
  photos: { label: 'Photos Together', prefix: 'P' },
  trips: { label: 'Trips & Visits', prefix: 'T' },
  family: { label: 'Family & Friends', prefix: 'F' },
  chats: { label: 'Screenshots & Chats', prefix: 'C' },
  receipts: { label: 'Receipts / Support / Financial', prefix: 'R' }
};

// A4 at 96 DPI
const LAYOUT_LOGICAL_WIDTH = 794;
const LAYOUT_LOGICAL_HEIGHT = 1122;

// Must match client CAPTION_H (binder-editor React app)
const CAPTION_LOGICAL_PX = 88;

// -----------------------------------------------------------------------------
// Image fetch for PDF export (uses storageProvider.getBinderPhotoBuffer if present)
// -----------------------------------------------------------------------------
async function fetchImageBufferForLayer(layer) {
  if (!layer?.storageKey) return null;
  if (!storageProvider || typeof storageProvider.getBinderPhotoBuffer !== 'function') return null;

  try {
    const { buffer } = await storageProvider.getBinderPhotoBuffer(layer.storageKey);
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
  return null;
}

async function renderBinderPageBody({
  doc,
  pageLayout,
  exhibitInfo,
  binderTitle,
  totalPages,
  contentPageNumber,
  marginPt = 0,
  client = null,
  userId = null,
  binderId = null,
  captionByStorageKey = null
}) {
  const sectionDef = SECTION_DEFS[pageLayout.sectionKey] || SECTION_DEFS.photos;
  const exhibitCode = exhibitInfo
    ? `${(SECTION_DEFS[exhibitInfo.sectionKey] || sectionDef).prefix}-${exhibitInfo.exhibitNo}`
    : `${sectionDef.prefix}-1`;

  void exhibitCode;
  void binderTitle;
  void totalPages;
  void contentPageNumber;
  void marginPt;

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  const contentWidth = pageWidth;
  const contentHeight = pageHeight;

  const scale = Math.min(contentWidth / LAYOUT_LOGICAL_WIDTH, contentHeight / LAYOUT_LOGICAL_HEIGHT);

  const surfaceWidth = LAYOUT_LOGICAL_WIDTH * scale;
  const surfaceHeight = LAYOUT_LOGICAL_HEIGHT * scale;

  const baseX = (contentWidth - surfaceWidth) / 2;
  const baseY = (contentHeight - surfaceHeight) / 2;

  doc.save().rect(baseX, baseY, surfaceWidth, surfaceHeight).fill('#ffffff').stroke('#dddddd').restore();

  const layers = (pageLayout.layers || []).slice().sort((a, b) => {
    const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
    const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
    return za - zb;
  });

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
        let layerWithStorageKey = { ...layer };

        if (!layerWithStorageKey.storageKey && layerWithStorageKey.photoId && client && userId && binderId) {
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

        const captionBand = Math.min(pdfH, CAPTION_LOGICAL_PX * scale);
        const imgHeight = pdfH - captionBand;
        const imgY = pdfY;

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

    return res.json({ ok: true, binders: data || [] });
  } catch (err) {
    logger.error({ event: 'binder.list_failed', error: err.message, userId: getUserIdFromReq(req) }, 'Binder list handler failed');
    next(err);
  }
}

/**
 * GET /dashboard/binder/new
 */
function newForm(req, res, next) {
  try {
    return res.send('Binder builder placeholder – DB is wired, UI canvas comes next.');
  } catch (err) {
    logger.error({ event: 'binder.new_form_failed', error: err.message, userId: getUserIdFromReq(req) }, 'Binder newForm handler failed');
    next(err);
  }
}

/**
 * POST /dashboard/binder
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

    return res.status(201).json({
      ok: true,
      binderId: data.id,
      binder: data,
      message: 'Binder created successfully'
    });
  } catch (err) {
    logger.error({ event: 'binder.create_failed', error: err.message, userId: getUserIdFromReq(req) }, 'Binder create handler failed');
    next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/photos
 */
async function addPhotos(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');

  try {
    const { userId, client } = getContext(req);

    if (!storageProvider || typeof storageProvider.saveBinderPhoto !== 'function') {
      const err = new Error('Photo storage is not configured');
      err.status = 503;
      throw err;
    }

    const allFiles = Array.isArray(req.files) ? req.files : [];
    if (!allFiles.length) return res.status(400).json({ ok: false, error: 'No files uploaded' });

    const safeFiles = allFiles.filter(isAllowedImageUpload);
    if (!safeFiles.length) {
      return res.status(400).json({
        ok: false,
        error: 'Only image files (JPG, PNG, HEIC, WEBP, AVIF) are allowed.'
      });
    }

    // Resolve/create binder row based on URL binderId
    const { binder, binderId: binderUuid } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: true
    });

    const uploaded = [];

    for (const file of safeFiles) {
      const storageResult = await storageProvider.saveBinderPhoto({
        userId,
        binderId: binderUuid, // IMPORTANT: store under real binder UUID
        file
      });

      const { data: photoRows, error: photoErr } = await client
        .from('binder_photos')
        .insert({
          binder_id: binderUuid,
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
            binderIdParam,
            binderUuid,
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

      uploaded.push({
        storageKey: storageResult.storageKey,
        originalname: storageResult.originalFilename,
        mimetype: storageResult.mimeType,
        size: storageResult.sizeBytes,
        provider: storageResult.provider,
        bucket: storageResult.bucket,
        publicUrl: storageResult.publicUrl || null,
        signedUrl: storageResult.signedUrl || null,
        photoId: inserted?.id || null
      });
    }

    return res.json({
      ok: true,
      // Keep the response binderId compatible with the caller (legacy dashboard uses URL param)
      binderId: binderIdParam,
      binderUuid,
      binder: {
        id: binderUuid,
        title: binder?.title || '',
        created_at: binder?.created_at || null,
        updated_at: binder?.updated_at || null
      },
      uploadedCount: uploaded.length,
      photos: uploaded
    });
  } catch (err) {
    logger.error(
      {
        event: 'binder.add_photos_failed',
        binderIdParam,
        error: err.message,
        stack: err.stack,
        userId: getUserIdFromReq(req)
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
  const binderIdParam = String(req.params.binderId || '');

  try {
    const { userId, client } = getContext(req);
    const storageKey = String((req.body && req.body.storageKey) || '');
    const rawCaption = String((req.body && req.body.caption) || '');

    if (!storageKey) {
      return res.status(400).json({ ok: false, message: 'storageKey is required' });
    }

    const { binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

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

    return res.json({ ok: true, caption: captionToStore || '' });
  } catch (err) {
    logger.error(
      {
        event: 'binder.caption.unhandled_error',
        binderIdParam,
        storageKey: req.body?.storageKey,
        userId: getUserIdFromReq(req),
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
 */
async function exportPdf(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');

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
      .select('id, storage_key, caption')
      .eq('binder_id', binderId)
      .eq('user_id', userId);

    if (photosErr) {
      logger.error({ event: 'binder.pdf.captions_query_failed', binderId, userId, error: photosErr.message }, 'Failed to load binder photo captions for PDF');
    }

    const captionByStorageKey = new Map();
    const ownedPhotoById = new Map();
    const ownedPhotoByStorageKey = new Map();
    (photoRows || []).forEach((row) => {
      if (row.id) ownedPhotoById.set(String(row.id), row);
      if (row.storage_key) ownedPhotoByStorageKey.set(String(row.storage_key), row);
      if (row.storage_key && typeof row.caption === 'string') {
        captionByStorageKey.set(row.storage_key, row.caption);
      }
    });

    let pages = (layoutRows || []).map((row, idx) => {
      const layoutJson =
        row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;

      return {
        pageIndex: typeof row.page_number === 'number' ? row.page_number - 1 : idx,
        sectionKey: layoutJson?.sectionKey || null,
        layers: (layoutJson?.layers || []).map((layer) => {
          if (layer?.type !== 'photo') return layer;
          const owned =
            (layer.photoId && ownedPhotoById.get(String(layer.photoId))) ||
            (layer.storageKey && ownedPhotoByStorageKey.get(String(layer.storageKey)));
          if (!owned) return { ...layer, photoId: null, storageKey: null };
          return { ...layer, photoId: String(owned.id), storageKey: String(owned.storage_key) };
        })
      };
    });

    const anySection = pages.some((p) => p.sectionKey);
    pages = pages.map((p, idx) => {
      const sectionKey = p.sectionKey ? p.sectionKey : anySection ? null : idx === 0 ? 'overview' : 'photos';
      return { ...p, sectionKey: sectionKey || 'photos' };
    });

    const totalPages = pages.length;

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
          startContentPage: idx + 1,
          endContentPage: idx + 1
        };
        exhibits.push(current);
      } else {
        current.endContentPage = idx + 1;
      }
    });

    const getExhibitForPage = (contentPageNumber) =>
      exhibits.find((ex) => contentPageNumber >= ex.startContentPage && contentPageNumber <= ex.endContentPage);

    const doc = new PDFDocument({ autoFirstPage: false, size: 'A4', margin: 0 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relationship-binder-${binderId || 'draft'}.pdf"`);

    doc.pipe(res);

    if (pages.length === 0) {
      doc.addPage();
      doc.fontSize(12).text('No pages available.', { align: 'center' });
      doc.end();
      return;
    }

    for (let idx = 0; idx < pages.length; idx++) {
      const pageLayout = pages[idx];
      const contentPageNumber = idx + 1;
      const exhibitInfo = getExhibitForPage(contentPageNumber);

      doc.addPage({ size: 'A4', margin: 0 });

      await renderBinderPageBody({
        doc,
        pageLayout,
        exhibitInfo,
        binderTitle: binder.title || 'Relationship Binder',
        totalPages,
        contentPageNumber,
        marginPt: 0,
        client,
        userId,
        binderId,
        captionByStorageKey
      });
    }

    doc.end();
  } catch (err) {
    logger.error(
      { event: 'binder.export_failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) },
      'Binder exportPdf handler failed'
    );
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/editor
 */
async function renderBinderEditor(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');

  logger.info(
    { event: 'binder.editor.handler_called', binderId: binderIdParam, path: req.path, method: req.method },
    'Binder editor handler invoked'
  );

  try {
    const { userId, client } = getContext(req);

    // Always resolve based on URL param; create default binder if missing
    const { binder } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: true
    });

    const pageModel = await buildDashboardPageModel(req, res);

    pageModel.page = pageModel.page || {};
    pageModel.ui = pageModel.ui || {};

    pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
    pageModel.page.assetVersion = res.locals.assetVersion || pageModel.page.assetVersion || '';

    pageModel.ui.csrfToken = res.locals.csrfToken || pageModel.ui.csrfToken || '';

    pageModel.binder = {
      id: binder.id,
      title: binder.title,
      created_at: binder.created_at,
      updated_at: binder.updated_at
    };

    res.render('dashboard/binder-editor', pageModel);
  } catch (err) {
    logger.error(
      { event: 'binder.editor.render_failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) },
      'Binder editor render failed'
    );
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/photos/view-url?storageKey=...
 */
async function getPhotoViewUrl(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');
  const storageKey = String(req.query.storageKey || '');

  try {
    const { userId, client } = getContext(req);

    if (!storageKey) {
      return res.status(400).json({ ok: false, message: 'storageKey query parameter is required' });
    }

    const { binderId: binderUuid } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    const { data: photo, error: photoErr } = await client
      .from('binder_photos')
      .select('id')
      .eq('binder_id', binderUuid)
      .eq('user_id', userId)
      .eq('storage_key', storageKey)
      .maybeSingle();

    if (photoErr) {
      logger.error(
        {
          event: 'binder.view_url.photo_lookup_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: photoErr.message
        },
        'Failed to verify photo ownership for view-url'
      );
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    }

    if (!photo) {
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    }

    // Cache the resolved URL response (browser-side) for faster tab switches.
    res.setHeader('Cache-Control', 'private, max-age=10800'); // 3 hours
    res.setHeader('Vary', 'Cookie');

    let publicUrl = null;
    if (storageProvider && typeof storageProvider.getBinderPhotoPublicUrl === 'function') {
      publicUrl = storageProvider.getBinderPhotoPublicUrl(storageKey);
    }

    if (publicUrl) {
      return res.json({ ok: true, url: publicUrl, via: 'cdn' });
    }

    const rawPath =
      `/dashboard/binder/${encodeURIComponent(binderIdParam)}` +
      `/photos/raw?storageKey=${encodeURIComponent(storageKey)}`;

    return res.json({ ok: true, url: rawPath, via: 'raw' });
  } catch (err) {
    logger.error(
      {
        event: 'binder.view_url.error',
        binderIdParam,
        storageKey,
        userId: getUserIdFromReq(req),
        status: err.status || 500,
        error: err.message,
        stack: err.stack
      },
      'Failed to generate view url for binder photo'
    );
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/photos/raw?storageKey=...
 * Streams the photo bytes from S3/local to the browser.
 */
async function streamPhotoRaw(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');
  const storageKey = String(req.query.storageKey || '');

  try {
    const { userId, client } = getContext(req);

    if (!storageKey) return res.status(400).send('storageKey is required');
    if (!storageProvider || typeof storageProvider.getBinderPhotoStream !== 'function') {
      return res.status(503).send('Photo storage is not configured.');
    }

    const { binderId: binderUuid } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    const { data: photoRow, error: photoErr } = await client
      .from('binder_photos')
      .select('id, mime_type')
      .eq('binder_id', binderUuid)
      .eq('storage_key', storageKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (photoErr) {
      logger.error(
        {
          event: 'binder.raw.photo_lookup_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: photoErr.message
        },
        'Failed to verify photo ownership for raw endpoint'
      );
      return res.status(500).send('Unable to verify photo ownership.');
    }

    if (!photoRow) {
      return res.status(404).send('Photo not found for this binder.');
    }

    const { stream, contentType, contentLength } = await storageProvider.getBinderPhotoStream(storageKey);
    const finalContentType = contentType || photoRow.mime_type || 'application/octet-stream';

    res.setHeader('Content-Type', finalContentType);
    if (contentLength) res.setHeader('Content-Length', String(contentLength));
    res.setHeader('Cache-Control', 'private, max-age=10800'); // 3 hours
    res.setHeader('Vary', 'Cookie');

    stream.on('error', (e) => {
      logger.error(
        {
          event: 'binder.raw.stream_error',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: e.message
        },
        'Error while streaming binder photo'
      );
      if (!res.headersSent) res.status(500).end('Error streaming photo');
      else res.end();
    });

    stream.pipe(res);
  } catch (err) {
    logger.error(
      {
        event: 'binder.raw.unhandled_error',
        binderIdParam,
        storageKey,
        userId: getUserIdFromReq(req),
        status: err.status || 500,
        error: err.message,
        stack: err.stack
      },
      'Unhandled error in raw photo endpoint'
    );
    next(err);
  }
}

/**
 * DELETE /dashboard/binder/:binderId/photos?storageKey=...
 */
async function deletePhoto(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');
  const storageKey = String((req.query && req.query.storageKey) || (req.body && req.body.storageKey) || '');

  try {
    const { userId, client } = getContext(req);

    if (!storageKey) {
      return res.status(400).json({ ok: false, message: 'storageKey is required to delete a photo.' });
    }
    if (!storageProvider || typeof storageProvider.deleteBinderPhoto !== 'function') {
      return res.status(503).json({ ok: false, message: 'Photo storage is not configured.' });
    }

    const { binderId: binderUuid } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    const { data: photoRow, error: photoErr } = await client
      .from('binder_photos')
      .select('id')
      .eq('binder_id', binderUuid)
      .eq('storage_key', storageKey)
      .eq('user_id', userId)
      .maybeSingle();

    if (photoErr) {
      logger.error(
        {
          event: 'binder.delete.photo_lookup_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: photoErr.message,
          code: photoErr.code
        },
        'Failed to verify photo ownership for delete'
      );
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    }

    if (!photoRow) {
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    }

    await storageProvider.deleteBinderPhoto(storageKey);

    const { error: dbErr } = await client.from('binder_photos').delete().eq('id', photoRow.id).eq('user_id', userId).select('id');

    if (dbErr) {
      logger.error(
        {
          event: 'binder.photo_db_delete_failed',
          binderIdParam,
          binderUuid,
          storageKey,
          userId,
          error: dbErr.message,
          code: dbErr.code
        },
        'Failed to delete binder photo metadata from DB'
      );
      return res.status(500).json({ ok: false, message: 'Unable to delete photo metadata right now.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error(
      {
        event: 'binder.delete.error',
        binderIdParam,
        storageKey,
        userId: getUserIdFromReq(req),
        status: err.status || 500,
        error: err.message,
        stack: err.stack
      },
      'Failed to delete binder photo'
    );
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/layout
 */
async function getBinderLayout(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');

  try {
    const { userId, client } = getContext(req);

    const { binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

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
      const newPageId = crypto.randomUUID();
      layout.pages = [{ id: newPageId, pageId: newPageId, pageIndex: 0, layers: [], sectionKey: 'photos' }];
      return res.json({ ok: true, layout });
    }

    const photoIdsSet = new Set();
    for (const row of layoutRows) {
      const layoutJson = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      const layers = layoutJson?.layers || [];
      for (const layer of layers) {
        if (layer?.type === 'photo' && layer.photoId && !layer.storageKey) {
          photoIdsSet.add(String(layer.photoId));
        }
      }
    }

    const photoIdsToLookup = Array.from(photoIdsSet);

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

    const pagesNeedingUpsert = [];
    const layoutRowsNeedingPatch = [];

    layout.pages = layoutRows.map((row, idx) => {
      const pageNumber = typeof row.page_number === 'number' ? row.page_number : idx + 1;
      const pageIndex = pageNumber - 1;

      const layoutJsonRaw = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      const layoutJson = layoutJsonRaw && typeof layoutJsonRaw === 'object' ? layoutJsonRaw : {};

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
          const storageKey2 = photoStorageMap[String(enriched.photoId)];
          if (storageKey2) enriched = { ...enriched, storageKey: storageKey2 };
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

    const latestUpdatedAt =
      (layoutRows || [])
        .map((r) => r.updated_at)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null;

    layout.updatedAt = latestUpdatedAt || layout.updatedAt;

    return res.json({ ok: true, layout });
  } catch (err) {
    logger.error({ event: 'binder.layout.get.failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) }, 'Binder layout get failed');
    next(err);
  }
}

// -----------------------------------------------------------------------------
// Pages reorder helper + applyBinderLayout
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
  const incomingSet = new Set(incomingIds);

  const extraIds = existing
    .filter((r) => !incomingSet.has(String(r.id)))
    .map((r) => String(r.id));

  const fullOrder = [...incomingIds, ...extraIds];

  for (const row of existing) {
    if (String(row.binder_id) !== String(binderId) || String(row.user_id) !== String(userId)) {
      const err = new Error('Invalid pageId provided (does not belong to this binder)');
      err.status = 400;
      throw err;
    }
  }

  const maxPageNumber = existing.reduce((m, r) => {
    const n = Number(r.page_number);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);

  const tempBase = maxPageNumber + 1000;

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

async function applyBinderLayout(req, res, next) {
  const binderIdParam = String(req.params.binderId || '');

  try {
    const { userId, client } = getContext(req);
    const layout = validateAndNormalizeLayout(req.body);

    const { binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: true
    });

    if (layout.binderId && layout.binderId !== binderIdParam && layout.binderId !== binderId) {
      return res.status(400).json({ ok: false, message: 'Binder ID mismatch' });
    }

    const normalizedPages = layout.pages;
    const incomingPageIds = normalizedPages.map((page) => page.pageId);
    if (incomingPageIds.length > 0) {
      const { data: claimedPages, error: claimedPagesErr } = await client
        .from('pages')
        .select('id, binder_id, user_id')
        .in('id', incomingPageIds);
      if (claimedPagesErr) {
        return res.status(500).json({ ok: false, message: 'Unable to verify page ownership' });
      }
      const foreignPage = (claimedPages || []).find(
        (row) => String(row.binder_id) !== String(binderId) || String(row.user_id) !== String(userId)
      );
      if (foreignPage) return res.status(400).json({ ok: false, message: 'Invalid pageId provided' });
    }

    const { data: ownedPhotos, error: ownedPhotosErr } = await client
      .from('binder_photos')
      .select('id, storage_key')
      .eq('binder_id', binderId)
      .eq('user_id', userId);
    if (ownedPhotosErr) {
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership' });
    }
    assertOwnedPhotoReferences(layout, ownedPhotos || []);

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

    const { error: deleteErr } = await client
      .from('binder_layouts')
      .delete()
      .eq('user_id', userId)
      .eq('binder_id', String(binderId));

    if (deleteErr) {
      logger.error({ event: 'binder.layout.apply.delete_failed', binderId, userId, error: deleteErr.message }, 'Failed to delete existing layouts');
      return res.status(500).json({ ok: false, message: 'Unable to save layout' });
    }

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

    return res.json({
      ok: true,
      updatedAt,
      pageIds: normalizedPages.map((p) => p.pageId),
      layout: { ...layout, binderId, updatedAt }
    });
  } catch (err) {
    logger.error({ event: 'binder.layout.apply.failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) }, 'Binder layout apply failed');
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
  getPhotoViewUrl,
  streamPhotoRaw,
  deletePhoto,
  getBinderLayout,
  applyBinderLayout,
  resolveBinder
};
