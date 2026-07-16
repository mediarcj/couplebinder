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
  // Delay this provider load so non-storage routes can still start in a partial environment.
  storageProvider = require('../services/storageProvider');
} catch (err) {
  logger.warn(
    { event: 'binder.storage_provider_unavailable', error: err.message },
    'Storage provider module not found; binder uploads/export image fetch may fail until configured'
  );
}

// Shared server-side image validation (aligns with dashboard.js client filtering)
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
  // Upload metadata varies by browser and device, especially for HEIC images. Accept a
  // supported MIME type or filename extension, then let storage/rendering handle the file.
  if (!file) return false;
  const mimeOk = file.mimetype && ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype);
  const name = file.originalname || '';
  const extOk = ALLOWED_IMAGE_EXTENSIONS.test(name);
  // Accept if either MIME or extension says "image we support"
  return mimeOk || extOk;
}

function getUserIdFromReq(req) {
  // Authentication middleware may expose either Supabase's id or the older uid alias.
  return (req.user && (req.user.id || req.user.uid)) || null;
}

/**
 * Small helper: ensure we have a logged-in user and a Supabase admin client.
 */
function getContext(req) {
  // Controllers use this pair for every user-scoped query below.
  const userId = getUserIdFromReq(req);

  if (!userId) {
    const err = new Error('Unauthorized: missing user id on request');
    err.status = 401;
    throw err;
  }

  if (!supabaseAdmin) {
    // Return unavailable rather than attempting database work with an uninitialized client.
    const err = new Error('Supabase admin client not initialized');
    err.status = 503;
    throw err;
  }

  return { userId, client: supabaseAdmin };
}

/**
 * Resolve workspace ID (default-{userId}) to real binder UUID, or return existing UUID.
 * Creates binder if missing for workspace IDs.
 */
