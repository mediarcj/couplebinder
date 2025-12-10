// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: DB-backed version (uses Supabase tables + S3/local uploads)

'use strict';

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../utils/supabaseClient');
const { supabase } = require('../utils/supabaseClient'); // kept for future use
const { saveBinderPhoto } = require('../services/storageProvider');
const { getBinderPhotoViewUrl } = require('../services/storageProvider');

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
 *
 * WHY:
 * Workspace IDs are per-user placeholders. We need real binder UUIDs for DB operations.
 *
 * HOW:
 * - If binderIdParam is a workspace ID, find or create the user's default binder.
 * - If binderIdParam is a UUID, verify ownership and return it.
 * - Returns { binder, binderId } where binderId is the real UUID.
 * - Throws errors only for auth/DB failures, not for missing binders (creates them).
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
      return {
        binder: existingBinder,
        binderId: existingBinder.id
      };
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

    return {
      binder: createdBinder,
      binderId: createdBinder.id
    };
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

  return {
    binder: binderRow,
    binderId: binderRow.id
  };
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

async function fetchImageBufferForLayer(layer) {
  // Try storageKey first (preferred)
  if (layer?.storageKey) {
    try {
      const url = await getBinderPhotoViewUrl(layer.storageKey);
      if (url) {
        const resp = await fetch(url);
        if (resp.ok) {
          const arr = await resp.arrayBuffer();
          return Buffer.from(arr);
        }
      }
    } catch (err) {
      logger.warn(
        {
          event: 'binder.pdf.image_fetch_failed',
          storageKey: layer.storageKey,
          error: err.message
        },
        'Failed to fetch image buffer for layer'
      );
    }
  }

  // Fallback: try src if it is an absolute URL
  if (layer?.src && /^https?:\/\//i.test(layer.src)) {
    try {
      const resp = await fetch(layer.src);
      if (resp.ok) {
        const arr = await resp.arrayBuffer();
        return Buffer.from(arr);
      }
    } catch (err) {
      logger.warn(
        {
          event: 'binder.pdf.image_fetch_failed_src',
          src: layer.src,
          error: err.message
        },
        'Failed to fetch image buffer from src'
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
  binderId = null
}) {
  const sectionDef = SECTION_DEFS[pageLayout.sectionKey] || SECTION_DEFS.photos;
  const exhibitCode = exhibitInfo
    ? `${(SECTION_DEFS[exhibitInfo.sectionKey] || sectionDef).prefix}-${exhibitInfo.exhibitNo}`
    : `${sectionDef.prefix}-1`;

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentWidth = pageWidth - marginPt * 2;
  const contentHeight = pageHeight - marginPt * 2;

  const scale = Math.min(
    contentWidth / LAYOUT_LOGICAL_WIDTH,
    contentHeight / LAYOUT_LOGICAL_HEIGHT
  );

  const surfaceWidth = LAYOUT_LOGICAL_WIDTH * scale;
  const surfaceHeight = LAYOUT_LOGICAL_HEIGHT * scale;

  const baseX = marginPt + (contentWidth - surfaceWidth) / 2;
  const baseY = marginPt;

  // Header (keep existing behavior)
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
  doc
    .save()
    .rect(baseX, baseY, surfaceWidth, surfaceHeight)
    .fill('#ffffff')
    .stroke('#dddddd')
    .restore();

  // Layers
  const layers = (pageLayout.layers || []).slice().sort((a, b) => {
    const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
    const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
    return za - zb;
  });

  // Process layers sequentially to ensure images are loaded before rendering
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

        // Attempt to fetch and draw the image
        const buf = await fetchImageBufferForLayer(layerWithStorageKey);
        
        if (!buf) {
          // Placeholder for missing image
          doc
            .save()
            .rect(pdfX, pdfY, pdfW, pdfH)
            .fill('#f3f4f6')
            .stroke('#e5e7eb')
            .restore();
          doc
            .fontSize(9)
            .fillColor('#6b7280')
            .text('Photo unavailable', pdfX + 4, pdfY + 4, {
              width: pdfW - 8,
              height: pdfH - 8
            })
            .fillColor('#000000');
        } else {
          // Cover behavior: fill box exactly, crop if needed (matches canvas object-fit: cover)
          const img = doc.openImage(buf);
          const imgRatio = img.width / img.height;
          const boxRatio = pdfW / pdfH;

          // Calculate scale factor to cover the box (like object-fit: cover)
          // Use the larger scale to ensure the box is fully covered
          const scaleByWidth = pdfW / img.width;
          const scaleByHeight = pdfH / img.height;
          const coverScale = Math.max(scaleByWidth, scaleByHeight);

          // Calculate final dimensions (will be >= box in at least one dimension)
          const scaledWidth = img.width * coverScale;
          const scaledHeight = img.height * coverScale;

          // Center the image within the box (will be cropped by clipping)
          const drawX = pdfX + (pdfW - scaledWidth) / 2;
          const drawY = pdfY + (pdfH - scaledHeight) / 2;

          // Clip to box and render using transform to preserve aspect ratio
          doc.save();
          doc.rect(pdfX, pdfY, pdfW, pdfH).clip();
          // Use transform to scale, then render at natural size
          doc.translate(drawX, drawY);
          doc.scale(coverScale, coverScale);
          doc.image(img, 0, 0, { width: img.width, height: img.height });
          doc.restore();
        }
      } else if (layer.type === 'text') {
        doc
          .save()
          .rect(pdfX, pdfY, pdfW, pdfH)
          .fill('#ffffff')
          .stroke('#e5e7eb')
          .restore();
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
        doc
          .save()
          .rect(pdfX, pdfY, pdfW, pdfH)
          .stroke('#e5e7eb')
          .restore();
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
      // Continue with other layers
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
 * Generate PDF with index + exhibit labels
 */
async function exportPdf(req, res, next) {
  const binderIdParam = req.params.binderId;

  try {
    const { userId, client } = getContext(req);

    // Resolve workspace ID to real binder UUID
    const { binder, binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false // Don't create for export
    });

    // Fetch layout pages using real binderId
    const { data: layoutRows, error: layoutErr } = await client
      .from('binder_layouts')
      .select('page_number, layout_json')
      .eq('binder_id', String(binderId))
      .eq('user_id', userId)
      .order('page_number', { ascending: true });

    if (layoutErr) {
      logger.error(
        { event: 'binder.pdf.layout_query_failed', error: layoutErr.message, binderId, userId },
        'Layout query failed for PDF'
      );
      return res.status(500).json({ ok: false, message: 'Unable to export PDF' });
    }

    // Build pages with section info and layers
    let pages = (layoutRows || []).map((row, idx) => ({
      pageIndex: typeof row.page_number === 'number' ? row.page_number - 1 : idx,
      sectionKey: row.layout_json?.sectionKey || null,
      layers: row.layout_json?.layers || [] // Include layers for rendering
    }));

    // Backward compatibility: assign defaults if none present
    const anySection = pages.some((p) => p.sectionKey);
    pages = pages.map((p, idx) => {
      const sectionKey = p.sectionKey
        ? p.sectionKey
        : anySection
          ? null
          : idx === 0
            ? 'overview'
            : 'photos';
      return { ...p, sectionKey: sectionKey || 'photos' };
    });

    const contentPages = pages.length;
    const totalPages = contentPages + 1; // +1 for index page

    // Build exhibits (contiguous runs per section)
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
          startContentPage: idx + 2, // index page is 1
          endContentPage: idx + 2
        };
        exhibits.push(current);
      } else {
        current.endContentPage = idx + 2;
      }
    });

    const getExhibitForPage = (contentPageNumber) => {
      return exhibits.find(
        (ex) => contentPageNumber >= ex.startContentPage && contentPageNumber <= ex.endContentPage
      );
    };

    const doc = new PDFDocument({ autoFirstPage: true, size: 'A4', margin: 0 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="relationship-binder-${binderId || 'draft'}.pdf"`
    );

    doc.pipe(res);

    // Index page (page 1)
    doc.fontSize(20).text('Index', { align: 'center' });
    doc.moveDown(1);

    if (exhibits.length === 0) {
      doc.fontSize(12).text('No pages available.', { align: 'left' });
    } else {
      exhibits.forEach((ex) => {
        const def = SECTION_DEFS[ex.sectionKey] || SECTION_DEFS.photos;
        const code = `${def.prefix}-${ex.exhibitNo}`;
        doc.fontSize(12).text(
          `Exhibit ${code} – ${def.label} – Pages ${ex.startContentPage}–${ex.endContentPage}`
        );
      });
    }

    // Content pages - render actual layout
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
        binderId
      });
    }

    doc.end();

      logger.info(
        {
          event: 'binder.pdf_exported',
          binderId,
          userId,
          pageCount: contentPages
        },
        'Binder PDF exported with index/exhibits'
      );
  } catch (err) {
    logger.error(
      { event: 'binder.export_failed', error: err.message, binderId: binderIdParam, userId: req.user?.id },
      'Binder exportPdf handler failed'
    );
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/editor
 * Render binder editor page with React app
 *
 * Supports two kinds of :binderId:
 *  - "default-<userId>" workspace id (per-user binder workspace)
 *  - real binders.id UUID
 *
 * In both cases, the binder is resolved/created for the currently authenticated user only.
 */
async function renderBinderEditor(req, res, next) {
  // Define outside try so catch can log it safely
  const binderIdParam = req.params.binderId;

  logger.info(
    {
      event: 'binder.editor.handler_called',
      binderId: binderIdParam,
      path: req.path,
      method: req.method
    },
    'Binder editor handler invoked'
  );

  try {
    const { userId, client } = getContext(req);
    let binder = null;

    // ---------------------------------------------------------
    // Case 1: workspace id, e.g. "default-<userId>"
    // Resolve the per-user default binder or create one.
    // ---------------------------------------------------------
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
          {
            event: 'binder.editor.lookup_failed_default',
            binderId: binderIdParam,
            userId,
            error: binderSelectErr.message
          },
          'Binder lookup by user_id failed for editor (workspace id)'
        );
        const err = new Error('Unable to load binder');
        err.status = 500;
        throw err;
      }

      if (existingBinder) {
        binder = existingBinder;
      } else {
        // No binder row yet for this user → create default one
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
              event: 'binder.editor.create_default_failed',
              binderId: binderIdParam,
              userId,
              error: binderInsertErr.message
            },
            'Failed to create default binder for editor (workspace id)'
          );
          const err = new Error('Unable to create binder');
          err.status = 500;
          throw err;
        }

        binder = createdBinder;
      }
    } else {
      // ---------------------------------------------------------
      // Case 2: real binders.id UUID
      // Enforce ownership: id AND user_id must match.
      // ---------------------------------------------------------
      const { data: binderRow, error: binderErr } = await client
        .from('binders')
        .select('id, user_id, title, created_at, updated_at')
        .eq('id', binderIdParam)
        .eq('user_id', userId)
        .maybeSingle();

      if (binderErr) {
        logger.error(
          {
            event: 'binder.editor.lookup_failed',
            binderId: binderIdParam,
            userId,
            error: binderErr.message
          },
          'Binder lookup failed for editor'
        );
        const err = new Error('Unable to load binder');
        err.status = 500;
        throw err;
      }

      if (!binderRow) {
        logger.warn(
          {
            event: 'binder.editor.not_found',
            binderId: binderIdParam,
            userId
          },
          'Binder not found for editor'
        );
        const err = new Error('Binder not found');
        err.status = 404;
        throw err;
      }

      if (binderRow.user_id !== userId) {
        logger.warn(
          {
            event: 'binder.editor.unauthorized',
            binderId: binderIdParam,
            userId,
            binderUserId: binderRow.user_id
          },
          'User attempted to access binder editor they do not own'
        );
        const err = new Error('Binder not found');
        err.status = 404;
        throw err;
      }

      binder = binderRow;
    }

    // ---------------------------------------------------------
    // Build page model using dashboard presenter
    // ---------------------------------------------------------
    const { buildDashboardPageModel } = require('../ui_contract/presenters');
    const pageModel = await buildDashboardPageModel(req, res);

    // Ensure page/ui structures exist
    pageModel.page = pageModel.page || {};
    pageModel.ui = pageModel.ui || {};

    // Attach binder info for the template / React app
    pageModel.binder = {
      id: binder.id,
      title: binder.title,
      created_at: binder.created_at,
      updated_at: binder.updated_at
    };

    // Ensure nonce and CSRF token
    pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
    pageModel.ui.csrfToken = res.locals.csrfToken || pageModel.ui.csrfToken || '';

    logger.info(
      {
        event: 'binder.editor.rendered',
        binderId: binder.id,
        userId,
        binderIdParam
      },
      'Binder editor page rendered'
    );

    // Render the React/Vite binder editor shell
    res.render('dashboard/binder-editor', pageModel);
  } catch (err) {
    logger.error(
      {
        event: 'binder.editor.render_failed',
        error: err.message,
        binderId: binderIdParam,
        userId: req.user?.id
      },
      'Binder editor render failed'
    );
    next(err);
  }
}

/**
 * GET /dashboard/binder/:binderId/layout
 * Get current layout JSON for a binder
 */
async function getBinderLayout(req, res, next) {
  try {
    const { userId, client } = getContext(req);
    const binderIdParam = req.params.binderId;

    // Resolve workspace ID to real binder UUID
    const { binder, binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: false
    });

    // Fetch layout from binder_layouts (binder_id is text, use binderId as string)
    const { data: layoutRow, error: layoutErr } = await client
      .from('binder_layouts')
      .select('layout_json, updated_at')
      .eq('user_id', userId)
      .eq('binder_id', String(binderId))
      .order('page_number', { ascending: true })
      .limit(100);

    if (layoutErr) {
      logger.error(
        {
          event: 'binder.layout.get.query_failed',
          binderId: binderId,
          userId,
          error: layoutErr.message
        },
        'Layout query failed'
      );
      return res.status(500).json({
        ok: false,
        message: 'Unable to load layout'
      });
    }

    // Build layout structure from rows
    let layout = {
      binderId: binderId,
      pages: [],
      updatedAt: new Date().toISOString()
    };

    if (layoutRow && layoutRow.length > 0) {
      // Collect all photoIds from layers that need storageKey lookup
      const photoIdsToLookup = [];
      layoutRow.forEach(row => {
        const layers = row.layout_json?.layers || [];
        layers.forEach(layer => {
          if (layer.type === 'photo' && layer.photoId && !layer.storageKey) {
            photoIdsToLookup.push(layer.photoId);
          }
        });
      });

      // Fetch storageKey for photos that need it
      const photoStorageMap = {};
      if (photoIdsToLookup.length > 0) {
        const { data: photos, error: photosErr } = await client
          .from('binder_photos')
          .select('id, storage_key')
          .eq('binder_id', binderId)
          .eq('user_id', userId)
          .in('id', photoIdsToLookup);

        if (!photosErr && photos) {
          photos.forEach(photo => {
            photoStorageMap[photo.id] = photo.storage_key;
          });
        }
      }

      // Build pages with enriched layers
      layout.pages = layoutRow.map((row, idx) => {
        const layers = (row.layout_json?.layers || []).map(layer => {
          // Enrich photo layers with storageKey if missing
          if (layer.type === 'photo' && layer.photoId && !layer.storageKey) {
            const storageKey = photoStorageMap[layer.photoId];
            if (storageKey) {
              return { ...layer, storageKey };
            }
          }
          return layer;
        });

        return {
          pageIndex: idx,
          layers,
          sectionKey: row.layout_json?.sectionKey || null
        };
      });
      layout.updatedAt = layoutRow[0].updated_at || layout.updatedAt;
    }

    logger.info(
      {
        event: 'binder.layout.get.success',
        binderId: binder.id,
        userId,
        pageCount: layout.pages.length
      },
      'Layout retrieved successfully'
    );

    return res.json({
      ok: true,
      layout
    });
  } catch (err) {
    logger.error(
      {
        event: 'binder.layout.get.failed',
        error: err.message,
        binderId: req.params.binderId,
        userId: req.user?.id
      },
      'Binder layout get failed'
    );
    next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/layout/apply
 * Save layout changes to database
 */
async function applyBinderLayout(req, res, next) {
  try {
    const { userId, client } = getContext(req);
    const binderIdParam = req.params.binderId;
    const layout = req.body;

    // Validate request body
    if (!layout || typeof layout !== 'object') {
      return res.status(400).json({
        ok: false,
        message: 'Invalid layout data'
      });
    }

    if (!Array.isArray(layout.pages)) {
      return res.status(400).json({
        ok: false,
        message: 'Layout pages must be an array'
      });
    }

    // Resolve workspace ID to real binder UUID
    const { binder, binderId } = await resolveBinder({
      client,
      userId,
      binderIdParam,
      createIfMissing: true // Create binder if missing for workspace IDs
    });

    // Validate binderId matches if provided in layout
    if (layout.binderId && layout.binderId !== binderIdParam && layout.binderId !== binderId) {
      return res.status(400).json({
        ok: false,
        message: 'Binder ID mismatch'
      });
    }

    // Delete existing layouts for this binder (binder_id is text)
    const { error: deleteErr } = await client
      .from('binder_layouts')
      .delete()
      .eq('user_id', userId)
      .eq('binder_id', String(binderId));

    if (deleteErr) {
      logger.error(
        {
          event: 'binder.layout.apply.delete_failed',
          binderId: binderId,
          userId,
          error: deleteErr.message
        },
        'Failed to delete existing layouts'
      );
      return res.status(500).json({
        ok: false,
        message: 'Unable to save layout'
      });
    }

    // Insert new layouts (one row per page, binder_id is text)
    const layoutRows = layout.pages.map((page, idx) => ({
      user_id: userId,
      binder_id: String(binderId),
      page_number: idx + 1,
      layout_json: {
        layers: page.layers || [],
        sectionKey: page.sectionKey || null
      }
    }));

    if (layoutRows.length > 0) {
      const { error: insertErr } = await client
        .from('binder_layouts')
        .insert(layoutRows);

      if (insertErr) {
        logger.error(
          {
            event: 'binder.layout.apply.insert_failed',
            binderId: binderId,
            userId,
            error: insertErr.message
          },
          'Failed to insert new layouts'
        );
        return res.status(500).json({
          ok: false,
          message: 'Unable to save layout'
        });
      }
    }

    // Update binder updated_at
    await client
      .from('binders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', binderId)
      .eq('user_id', userId);

    const updatedAt = new Date().toISOString();

    logger.info(
      {
        event: 'binder.layout.apply.success',
        binderId: binder.id,
        userId,
        pageCount: layout.pages.length
      },
      'Layout saved successfully'
    );

    return res.json({
      ok: true,
      updatedAt
    });
  } catch (err) {
      logger.error(
        {
          event: 'binder.layout.apply.failed',
          error: err.message,
          binderId: binderIdParam,
          userId: req.user?.id
        },
        'Binder layout apply failed'
      );
    next(err);
  }
}

/**
 * POST /dashboard/binder/:binderId/layout/auto
 * Generate auto layout using server-side algorithm
 */
async function autoLayoutBinder(req, res, next) {
  try {
    const { userId, client } = getContext(req);
    const binderIdParam = req.params.binderId;

    // Look up the specific binder by ID and verify ownership
    const { data: binder, error: binderErr } = await client
      .from('binders')
      .select('id, user_id')
      .eq('id', binderIdParam)
      .eq('user_id', userId)
      .maybeSingle();

    if (binderErr || !binder || binder.user_id !== userId) {
      logger.warn(
        {
          event: 'binder.layout.auto.unauthorized',
          binderId: binderIdParam,
          userId
        },
        'Unauthorized auto layout attempt'
      );
      return res.status(404).json({
        ok: false,
        message: 'Binder not found'
      });
    }

    // Fetch photos for this binder
    const { data: photos, error: photosErr } = await client
      .from('binder_photos')
      .select('id, storage_key, position')
      .eq('binder_id', binder.id)
      .eq('user_id', userId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (photosErr) {
      logger.error(
        {
          event: 'binder.layout.auto.photos_failed',
          binderId: binder.id,
          userId,
          error: photosErr.message
        },
        'Failed to fetch photos for auto layout'
      );
      return res.status(500).json({
        ok: false,
        message: 'Unable to load photos'
      });
    }

    // Simple auto layout algorithm: grid layout, 2 photos per page
    const photosPerPage = 2;
    const pageWidth = 800;
    const pageHeight = 1000;
    const margin = 50;
    const photoWidth = (pageWidth - margin * 3) / 2;
    const photoHeight = (pageHeight - margin * 3) / 2;

    const pages = [];
    const photoList = photos || [];

    for (let i = 0; i < photoList.length; i += photosPerPage) {
      const pagePhotos = photoList.slice(i, i + photosPerPage);
      const layers = pagePhotos.map((photo, idx) => {
        const row = Math.floor(idx / 2);
        const col = idx % 2;
        return {
          id: `layer-${photo.id}`,
          type: 'photo',
          x: margin + col * (photoWidth + margin),
          y: margin + row * (photoHeight + margin),
          width: photoWidth,
          height: photoHeight,
          rotation: 0,
          zIndex: idx,
          photoId: photo.id,
          storageKey: photo.storage_key
        };
      });

      pages.push({
        pageIndex: pages.length,
        layers
      });
    }

    // If no photos, create one empty page
    if (pages.length === 0) {
      pages.push({
        pageIndex: 0,
        layers: []
      });
    }

    const layout = {
      binderId: binder.id,
      pages,
      updatedAt: new Date().toISOString()
    };

    // Save the auto-generated layout
    const { error: deleteErr } = await client
      .from('binder_layouts')
      .delete()
      .eq('user_id', userId)
      .eq('binder_id', String(binder.id));

    if (!deleteErr && pages.length > 0) {
      const layoutRows = pages.map((page, idx) => ({
        user_id: userId,
        binder_id: String(binder.id),
        page_number: idx + 1,
        layout_json: {
          layers: page.layers
        }
      }));

      const { error: insertErr } = await client
        .from('binder_layouts')
        .insert(layoutRows);

      if (insertErr) {
        logger.error(
          {
            event: 'binder.layout.auto.save_failed',
            binderId: binder.id,
            userId,
            error: insertErr.message
          },
          'Failed to save auto-generated layout'
        );
        return res.status(500).json({
          ok: false,
          message: 'Unable to save auto layout'
        });
      }
    }

    // Update binder updated_at
    await client
      .from('binders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', binder.id)
      .eq('user_id', userId);

    logger.info(
      {
        event: 'binder.layout.auto.success',
        binderId: binder.id,
        userId,
        pageCount: pages.length,
        photoCount: photoList.length
      },
      'Auto layout generated successfully'
    );

    return res.json({
      ok: true,
      layout
    });
  } catch (err) {
      logger.error(
        {
          event: 'binder.layout.auto.failed',
          error: err.message,
          binderId: binderIdParam,
          userId: req.user?.id
        },
        'Binder auto layout failed'
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
  renderBinderEditor,
  getBinderLayout,
  applyBinderLayout,
  autoLayoutBinder
};