async function resolveBinder({ client, userId, binderIdParam, createIfMissing = true }) {
  // 1. Accept the dashboard's default-{user} workspace alias or a real binder UUID.
  // 2. Resolve every lookup through user_id so a valid UUID never grants cross-user access.
  // 3. Create the first binder only for the default workspace path when the caller allows it.
  if (!binderIdParam || !userId) {
    const err = new Error('Missing binderId or userId');
    err.status = 400;
    throw err;
  }

  const binderIdStr = String(binderIdParam);

  // Case 1: Workspace ID (default-{userId})
  if (binderIdStr.startsWith('default-')) {
    // The oldest binder is the stable default workspace for this user.
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
      // Return both the row and UUID so routes can render metadata and scope later queries.
      return { binder: existingBinder, binderId: existingBinder.id };
    }

    if (!createIfMissing) {
      // Read/delete routes should not create data merely because a binder was absent.
      const err = new Error('Binder not found');
      err.status = 404;
      throw err;
    }

    const { data: createdBinder, error: binderInsertErr } = await client
      // New default workspaces start as drafts and receive their database UUID here.
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
  // Keep ownership in the query itself instead of fetching a foreign row and checking later.
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

// Image fetch for PDF export (uses storageProvider.getBinderPhotoBuffer if present)
async function fetchImageBufferForLayer(layer) {
  // PDF rendering cannot use a browser URL; it needs the stored photo bytes as a Buffer.
  if (!layer?.storageKey) return null;
  if (!storageProvider || typeof storageProvider.getBinderPhotoBuffer !== 'function') return null;

  try {
    // storageProvider hides whether these bytes come from S3 or the local development folder.
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
  // The editor saves positions in one fixed logical page size. This renderer scales that
  // coordinate system onto PDFKit's page so the export matches the on-screen composition.
  // 1. Map the editor's A4 coordinate system onto this PDF page.
  // 2. Draw layers in z-order, fetching owned photo bytes when needed.
  // 3. Clip photos with cover sizing and place database captions in the reserved band.
  const sectionDef = SECTION_DEFS[pageLayout.sectionKey] || SECTION_DEFS.photos;
  const exhibitCode = exhibitInfo
    ? `${(SECTION_DEFS[exhibitInfo.sectionKey] || sectionDef).prefix}-${exhibitInfo.exhibitNo}`
    : `${sectionDef.prefix}-1`;

  void exhibitCode;
  // Keep these accepted arguments visible for planned headers without triggering lint warnings.
  void binderTitle;
  void totalPages;
  void contentPageNumber;
  void marginPt;

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  const contentWidth = pageWidth;
  const contentHeight = pageHeight;

  const scale = Math.min(contentWidth / LAYOUT_LOGICAL_WIDTH, contentHeight / LAYOUT_LOGICAL_HEIGHT);

  // Center the logical surface if PDFKit's A4 rounding leaves a small unused edge.
  const surfaceWidth = LAYOUT_LOGICAL_WIDTH * scale;
  const surfaceHeight = LAYOUT_LOGICAL_HEIGHT * scale;

  const baseX = (contentWidth - surfaceWidth) / 2;
  const baseY = (contentHeight - surfaceHeight) / 2;

  doc.save().rect(baseX, baseY, surfaceWidth, surfaceHeight).fill('#ffffff').stroke('#dddddd').restore();

  const layers = (pageLayout.layers || []).slice().sort((a, b) => {
    // Sort a copy so export never mutates the layout object loaded from the database.
    const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
    const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
    return za - zb;
  });

  for (const layer of layers) {
    try {
      // Normalize geometry before translating it from logical pixels to PDF points.
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
        // Work on a copy because legacy photoId repair is only for this export pass.
        let layerWithStorageKey = { ...layer };

        if (!layerWithStorageKey.storageKey && layerWithStorageKey.photoId && client && userId && binderId) {
          // Older layouts may need one owned-row lookup to recover their storage key.
          try {
            const { data: photo } = await client
              .from('binder_photos')
              .select('storage_key')
              .eq('id', layerWithStorageKey.photoId)
              .eq('binder_id', binderId)
              .eq('user_id', userId)
              .maybeSingle();

            if (photo && photo.storage_key) {
              // The fetch helper below reads this recovered key exactly like a current layout.
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
        // Match Layer.jsx: saved photo height includes the fixed caption area at the bottom.
        const imgHeight = pdfH - captionBand;
        const imgY = pdfY;

        const buf = await fetchImageBufferForLayer(layerWithStorageKey);

        if (!buf) {
          // Keep page geometry intact when a storage object is missing or temporarily unavailable.
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
          // Cover scaling fills the saved frame, then clipping removes overflow on either axis.
          const img = doc.openImage(buf);
          const scaleByWidth = pdfW / img.width;
          const scaleByHeight = imgHeight / img.height;
          const coverScale = Math.max(scaleByWidth, scaleByHeight);

          const scaledWidth = img.width * coverScale;
          const scaledHeight = img.height * coverScale;

          const drawX = pdfX + (pdfW - scaledWidth) / 2;
          // Center the covered image so cropping stays balanced like the editor preview.
          const drawY = imgY + (imgHeight - scaledHeight) / 2;

          doc.save();
          doc.rect(pdfX, imgY, pdfW, imgHeight).clip();
          doc.translate(drawX, drawY);
          doc.scale(coverScale, coverScale);
          doc.image(img, 0, 0, { width: img.width, height: img.height });
          doc.restore();
        }

        let caption = '';
        // Caption rows are loaded once in exportPdf and passed here as a storage-key map.
        if (captionByStorageKey && layerWithStorageKey.storageKey) {
          const rawCap = captionByStorageKey.get(layerWithStorageKey.storageKey);
          if (typeof rawCap === 'string') caption = rawCap.trim();
        }

        if (caption) {
          // Leave a small inset so text does not touch the photo frame or page edge.
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
        // Text layers keep their own bordered box and render only when saved text exists.
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
      // One malformed image/layer should not prevent the remaining binder pages from exporting.
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
    // getContext supplies the authenticated user scope used in this list query.
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
    // Express's shared error responder owns the final failure shape.
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
    // Use a readable fallback when a normal form or API caller omits the title.
    const rawTitle = (req.body && req.body.title) || '';
    const title = rawTitle.trim() || 'Untitled binder';

    const { data, error } = await client
      // user_id is always taken from middleware context, never from the posted body.
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
  // Each accepted file is stored first and then recorded in binder_photos. The response
  // gives the editor stable database/storage references for its new photo layers.
  const binderIdParam = String(req.params.binderId || '');

  try {
    const { userId, client } = getContext(req);

    // binderRoutes/multer has parsed files by this point; the controller still needs storage.
    if (!storageProvider || typeof storageProvider.saveBinderPhoto !== 'function') {
      const err = new Error('Photo storage is not configured');
      err.status = 503;
      throw err;
    }

    const allFiles = Array.isArray(req.files) ? req.files : [];
    // Reject the empty request before resolving or creating a binder row.
    if (!allFiles.length) return res.status(400).json({ ok: false, error: 'No files uploaded' });

    // Repeat format validation server-side because browser accept filters can be bypassed.
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
      // Save bytes first so the metadata row records the provider's canonical storage details.
      const storageResult = await storageProvider.saveBinderPhoto({
        userId,
        binderId: binderUuid, // IMPORTANT: store under real binder UUID
        file
      });

      const { data: photoRows, error: photoErr } = await client
        // This owned row is what later view, caption, export, and delete routes authorize against.
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

      // Return both legacy display fields and stable database/storage identifiers to App.
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
      // App keeps the route-facing ID while database work continues with binderUuid.
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
  // api.updatePhotoCaption sends the storage key and draft caption to this route.
  const binderIdParam = String(req.params.binderId || '');

  try {
    const { userId, client } = getContext(req);
    const storageKey = String((req.body && req.body.storageKey) || '');
    // Convert missing input to an empty string before the shared validator normalizes it.
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
      // Bind the key to this binder and user before accepting it as the update target.
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
    // security.js owns length/content rules so browser and server checks cannot diverge silently.
    if (!valid) {
      return res.status(400).json({ ok: false, message: error || 'Invalid caption' });
    }

    const captionToStore = sanitized || null;

    // Store null for an empty caption while returning an empty string that Layer can display.
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
  // Export rebuilds the binder from persisted layout rows and owned photo records. Keeping
  // this server-side avoids trusting browser-supplied image paths in the generated PDF.
  const binderIdParam = String(req.params.binderId || '');

  try {
    // 1. Resolve the owned binder and load its persisted layout/photo rows.
    // 2. Normalize legacy references and section groupings in memory.
    // 3. Stream PDFKit pages to the response in saved page order.
    const { userId, client } = getContext(req);

    const { binder, binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    const { data: layoutRows, error: layoutErr } = await client
      // Export reads only saved rows; App flushes dirty state before it calls this endpoint.
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
      // One owned-photo query supports captions and both legacy photo reference forms.
      .from('binder_photos')
      .select('id, storage_key, caption')
      .eq('binder_id', binderId)
      .eq('user_id', userId);

    if (photosErr) {
      logger.error({ event: 'binder.pdf.captions_query_failed', binderId, userId, error: photosErr.message }, 'Failed to load binder photo captions for PDF');
    }

    const captionByStorageKey = new Map();
    // Build maps once so every page layer can resolve in constant time below.
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
      // Database rows may hold JSON objects or older serialized strings.
      const layoutJson =
        row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;

      return {
        pageIndex: typeof row.page_number === 'number' ? row.page_number - 1 : idx,
        sectionKey: layoutJson?.sectionKey || null,
        layers: (layoutJson?.layers || []).map((layer) => {
          // Never pass an unowned photo reference into the storage fetch path.
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
    // Apply legacy defaults only when the saved layout predates section assignments entirely.
    pages = pages.map((p, idx) => {
      const sectionKey = p.sectionKey ? p.sectionKey : anySection ? null : idx === 0 ? 'overview' : 'photos';
      return { ...p, sectionKey: sectionKey || 'photos' };
    });

    const totalPages = pages.length;

    const sectionCounters = {};
    // Consecutive runs form exhibits, with numbering tracked separately per section type.
    const exhibits = [];
    let current = null;

    pages.forEach((p, idx) => {
      const key = p.sectionKey || 'photos';
      if (!current || current.sectionKey !== key) {
        // Start a new exhibit when the section changes in saved page order.
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

    // Set download headers before piping because PDFKit begins writing as pages are added.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relationship-binder-${binderId || 'draft'}.pdf"`);

    doc.pipe(res);

    if (pages.length === 0) {
      // Still return a valid PDF so the preview/download caller can handle an empty binder.
      doc.addPage();
      doc.fontSize(12).text('No pages available.', { align: 'center' });
      doc.end();
      return;
    }

    for (let idx = 0; idx < pages.length; idx++) {
      // Render sequentially because each page awaits its storage-backed image buffers.
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
    // A failure before or during streaming is logged and handed to Express's error path.
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
  // binderRoutes sends the protected editor page here with the route-facing binder ID.
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

    // The presenter supplies the shared dashboard shell; these fields add editor-specific data.
    pageModel.page = pageModel.page || {};
    pageModel.ui = pageModel.ui || {};

    pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
    // The EJS view puts nonce/version/CSRF data on the React mount element used by api.js/Layer.
    pageModel.page.assetVersion = res.locals.assetVersion || pageModel.page.assetVersion || '';

    pageModel.ui.csrfToken = res.locals.csrfToken || pageModel.ui.csrfToken || '';

    pageModel.binder = {
      // Expose only the binder metadata the editor template needs to mount React.
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
  // Layer and preloadPhotos call this helper before placing a private image in the browser.
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
      // Authorize the exact binder/user/key tuple before revealing any usable URL.
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
    // Prefer the provider's CDN/public URL when configured; otherwise keep access behind auth.
    if (storageProvider && typeof storageProvider.getBinderPhotoPublicUrl === 'function') {
      publicUrl = storageProvider.getBinderPhotoPublicUrl(storageKey);
    }

    if (publicUrl) {
      return res.json({ ok: true, url: publicUrl, via: 'cdn' });
    }

    const rawPath =
      // The raw endpoint repeats ownership verification before streaming bytes.
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
  // Verify the storage key against a user-owned binder row before opening the stream. A
  // valid-looking key alone is not enough authorization to read private photo bytes.
  const binderIdParam = String(req.params.binderId || '');
  const storageKey = String(req.query.storageKey || '');

  try {
    const { userId, client } = getContext(req);

    // Fail before a database/storage call when the route is incomplete or provider is unavailable.
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
    // Prefer provider metadata, with the owned database row and generic bytes as fallbacks.
    const finalContentType = contentType || photoRow.mime_type || 'application/octet-stream';

    res.setHeader('Content-Type', finalContentType);
    if (contentLength) res.setHeader('Content-Length', String(contentLength));
    res.setHeader('Cache-Control', 'private, max-age=10800'); // 3 hours
    res.setHeader('Vary', 'Cookie');

    stream.on('error', (e) => {
      // Headers may already contain streamed bytes, so the late-error response must only end.
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
    // Node backpressure is handled by the stream pipe rather than buffering the whole photo here.
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
  // Ownership is checked before both database and storage cleanup so a caller cannot use
  // this endpoint as a general-purpose delete operation against the backing provider.
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
      // Resolve the metadata row first; its ID becomes the narrow database delete target.
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

    // Remove metadata only after provider cleanup succeeds so a failed object delete stays retryable.
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
  // api.getLayout calls this route during App's initial binder load.
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
      // The 200-row limit mirrors validator safeguards and protects the editor load path.
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
      // The pages table supplies stable drag IDs for layouts saved before pageId was embedded.
      .from('pages')
      .select('id, page_number')
      .eq('binder_id', binderId)
      .eq('user_id', userId)
      .order('page_number', { ascending: true });

    if (pagesErr) {
      logger.warn({ event: 'binder.pages.load_failed_for_layout', binderId, userId, error: pagesErr.message }, 'Could not load pages table for layout');
    }

    const pageIdByNumber = {};
    // Page number is the compatibility join between the two historical table shapes.
    (pageRows || []).forEach((p) => {
      if (p?.page_number && p?.id) pageIdByNumber[Number(p.page_number)] = String(p.id);
    });

    const layout = {
      binderId,
      pages: [],
      updatedAt: new Date().toISOString()
    };

    if (!layoutRows || layoutRows.length === 0) {
      // Return one local starter page without writing it; applyBinderLayout persists the first edit.
      const newPageId = crypto.randomUUID();
      layout.pages = [{ id: newPageId, pageId: newPageId, pageIndex: 0, layers: [], sectionKey: 'photos' }];
      return res.json({ ok: true, layout });
    }

    const photoIdsSet = new Set();
    // Older saved layouts may carry only photoId. Resolve storage keys in one scoped
    // query so the current editor can load them without issuing a lookup per layer.
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
      // One binder/user-scoped query repairs every legacy photoId in this response.
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
      // Captions live on photo rows, so merge them into layout layers for Layer.jsx to display.
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

    // Reading also performs a best-effort compatibility repair for layouts saved before
    // stable page IDs existed. Build the response regardless; failed backfills can retry
    // on a later read.
    const pagesNeedingUpsert = [];
    const layoutRowsNeedingPatch = [];

    layout.pages = layoutRows.map((row, idx) => {
      // Use row order as a fallback, but preserve an explicit database page number when present.
      const pageNumber = typeof row.page_number === 'number' ? row.page_number : idx + 1;
      const pageIndex = pageNumber - 1;

      const layoutJsonRaw = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      const layoutJson = layoutJsonRaw && typeof layoutJsonRaw === 'object' ? layoutJsonRaw : {};

      let pageId = layoutJson.pageId ? String(layoutJson.pageId) : null;

      if (!pageId && pageIdByNumber[pageNumber]) {
        // Recover the ID from pages without scheduling a database repair.
        pageId = String(pageIdByNumber[pageNumber]);
      }

      if (!pageId) {
        // Generate once for the response and queue both tables for best-effort backfill.
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
        // Enrich a copy only when legacy photo metadata or current caption data is available.
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
      // Backfill is allowed to fail because the normalized response is already usable this request.
      const { error: upsertErr } = await client.from('pages').upsert(pagesNeedingUpsert, { onConflict: 'id' });
      if (upsertErr) {
        logger.warn({ event: 'binder.pages.backfill_failed', binderId, userId, error: upsertErr.message }, 'Failed to backfill pages table with generated pageIds');
      }
    }

    for (const patch of layoutRowsNeedingPatch) {
      // Patch each historical row by its existing binder/page scope to preserve other layout fields.
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
      // The newest per-page timestamp becomes the editor's single save-status timestamp.
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

// Pages reorder helper + applyBinderLayout

async function syncPagesTableOrder({ client, userId, binderId, layoutPages }) {
  // 1. Validate stable incoming IDs and load the owned database rows.
  // 2. Preserve database-only pages at the end rather than treating reorder as deletion.
  // 3. Use temporary page numbers before assigning the final order to avoid unique collisions.
  if (!Array.isArray(layoutPages)) {
    const err = new Error('layoutPages must be an array');
    err.status = 400;
    throw err;
  }

  const incomingIds = layoutPages
    // Accept historical aliases but normalize every value to the database string ID.
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
  // The set makes it cheap to find database rows omitted by this editor payload.
  const incomingSet = new Set(incomingIds);

  // Pages absent from this editor payload are kept at the end rather than silently
  // deleted here. Deletion has its own flow and storage cleanup rules.
  const extraIds = existing
    .filter((r) => !incomingSet.has(String(r.id)))
    .map((r) => String(r.id));

  const fullOrder = [...incomingIds, ...extraIds];

  for (const row of existing) {
    // Keep this defensive ownership check even though the select query is already scoped.
    if (String(row.binder_id) !== String(binderId) || String(row.user_id) !== String(userId)) {
      const err = new Error('Invalid pageId provided (does not belong to this binder)');
      err.status = 400;
      throw err;
    }
  }

  const maxPageNumber = existing.reduce((m, r) => {
    // Temporary numbers start beyond every current value in this binder.
    const n = Number(r.page_number);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);

  // Move every row out of the final number range first. This avoids transient uniqueness
  // collisions when two pages swap positions under a unique binder/page_number index.
  const tempBase = maxPageNumber + 1000;

  const tempRows = fullOrder.map((id, idx) => ({
    // Upsert also creates incoming page IDs that are new to the pages table.
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
    // The editor's array order becomes the one-based database page_number order.
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
  // App autosave posts the complete layout to this controller through binderRoutes.
  const binderIdParam = String(req.params.binderId || '');

  try {
    // 1. Validate shape/limits and resolve the owned binder.
    // 2. Verify page/photo references, then synchronize stable page order.
    // 3. Replace persisted per-page layouts and return the server timestamp to App.
    const { userId, client } = getContext(req);
    const layout = validateAndNormalizeLayout(req.body);

    const { binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: true
    });

    if (layout.binderId && layout.binderId !== binderIdParam && layout.binderId !== binderId) {
      // Accept either the route alias or resolved UUID, but never a third binder identity.
      return res.status(400).json({ ok: false, message: 'Binder ID mismatch' });
    }

    // Payload validation proves shape, not ownership. Verify stable page IDs and photo
    // references against rows scoped to the authenticated user before writing anything.
    const normalizedPages = layout.pages;
    // Query claimed IDs without binder filtering so a foreign existing ID can be detected.
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
        // Every existing claim must match both the resolved binder and authenticated user.
        (row) => String(row.binder_id) !== String(binderId) || String(row.user_id) !== String(userId)
      );
      if (foreignPage) return res.status(400).json({ ok: false, message: 'Invalid pageId provided' });
    }

    const { data: ownedPhotos, error: ownedPhotosErr } = await client
      // The validator uses this scoped allowlist to canonicalize all photo references.
      .from('binder_photos')
      .select('id, storage_key')
      .eq('binder_id', binderId)
      .eq('user_id', userId);
    if (ownedPhotosErr) {
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership' });
    }
    assertOwnedPhotoReferences(layout, ownedPhotos || []);

    try {
      // Keep page-table synchronization isolated so its specific error can return cleanly.
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

    // binder_layouts stores one row per page. Replace the binder's row set so removed
    // pages do not leave stale layout rows behind; every query remains user/binder scoped.
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
      // Persist only the per-page fields the load/export paths read from layout_json.
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
      // Empty binders intentionally leave no binder_layouts rows after the scoped delete.
      const { error: insertErr } = await client.from('binder_layouts').insert(layoutRows);
      if (insertErr) {
        logger.error({ event: 'binder.layout.apply.insert_failed', binderId, userId, error: insertErr.message }, 'Failed to insert new layouts');
        return res.status(500).json({ ok: false, message: 'Unable to save layout' });
      }
    }

    await client
      // Touch binder metadata for list ordering/status; layout rows keep their own timestamps too.
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
    // Historical layout rows may still be serialized strings rather than JSON columns.
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
