// File: server/controllers/binderController.js
// Purpose: Controller for the proof-of-relationship binder feature
// Status: DB-backed version (uses Supabase tables + S3/local uploads)

'use strict';

// I am loading `crypto` into `crypto` so this file can reuse that dependency below.
const crypto = require('crypto');
// I am loading `pdfkit` into `PDFDocument` so this file can reuse that dependency below.
const PDFDocument = require('pdfkit');

// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../middleware/security` into `validateCaptionServerSide` so this file can reuse that dependency below.
const { validateCaptionServerSide } = require('../middleware/security');
// I am loading `../ui_contract/presenters` into `buildDashboardPageModel` so this file can reuse that dependency below.
const { buildDashboardPageModel } = require('../ui_contract/presenters');
// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  validateAndNormalizeLayout,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  assertOwnedPhotoReferences
// I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
} = require('../services/binderLayoutValidator');

// Storage provider (safe-load so the app can boot even if not configured)
let storageProvider = null;
// I am starting a guarded operation here because a request, parser, or dependency used below may fail.
try {
  // Delay this provider load so non-storage routes can still start in a partial environment.
  storageProvider = require('../services/storageProvider');
// I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
} catch (err) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.warn(
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    { event: 'binder.storage_provider_unavailable', error: err.message },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Storage provider module not found; binder uploads/export image fetch may fail until configured'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Shared server-side image validation (aligns with dashboard.js client filtering)
// -----------------------------------------------------------------------------
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'image/jpeg',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'image/jpg',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'image/png',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'image/webp',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'image/heic',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'image/heif',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'image/avif'
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
]);

// I am saving `ALLOWED_IMAGE_EXTENSIONS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|avif)$/i;

// I am keeping `isAllowedImageUpload` as a named helper so the surrounding workflow can call this step when it needs it.
function isAllowedImageUpload(file) {
  // Upload metadata varies by browser and device, especially for HEIC images. Accept a
  // supported MIME type or filename extension, then let storage/rendering handle the file.
  if (!file) return false;
  // I am saving `mimeOk` here so the nearby steps can reuse the same value without rebuilding it each time.
  const mimeOk = file.mimetype && ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype);
  // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
  const name = file.originalname || '';
  // I am saving `extOk` here so the nearby steps can reuse the same value without rebuilding it each time.
  const extOk = ALLOWED_IMAGE_EXTENSIONS.test(name);
  // Accept if either MIME or extension says "image we support"
  return mimeOk || extOk;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getUserIdFromReq` as a named helper so the surrounding workflow can call this step when it needs it.
function getUserIdFromReq(req) {
  // Authentication middleware may expose either Supabase's id or the older uid alias.
  return (req.user && (req.user.id || req.user.uid)) || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Small helper: ensure we have a logged-in user and a Supabase admin client.
 */
function getContext(req) {
  // Controllers use this pair for every user-scoped query below.
  const userId = getUserIdFromReq(req);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!userId) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Unauthorized: missing user id on request');
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 401;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!supabaseAdmin) {
    // Return unavailable rather than attempting database work with an uninitialized client.
    const err = new Error('Supabase admin client not initialized');
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 503;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return { userId, client: supabaseAdmin };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Resolve workspace ID (default-{userId}) to real binder UUID, or return existing UUID.
 * Creates binder if missing for workspace IDs.
 */
async function resolveBinder({ client, userId, binderIdParam, createIfMissing = true }) {
  // 1. Accept the dashboard's default-{user} workspace alias or a real binder UUID.
  // 2. Resolve every lookup through user_id so a valid UUID never grants cross-user access.
  // 3. Create the first binder only for the default workspace path when the caller allows it.
  if (!binderIdParam || !userId) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Missing binderId or userId');
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 400;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `binderIdStr` here so the nearby steps can reuse the same value without rebuilding it each time.
  const binderIdStr = String(binderIdParam);

  // Case 1: Workspace ID (default-{userId})
  if (binderIdStr.startsWith('default-')) {
    // The oldest binder is the stable default workspace for this user.
    const { data: existingBinder, error: binderSelectErr } = await client
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('binders')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, user_id, title, created_at, updated_at')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .order('created_at', { ascending: true })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .limit(1)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .maybeSingle();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (binderSelectErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.resolve.lookup_failed',
          // I am keeping the `binderId` field in this object so the receiving code can read that value by its expected name.
          binderId: binderIdStr,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: binderSelectErr.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Binder lookup by user_id failed'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
      const err = new Error('Unable to resolve binder');
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      err.status = 500;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (existingBinder) {
      // Return both the row and UUID so routes can render metadata and scope later queries.
      return { binder: existingBinder, binderId: existingBinder.id };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!createIfMissing) {
      // Read/delete routes should not create data merely because a binder was absent.
      const err = new Error('Binder not found');
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      err.status = 404;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: createdBinder, error: binderInsertErr } = await client
      // New default workspaces start as drafts and receive their database UUID here.
      .from('binders')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .insert({
        // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
        user_id: userId,
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: 'My relationship story binder',
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: 'draft'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, user_id, title, created_at, updated_at')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (binderInsertErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.resolve.create_failed',
          // I am keeping the `binderId` field in this object so the receiving code can read that value by its expected name.
          binderId: binderIdStr,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: binderInsertErr.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to create default binder'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
      const err = new Error('Unable to create binder');
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      err.status = 500;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return { binder: createdBinder, binderId: createdBinder.id };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Case 2: Real UUID - verify ownership
  // Keep ownership in the query itself instead of fetching a foreign row and checking later.
  const { data: binderRow, error: binderErr } = await client
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('binders')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select('id, user_id, title, created_at, updated_at')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('id', binderIdStr)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('user_id', userId)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .maybeSingle();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (binderErr) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.resolve.query_failed',
        // I am keeping the `binderId` field in this object so the receiving code can read that value by its expected name.
        binderId: binderIdStr,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: binderErr.message
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Binder query failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Unable to resolve binder');
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 500;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!binderRow) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Binder not found');
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 404;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return { binder: binderRow, binderId: binderRow.id };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------

const SECTION_DEFS = {
  // I am keeping the `overview` field in this object so the receiving code can read that value by its expected name.
  overview: { label: 'Our Story Overview', prefix: 'O' },
  // I am keeping the `photos` field in this object so the receiving code can read that value by its expected name.
  photos: { label: 'Photos Together', prefix: 'P' },
  // I am keeping the `trips` field in this object so the receiving code can read that value by its expected name.
  trips: { label: 'Trips & Visits', prefix: 'T' },
  // I am keeping the `family` field in this object so the receiving code can read that value by its expected name.
  family: { label: 'Family & Friends', prefix: 'F' },
  // I am keeping the `chats` field in this object so the receiving code can read that value by its expected name.
  chats: { label: 'Screenshots & Chats', prefix: 'C' },
  // I am keeping the `receipts` field in this object so the receiving code can read that value by its expected name.
  receipts: { label: 'Receipts / Support / Financial', prefix: 'R' }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// A4 at 96 DPI
const LAYOUT_LOGICAL_WIDTH = 794;
// I am saving `LAYOUT_LOGICAL_HEIGHT` here so the nearby steps can reuse the same value without rebuilding it each time.
const LAYOUT_LOGICAL_HEIGHT = 1122;

// Must match client CAPTION_H (binder-editor React app)
const CAPTION_LOGICAL_PX = 88;

// -----------------------------------------------------------------------------
// Image fetch for PDF export (uses storageProvider.getBinderPhotoBuffer if present)
// -----------------------------------------------------------------------------
async function fetchImageBufferForLayer(layer) {
  // PDF rendering cannot use a browser URL; it needs the stored photo bytes as a Buffer.
  if (!layer?.storageKey) return null;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!storageProvider || typeof storageProvider.getBinderPhotoBuffer !== 'function') return null;

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // storageProvider hides whether these bytes come from S3 or the local development folder.
    const { buffer } = await storageProvider.getBinderPhotoBuffer(layer.storageKey);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (buffer && buffer.length > 0) return buffer;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.pdf.image_fetch_failed',
        // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
        storageKey: layer.storageKey,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: err.message
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to fetch image buffer for layer via storageProvider'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `renderBinderPageBody` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function renderBinderPageBody({
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  doc,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  pageLayout,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  exhibitInfo,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  binderTitle,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  totalPages,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  contentPageNumber,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  marginPt = 0,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  client = null,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  userId = null,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  binderId = null,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  captionByStorageKey = null
// I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
}) {
  // The editor saves positions in one fixed logical page size. This renderer scales that
  // coordinate system onto PDFKit's page so the export matches the on-screen composition.
  // 1. Map the editor's A4 coordinate system onto this PDF page.
  // 2. Draw layers in z-order, fetching owned photo bytes when needed.
  // 3. Clip photos with cover sizing and place database captions in the reserved band.
  const sectionDef = SECTION_DEFS[pageLayout.sectionKey] || SECTION_DEFS.photos;
  // I am saving `exhibitCode` here so the nearby steps can reuse the same value without rebuilding it each time.
  const exhibitCode = exhibitInfo
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    ? `${(SECTION_DEFS[exhibitInfo.sectionKey] || sectionDef).prefix}-${exhibitInfo.exhibitNo}`
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    : `${sectionDef.prefix}-1`;

  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  void exhibitCode;
  // Keep these accepted arguments visible for planned headers without triggering lint warnings.
  void binderTitle;
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  void totalPages;
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  void contentPageNumber;
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  void marginPt;

  // I am saving `pageWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pageWidth = doc.page.width;
  // I am saving `pageHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pageHeight = doc.page.height;

  // I am saving `contentWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
  const contentWidth = pageWidth;
  // I am saving `contentHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const contentHeight = pageHeight;

  // I am saving `scale` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scale = Math.min(contentWidth / LAYOUT_LOGICAL_WIDTH, contentHeight / LAYOUT_LOGICAL_HEIGHT);

  // Center the logical surface if PDFKit's A4 rounding leaves a small unused edge.
  const surfaceWidth = LAYOUT_LOGICAL_WIDTH * scale;
  // I am saving `surfaceHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const surfaceHeight = LAYOUT_LOGICAL_HEIGHT * scale;

  // I am saving `baseX` here so the nearby steps can reuse the same value without rebuilding it each time.
  const baseX = (contentWidth - surfaceWidth) / 2;
  // I am saving `baseY` here so the nearby steps can reuse the same value without rebuilding it each time.
  const baseY = (contentHeight - surfaceHeight) / 2;

  // I am calling this helper here so the current workflow performs this step before it moves on.
  doc.save().rect(baseX, baseY, surfaceWidth, surfaceHeight).fill('#ffffff').stroke('#dddddd').restore();

  // I am saving `layers` here so the nearby steps can reuse the same value without rebuilding it each time.
  const layers = (pageLayout.layers || []).slice().sort((a, b) => {
    // Sort a copy so export never mutates the layout object loaded from the database.
    const za = typeof a.zIndex === 'number' ? a.zIndex : 0;
    // I am saving `zb` here so the nearby steps can reuse the same value without rebuilding it each time.
    const zb = typeof b.zIndex === 'number' ? b.zIndex : 0;
    // This return sends the completed value or response back to the code that called this function.
    return za - zb;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const layer of layers) {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Normalize geometry before translating it from logical pixels to PDF points.
      const x = Number(layer.x) || 0;
      // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
      const y = Number(layer.y) || 0;
      // I am saving `w` here so the nearby steps can reuse the same value without rebuilding it each time.
      const w = Number(layer.width) || 0;
      // I am saving `h` here so the nearby steps can reuse the same value without rebuilding it each time.
      const h = Number(layer.height) || 0;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (w <= 0 || h <= 0) continue;

      // I am saving `pdfX` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pdfX = baseX + x * scale;
      // I am saving `pdfY` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pdfY = baseY + y * scale;
      // I am saving `pdfW` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pdfW = w * scale;
      // I am saving `pdfH` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pdfH = h * scale;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (layer.type === 'photo') {
        // Work on a copy because legacy photoId repair is only for this export pass.
        let layerWithStorageKey = { ...layer };

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!layerWithStorageKey.storageKey && layerWithStorageKey.photoId && client && userId && binderId) {
          // Older layouts may need one owned-row lookup to recover their storage key.
          try {
            // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
            const { data: photo } = await client
              // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
              .from('binder_photos')
              // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
              .select('storage_key')
              // I am continuing the existing call chain here so this option stays attached to the same operation started above.
              .eq('id', layerWithStorageKey.photoId)
              // I am continuing the existing call chain here so this option stays attached to the same operation started above.
              .eq('binder_id', binderId)
              // I am continuing the existing call chain here so this option stays attached to the same operation started above.
              .eq('user_id', userId)
              // I am continuing the existing call chain here so this option stays attached to the same operation started above.
              .maybeSingle();

            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (photo && photo.storage_key) {
              // The fetch helper below reads this recovered key exactly like a current layout.
              layerWithStorageKey.storageKey = photo.storage_key;
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
          // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
          } catch (lookupErr) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            logger.warn(
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              {
                // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
                event: 'binder.pdf.photo_lookup_failed',
                // I am keeping the `layerId` field in this object so the receiving code can read that value by its expected name.
                layerId: layer.id,
                // I am keeping the `photoId` field in this object so the receiving code can read that value by its expected name.
                photoId: layerWithStorageKey.photoId,
                // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
                error: lookupErr.message
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              },
              // I am listing this entry here because the surrounding collection processes each allowed value in order.
              'Failed to lookup photo storageKey'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `captionBand` here so the nearby steps can reuse the same value without rebuilding it each time.
        const captionBand = Math.min(pdfH, CAPTION_LOGICAL_PX * scale);
        // Match Layer.jsx: saved photo height includes the fixed caption area at the bottom.
        const imgHeight = pdfH - captionBand;
        // I am saving `imgY` here so the nearby steps can reuse the same value without rebuilding it each time.
        const imgY = pdfY;

        // I am saving `buf` here so the nearby steps can reuse the same value without rebuilding it each time.
        const buf = await fetchImageBufferForLayer(layerWithStorageKey);

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!buf) {
          // Keep page geometry intact when a storage object is missing or temporarily unavailable.
          doc.save().rect(pdfX, imgY, pdfW, imgHeight).fill('#f3f4f6').stroke('#e5e7eb').restore();
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          doc
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fontSize(9)
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fillColor('#6b7280')
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .text('Photo unavailable', pdfX + 4, imgY + 4, {
              // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
              width: pdfW - 8,
              // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
              height: imgHeight - 8
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fillColor('#000000');
        // This alternative runs only when the condition above did not use its first path.
        } else {
          // Cover scaling fills the saved frame, then clipping removes overflow on either axis.
          const img = doc.openImage(buf);
          // I am saving `scaleByWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
          const scaleByWidth = pdfW / img.width;
          // I am saving `scaleByHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
          const scaleByHeight = imgHeight / img.height;
          // I am saving `coverScale` here so the nearby steps can reuse the same value without rebuilding it each time.
          const coverScale = Math.max(scaleByWidth, scaleByHeight);

          // I am saving `scaledWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
          const scaledWidth = img.width * coverScale;
          // I am saving `scaledHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
          const scaledHeight = img.height * coverScale;

          // I am saving `drawX` here so the nearby steps can reuse the same value without rebuilding it each time.
          const drawX = pdfX + (pdfW - scaledWidth) / 2;
          // Center the covered image so cropping stays balanced like the editor preview.
          const drawY = imgY + (imgHeight - scaledHeight) / 2;

          // I am calling this helper here so the current workflow performs this step before it moves on.
          doc.save();
          // I am calling this helper here so the current workflow performs this step before it moves on.
          doc.rect(pdfX, imgY, pdfW, imgHeight).clip();
          // I am calling this helper here so the current workflow performs this step before it moves on.
          doc.translate(drawX, drawY);
          // I am calling this helper here so the current workflow performs this step before it moves on.
          doc.scale(coverScale, coverScale);
          // I am calling this helper here so the current workflow performs this step before it moves on.
          doc.image(img, 0, 0, { width: img.width, height: img.height });
          // I am calling this helper here so the current workflow performs this step before it moves on.
          doc.restore();
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `caption` here so the nearby steps can reuse the same value without rebuilding it each time.
        let caption = '';
        // Caption rows are loaded once in exportPdf and passed here as a storage-key map.
        if (captionByStorageKey && layerWithStorageKey.storageKey) {
          // I am saving `rawCap` here so the nearby steps can reuse the same value without rebuilding it each time.
          const rawCap = captionByStorageKey.get(layerWithStorageKey.storageKey);
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (typeof rawCap === 'string') caption = rawCap.trim();
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (caption) {
          // Leave a small inset so text does not touch the photo frame or page edge.
          const captionY = imgY + imgHeight + 4;
          // I am saving `captionHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
          const captionHeight = captionBand - 8;

          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          doc
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fontSize(9)
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fillColor('#374151')
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .text(caption, pdfX + 4, captionY, {
              // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
              width: pdfW - 8,
              // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
              height: captionHeight,
              // I am keeping the `align` field in this object so the receiving code can read that value by its expected name.
              align: 'center'
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fillColor('#000000');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (layer.type === 'text') {
        // Text layers keep their own bordered box and render only when saved text exists.
        doc.save().rect(pdfX, pdfY, pdfW, pdfH).fill('#ffffff').stroke('#e5e7eb').restore();
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (layer.text) {
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          doc
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fontSize(11)
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fillColor('#111827')
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .text(layer.text, pdfX + 4, pdfY + 4, {
              // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
              width: pdfW - 8,
              // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
              height: pdfH - 8
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            })
            // I am continuing the existing call chain here so this option stays attached to the same operation started above.
            .fillColor('#000000');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        doc.save().rect(pdfX, pdfY, pdfW, pdfH).stroke('#e5e7eb').restore();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // One malformed image/layer should not prevent the remaining binder pages from exporting.
      logger.warn(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.pdf.layer_render_failed',
          // I am keeping the `layerId` field in this object so the receiving code can read that value by its expected name.
          layerId: layer.id,
          // I am keeping the `layerType` field in this object so the receiving code can read that value by its expected name.
          layerType: layer.type,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: err.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to render layer in PDF'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * GET /dashboard/binder
 */
async function list(req, res, next) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // getContext supplies the authenticated user scope used in this list query.
    const { userId, client } = getContext(req);

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data, error } = await client
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('binders')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, title, created_at, updated_at')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .order('created_at', { ascending: false });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'binder.list_query_failed', error: error.message, userId }, 'Binder list query failed');
      // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
      const err = new Error('Unable to load binders');
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      err.status = 500;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, binders: data || [] });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // Express's shared error responder owns the final failure shape.
    logger.error({ event: 'binder.list_failed', error: err.message, userId: getUserIdFromReq(req) }, 'Binder list handler failed');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * GET /dashboard/binder/new
 */
function newForm(req, res, next) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This return sends the completed value or response back to the code that called this function.
    return res.send('Binder builder placeholder – DB is wired, UI canvas comes next.');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ event: 'binder.new_form_failed', error: err.message, userId: getUserIdFromReq(req) }, 'Binder newForm handler failed');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * POST /dashboard/binder
 */
async function create(req, res, next) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);
    // Use a readable fallback when a normal form or API caller omits the title.
    const rawTitle = (req.body && req.body.title) || '';
    // I am saving `title` here so the nearby steps can reuse the same value without rebuilding it each time.
    const title = rawTitle.trim() || 'Untitled binder';

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data, error } = await client
      // user_id is always taken from middleware context, never from the posted body.
      .from('binders')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .insert({ user_id: userId, title })
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, title, created_at, updated_at')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .single();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'binder.create_query_failed', error: error.message, userId, title }, 'Binder create insert failed');
      // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
      const err = new Error('Unable to create binder');
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      err.status = 500;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(201).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: true,
      // I am keeping the `binderId` field in this object so the receiving code can read that value by its expected name.
      binderId: data.id,
      // I am keeping the `binder` field in this object so the receiving code can read that value by its expected name.
      binder: data,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Binder created successfully'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ event: 'binder.create_failed', error: err.message, userId: getUserIdFromReq(req) }, 'Binder create handler failed');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * POST /dashboard/binder/:binderId/photos
 */
async function addPhotos(req, res, next) {
  // Each accepted file is stored first and then recorded in binder_photos. The response
  // gives the editor stable database/storage references for its new photo layers.
  const binderIdParam = String(req.params.binderId || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);

    // binderRoutes/multer has parsed files by this point; the controller still needs storage.
    if (!storageProvider || typeof storageProvider.saveBinderPhoto !== 'function') {
      // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
      const err = new Error('Photo storage is not configured');
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      err.status = 503;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `allFiles` here so the nearby steps can reuse the same value without rebuilding it each time.
    const allFiles = Array.isArray(req.files) ? req.files : [];
    // Reject the empty request before resolving or creating a binder row.
    if (!allFiles.length) return res.status(400).json({ ok: false, error: 'No files uploaded' });

    // Repeat format validation server-side because browser accept filters can be bypassed.
    const safeFiles = allFiles.filter(isAllowedImageUpload);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!safeFiles.length) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Only image files (JPG, PNG, HEIC, WEBP, AVIF) are allowed.'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Resolve/create binder row based on URL binderId
    const { binder, binderId: binderUuid } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `uploaded` here so the nearby steps can reuse the same value without rebuilding it each time.
    const uploaded = [];

    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const file of safeFiles) {
      // Save bytes first so the metadata row records the provider's canonical storage details.
      const storageResult = await storageProvider.saveBinderPhoto({
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        userId,
        binderId: binderUuid, // IMPORTANT: store under real binder UUID
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        file
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const { data: photoRows, error: photoErr } = await client
        // This owned row is what later view, caption, export, and delete routes authorize against.
        .from('binder_photos')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .insert({
          // I am keeping the `binder_id` field in this object so the receiving code can read that value by its expected name.
          binder_id: binderUuid,
          // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
          user_id: userId,
          // I am keeping the `storage_key` field in this object so the receiving code can read that value by its expected name.
          storage_key: storageResult.storageKey,
          // I am keeping the `original_filename` field in this object so the receiving code can read that value by its expected name.
          original_filename: storageResult.originalFilename,
          // I am keeping the `mime_type` field in this object so the receiving code can read that value by its expected name.
          mime_type: storageResult.mimeType,
          // I am keeping the `size_bytes` field in this object so the receiving code can read that value by its expected name.
          size_bytes: storageResult.sizeBytes,
          // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
          status: 'stored'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .select('id, created_at')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .limit(1);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (photoErr) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error(
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          {
            // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
            event: 'binder.photo_insert_failed',
            // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
            binderIdParam,
            // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
            binderUuid,
            // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
            userId,
            // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
            storageKey: storageResult.storageKey,
            // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
            error: photoErr.message,
            // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
            code: photoErr.code
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Failed to insert binder_photos row'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw photoErr;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `inserted` here so the nearby steps can reuse the same value without rebuilding it each time.
      const inserted = Array.isArray(photoRows) && photoRows[0] ? photoRows[0] : null;

      // Return both legacy display fields and stable database/storage identifiers to App.
      uploaded.push({
        // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
        storageKey: storageResult.storageKey,
        // I am keeping the `originalname` field in this object so the receiving code can read that value by its expected name.
        originalname: storageResult.originalFilename,
        // I am keeping the `mimetype` field in this object so the receiving code can read that value by its expected name.
        mimetype: storageResult.mimeType,
        // I am keeping the `size` field in this object so the receiving code can read that value by its expected name.
        size: storageResult.sizeBytes,
        // I am keeping the `provider` field in this object so the receiving code can read that value by its expected name.
        provider: storageResult.provider,
        // I am keeping the `bucket` field in this object so the receiving code can read that value by its expected name.
        bucket: storageResult.bucket,
        // I am keeping the `publicUrl` field in this object so the receiving code can read that value by its expected name.
        publicUrl: storageResult.publicUrl || null,
        // I am keeping the `signedUrl` field in this object so the receiving code can read that value by its expected name.
        signedUrl: storageResult.signedUrl || null,
        // I am keeping the `photoId` field in this object so the receiving code can read that value by its expected name.
        photoId: inserted?.id || null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.json({
      // App keeps the route-facing ID while database work continues with binderUuid.
      ok: true,
      // Keep the response binderId compatible with the caller (legacy dashboard uses URL param)
      binderId: binderIdParam,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderUuid,
      // I am keeping the `binder` field in this object so the receiving code can read that value by its expected name.
      binder: {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: binderUuid,
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: binder?.title || '',
        // I am keeping the `created_at` field in this object so the receiving code can read that value by its expected name.
        created_at: binder?.created_at || null,
        // I am keeping the `updated_at` field in this object so the receiving code can read that value by its expected name.
        updated_at: binder?.updated_at || null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `uploadedCount` field in this object so the receiving code can read that value by its expected name.
      uploadedCount: uploaded.length,
      // I am keeping the `photos` field in this object so the receiving code can read that value by its expected name.
      photos: uploaded
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.add_photos_failed',
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        binderIdParam,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: err.message,
        // I am keeping the `stack` field in this object so the receiving code can read that value by its expected name.
        stack: err.stack,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: getUserIdFromReq(req)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Binder addPhotos handler failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * PATCH /dashboard/binder/:binderId/photos/caption
 */
async function updatePhotoCaption(req, res, next) {
  // api.updatePhotoCaption sends the storage key and draft caption to this route.
  const binderIdParam = String(req.params.binderId || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);
    // I am saving `storageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const storageKey = String((req.body && req.body.storageKey) || '');
    // Convert missing input to an empty string before the shared validator normalizes it.
    const rawCaption = String((req.body && req.body.caption) || '');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!storageKey) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, message: 'storageKey is required' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { binderId } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: false
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: photoRow, error: photoErr } = await client
      // Bind the key to this binder and user before accepting it as the update target.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, caption')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('storage_key', storageKey)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .maybeSingle();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photoErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.caption.photo_lookup_failed',
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderIdParam,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderId,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          storageKey,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: photoErr.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to verify photo ownership before caption update'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!photoRow) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `valid` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { valid, error, sanitized } = validateCaptionServerSide(rawCaption);
    // security.js owns length/content rules so browser and server checks cannot diverge silently.
    if (!valid) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, message: error || 'Invalid caption' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `captionToStore` here so the nearby steps can reuse the same value without rebuilding it each time.
    const captionToStore = sanitized || null;

    // Store null for an empty caption while returning an empty string that Layer can display.
    const { error: updateErr } = await client
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .update({ caption: captionToStore })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('id', photoRow.id)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (updateErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        { event: 'binder.caption.update_failed', binderIdParam, binderId, storageKey, userId, error: updateErr.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to update binder photo caption'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to save caption right now.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, caption: captionToStore || '' });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.caption.unhandled_error',
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        binderIdParam,
        // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
        storageKey: req.body?.storageKey,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: getUserIdFromReq(req),
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: err.message,
        // I am keeping the `stack` field in this object so the receiving code can read that value by its expected name.
        stack: err.stack
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Unhandled error in updatePhotoCaption'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This return sends the completed value or response back to the code that called this function.
    return next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * POST /dashboard/binder/:binderId/export
 */
async function exportPdf(req, res, next) {
  // Export rebuilds the binder from persisted layout rows and owned photo records. Keeping
  // this server-side avoids trusting browser-supplied image paths in the generated PDF.
  const binderIdParam = String(req.params.binderId || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // 1. Resolve the owned binder and load its persisted layout/photo rows.
    // 2. Normalize legacy references and section groupings in memory.
    // 3. Stream PDFKit pages to the response in saved page order.
    const { userId, client } = getContext(req);

    // I am saving `binder` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { binder, binderId } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: false
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: layoutRows, error: layoutErr } = await client
      // Export reads only saved rows; App flushes dirty state before it calls this endpoint.
      .from('binder_layouts')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('page_number, layout_json')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', String(binderId))
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .order('page_number', { ascending: true });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (layoutErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'binder.pdf.layout_query_failed', error: layoutErr.message, binderId, userId }, 'Layout query failed for PDF');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to export PDF' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: photoRows, error: photosErr } = await client
      // One owned-photo query supports captions and both legacy photo reference forms.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, storage_key, caption')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photosErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'binder.pdf.captions_query_failed', binderId, userId, error: photosErr.message }, 'Failed to load binder photo captions for PDF');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `captionByStorageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const captionByStorageKey = new Map();
    // Build maps once so every page layer can resolve in constant time below.
    const ownedPhotoById = new Map();
    // I am saving `ownedPhotoByStorageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ownedPhotoByStorageKey = new Map();
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (photoRows || []).forEach((row) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (row.id) ownedPhotoById.set(String(row.id), row);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (row.storage_key) ownedPhotoByStorageKey.set(String(row.storage_key), row);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (row.storage_key && typeof row.caption === 'string') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        captionByStorageKey.set(row.storage_key, row.caption);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `pages` here so the nearby steps can reuse the same value without rebuilding it each time.
    let pages = (layoutRows || []).map((row, idx) => {
      // Database rows may hold JSON objects or older serialized strings.
      const layoutJson =
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;

      // This return sends the completed value or response back to the code that called this function.
      return {
        // I am keeping the `pageIndex` field in this object so the receiving code can read that value by its expected name.
        pageIndex: typeof row.page_number === 'number' ? row.page_number - 1 : idx,
        // I am keeping the `sectionKey` field in this object so the receiving code can read that value by its expected name.
        sectionKey: layoutJson?.sectionKey || null,
        // I am mapping the collection here so each input item becomes the output shape expected by the next step.
        layers: (layoutJson?.layers || []).map((layer) => {
          // Never pass an unowned photo reference into the storage fetch path.
          if (layer?.type !== 'photo') return layer;
          // I am saving `owned` here so the nearby steps can reuse the same value without rebuilding it each time.
          const owned =
            // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
            (layer.photoId && ownedPhotoById.get(String(layer.photoId))) ||
            // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
            (layer.storageKey && ownedPhotoByStorageKey.get(String(layer.storageKey)));
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (!owned) return { ...layer, photoId: null, storageKey: null };
          // This return sends the completed value or response back to the code that called this function.
          return { ...layer, photoId: String(owned.id), storageKey: String(owned.storage_key) };
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        })
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `anySection` here so the nearby steps can reuse the same value without rebuilding it each time.
    const anySection = pages.some((p) => p.sectionKey);
    // Apply legacy defaults only when the saved layout predates section assignments entirely.
    pages = pages.map((p, idx) => {
      // I am saving `sectionKey` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sectionKey = p.sectionKey ? p.sectionKey : anySection ? null : idx === 0 ? 'overview' : 'photos';
      // This return sends the completed value or response back to the code that called this function.
      return { ...p, sectionKey: sectionKey || 'photos' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `totalPages` here so the nearby steps can reuse the same value without rebuilding it each time.
    const totalPages = pages.length;

    // I am saving `sectionCounters` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sectionCounters = {};
    // Consecutive runs form exhibits, with numbering tracked separately per section type.
    const exhibits = [];
    // I am saving `current` here so the nearby steps can reuse the same value without rebuilding it each time.
    let current = null;

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    pages.forEach((p, idx) => {
      // I am saving `key` here so the nearby steps can reuse the same value without rebuilding it each time.
      const key = p.sectionKey || 'photos';
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!current || current.sectionKey !== key) {
        // Start a new exhibit when the section changes in saved page order.
        sectionCounters[key] = (sectionCounters[key] || 0) + 1;
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        current = {
          // I am keeping the `sectionKey` field in this object so the receiving code can read that value by its expected name.
          sectionKey: key,
          // I am keeping the `exhibitNo` field in this object so the receiving code can read that value by its expected name.
          exhibitNo: sectionCounters[key],
          // I am keeping the `startContentPage` field in this object so the receiving code can read that value by its expected name.
          startContentPage: idx + 1,
          // I am keeping the `endContentPage` field in this object so the receiving code can read that value by its expected name.
          endContentPage: idx + 1
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
        // I am calling this helper here so the current workflow performs this step before it moves on.
        exhibits.push(current);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        current.endContentPage = idx + 1;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `getExhibitForPage` here so the nearby steps can reuse the same value without rebuilding it each time.
    const getExhibitForPage = (contentPageNumber) =>
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      exhibits.find((ex) => contentPageNumber >= ex.startContentPage && contentPageNumber <= ex.endContentPage);

    // I am saving `doc` here so the nearby steps can reuse the same value without rebuilding it each time.
    const doc = new PDFDocument({ autoFirstPage: false, size: 'A4', margin: 0 });

    // Set download headers before piping because PDFKit begins writing as pages are added.
    res.setHeader('Content-Type', 'application/pdf');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.setHeader('Content-Disposition', `attachment; filename="relationship-binder-${binderId || 'draft'}.pdf"`);

    // I am calling this helper here so the current workflow performs this step before it moves on.
    doc.pipe(res);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (pages.length === 0) {
      // Still return a valid PDF so the preview/download caller can handle an empty binder.
      doc.addPage();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      doc.fontSize(12).text('No pages available.', { align: 'center' });
      // I am calling this helper here so the current workflow performs this step before it moves on.
      doc.end();
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (let idx = 0; idx < pages.length; idx++) {
      // Render sequentially because each page awaits its storage-backed image buffers.
      const pageLayout = pages[idx];
      // I am saving `contentPageNumber` here so the nearby steps can reuse the same value without rebuilding it each time.
      const contentPageNumber = idx + 1;
      // I am saving `exhibitInfo` here so the nearby steps can reuse the same value without rebuilding it each time.
      const exhibitInfo = getExhibitForPage(contentPageNumber);

      // I am calling this helper here so the current workflow performs this step before it moves on.
      doc.addPage({ size: 'A4', margin: 0 });

      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await renderBinderPageBody({
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        doc,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        pageLayout,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        exhibitInfo,
        // I am keeping the `binderTitle` field in this object so the receiving code can read that value by its expected name.
        binderTitle: binder.title || 'Relationship Binder',
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        totalPages,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        contentPageNumber,
        // I am keeping the `marginPt` field in this object so the receiving code can read that value by its expected name.
        marginPt: 0,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        client,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        binderId,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        captionByStorageKey
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    doc.end();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // A failure before or during streaming is logged and handed to Express's error path.
    logger.error(
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      { event: 'binder.export_failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Binder exportPdf handler failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * GET /dashboard/binder/:binderId/editor
 */
async function renderBinderEditor(req, res, next) {
  // binderRoutes sends the protected editor page here with the route-facing binder ID.
  const binderIdParam = String(req.params.binderId || '');

  // I am calling this helper here so the current workflow performs this step before it moves on.
  logger.info(
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    { event: 'binder.editor.handler_called', binderId: binderIdParam, path: req.path, method: req.method },
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'Binder editor handler invoked'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);

    // Always resolve based on URL param; create default binder if missing
    const { binder } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `pageModel` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageModel = await buildDashboardPageModel(req, res);

    // The presenter supplies the shared dashboard shell; these fields add editor-specific data.
    pageModel.page = pageModel.page || {};
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    pageModel.ui = pageModel.ui || {};

    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    pageModel.page.nonce = res.locals.nonce || pageModel.page.nonce || '';
    // The EJS view puts nonce/version/CSRF data on the React mount element used by api.js/Layer.
    pageModel.page.assetVersion = res.locals.assetVersion || pageModel.page.assetVersion || '';

    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    pageModel.ui.csrfToken = res.locals.csrfToken || pageModel.ui.csrfToken || '';

    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    pageModel.binder = {
      // Expose only the binder metadata the editor template needs to mount React.
      id: binder.id,
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: binder.title,
      // I am keeping the `created_at` field in this object so the receiving code can read that value by its expected name.
      created_at: binder.created_at,
      // I am keeping the `updated_at` field in this object so the receiving code can read that value by its expected name.
      updated_at: binder.updated_at
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.render('dashboard/binder-editor', pageModel);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      { event: 'binder.editor.render_failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Binder editor render failed'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * GET /dashboard/binder/:binderId/photos/view-url?storageKey=...
 */
async function getPhotoViewUrl(req, res, next) {
  // Layer and preloadPhotos call this helper before placing a private image in the browser.
  const binderIdParam = String(req.params.binderId || '');
  // I am saving `storageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const storageKey = String(req.query.storageKey || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!storageKey) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, message: 'storageKey query parameter is required' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { binderId: binderUuid } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: false
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: photo, error: photoErr } = await client
      // Authorize the exact binder/user/key tuple before revealing any usable URL.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderUuid)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('storage_key', storageKey)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .maybeSingle();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photoErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.view_url.photo_lookup_failed',
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderIdParam,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderUuid,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          storageKey,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: photoErr.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to verify photo ownership for view-url'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!photo) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Cache the resolved URL response (browser-side) for faster tab switches.
    res.setHeader('Cache-Control', 'private, max-age=10800'); // 3 hours
    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.setHeader('Vary', 'Cookie');

    // I am saving `publicUrl` here so the nearby steps can reuse the same value without rebuilding it each time.
    let publicUrl = null;
    // Prefer the provider's CDN/public URL when configured; otherwise keep access behind auth.
    if (storageProvider && typeof storageProvider.getBinderPhotoPublicUrl === 'function') {
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      publicUrl = storageProvider.getBinderPhotoPublicUrl(storageKey);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (publicUrl) {
      // This return sends the completed value or response back to the code that called this function.
      return res.json({ ok: true, url: publicUrl, via: 'cdn' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `rawPath` here so the nearby steps can reuse the same value without rebuilding it each time.
    const rawPath =
      // The raw endpoint repeats ownership verification before streaming bytes.
      `/dashboard/binder/${encodeURIComponent(binderIdParam)}` +
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      `/photos/raw?storageKey=${encodeURIComponent(storageKey)}`;

    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, url: rawPath, via: 'raw' });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.view_url.error',
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        binderIdParam,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        storageKey,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: getUserIdFromReq(req),
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: err.status || 500,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: err.message,
        // I am keeping the `stack` field in this object so the receiving code can read that value by its expected name.
        stack: err.stack
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to generate view url for binder photo'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * GET /dashboard/binder/:binderId/photos/raw?storageKey=...
 * Streams the photo bytes from S3/local to the browser.
 */
async function streamPhotoRaw(req, res, next) {
  // Verify the storage key against a user-owned binder row before opening the stream. A
  // valid-looking key alone is not enough authorization to read private photo bytes.
  const binderIdParam = String(req.params.binderId || '');
  // I am saving `storageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const storageKey = String(req.query.storageKey || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);

    // Fail before a database/storage call when the route is incomplete or provider is unavailable.
    if (!storageKey) return res.status(400).send('storageKey is required');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!storageProvider || typeof storageProvider.getBinderPhotoStream !== 'function') {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(503).send('Photo storage is not configured.');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { binderId: binderUuid } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: false
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: photoRow, error: photoErr } = await client
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, mime_type')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderUuid)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('storage_key', storageKey)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .maybeSingle();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photoErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.raw.photo_lookup_failed',
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderIdParam,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderUuid,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          storageKey,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: photoErr.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to verify photo ownership for raw endpoint'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).send('Unable to verify photo ownership.');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!photoRow) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).send('Photo not found for this binder.');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `stream` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { stream, contentType, contentLength } = await storageProvider.getBinderPhotoStream(storageKey);
    // Prefer provider metadata, with the owned database row and generic bytes as fallbacks.
    const finalContentType = contentType || photoRow.mime_type || 'application/octet-stream';

    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.setHeader('Content-Type', finalContentType);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (contentLength) res.setHeader('Content-Length', String(contentLength));
    res.setHeader('Cache-Control', 'private, max-age=10800'); // 3 hours
    // I am calling this helper here so the current workflow performs this step before it moves on.
    res.setHeader('Vary', 'Cookie');

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    stream.on('error', (e) => {
      // Headers may already contain streamed bytes, so the late-error response must only end.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.raw.stream_error',
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderIdParam,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderUuid,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          storageKey,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: e.message
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Error while streaming binder photo'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!res.headersSent) res.status(500).end('Error streaming photo');
      // This alternative runs only when the condition above did not use its first path.
      else res.end();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am calling this helper here so the current workflow performs this step before it moves on.
    stream.pipe(res);
    // Node backpressure is handled by the stream pipe rather than buffering the whole photo here.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.raw.unhandled_error',
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        binderIdParam,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        storageKey,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: getUserIdFromReq(req),
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: err.status || 500,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: err.message,
        // I am keeping the `stack` field in this object so the receiving code can read that value by its expected name.
        stack: err.stack
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Unhandled error in raw photo endpoint'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * DELETE /dashboard/binder/:binderId/photos?storageKey=...
 */
async function deletePhoto(req, res, next) {
  // Ownership is checked before both database and storage cleanup so a caller cannot use
  // this endpoint as a general-purpose delete operation against the backing provider.
  const binderIdParam = String(req.params.binderId || '');
  // I am saving `storageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const storageKey = String((req.query && req.query.storageKey) || (req.body && req.body.storageKey) || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!storageKey) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, message: 'storageKey is required to delete a photo.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!storageProvider || typeof storageProvider.deleteBinderPhoto !== 'function') {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(503).json({ ok: false, message: 'Photo storage is not configured.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { binderId: binderUuid } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: false
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: photoRow, error: photoErr } = await client
      // Resolve the metadata row first; its ID becomes the narrow database delete target.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderUuid)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('storage_key', storageKey)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .maybeSingle();

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photoErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.delete.photo_lookup_failed',
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderIdParam,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderUuid,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          storageKey,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: photoErr.message,
          // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
          code: photoErr.code
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to verify photo ownership for delete'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!photoRow) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(404).json({ ok: false, message: 'Photo not found for this binder.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await storageProvider.deleteBinderPhoto(storageKey);

    // Remove metadata only after provider cleanup succeeds so a failed object delete stays retryable.
    const { error: dbErr } = await client.from('binder_photos').delete().eq('id', photoRow.id).eq('user_id', userId).select('id');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (dbErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        {
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'binder.photo_db_delete_failed',
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderIdParam,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          binderUuid,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          storageKey,
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          userId,
          // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
          error: dbErr.message,
          // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
          code: dbErr.code
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to delete binder photo metadata from DB'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to delete photo metadata right now.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error(
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'binder.delete.error',
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        binderIdParam,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        storageKey,
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: getUserIdFromReq(req),
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: err.status || 500,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: err.message,
        // I am keeping the `stack` field in this object so the receiving code can read that value by its expected name.
        stack: err.stack
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Failed to delete binder photo'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * GET /dashboard/binder/:binderId/layout
 */
async function getBinderLayout(req, res, next) {
  // api.getLayout calls this route during App's initial binder load.
  const binderIdParam = String(req.params.binderId || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { userId, client } = getContext(req);

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { binderId } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: false
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: layoutRows, error: layoutErr } = await client
      // The 200-row limit mirrors validator safeguards and protects the editor load path.
      .from('binder_layouts')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('page_number, layout_json, updated_at')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', String(binderId))
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .order('page_number', { ascending: true })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .limit(200);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (layoutErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'binder.layout.get.query_failed', binderId, userId, error: layoutErr.message }, 'Layout query failed');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to load layout' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: pageRows, error: pagesErr } = await client
      // The pages table supplies stable drag IDs for layouts saved before pageId was embedded.
      .from('pages')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, page_number')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .order('page_number', { ascending: true });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (pagesErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({ event: 'binder.pages.load_failed_for_layout', binderId, userId, error: pagesErr.message }, 'Could not load pages table for layout');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `pageIdByNumber` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageIdByNumber = {};
    // Page number is the compatibility join between the two historical table shapes.
    (pageRows || []).forEach((p) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (p?.page_number && p?.id) pageIdByNumber[Number(p.page_number)] = String(p.id);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `layout` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layout = {
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderId,
      // I am keeping the `pages` field in this object so the receiving code can read that value by its expected name.
      pages: [],
      // I am keeping the `updatedAt` field in this object so the receiving code can read that value by its expected name.
      updatedAt: new Date().toISOString()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!layoutRows || layoutRows.length === 0) {
      // Return one local starter page without writing it; applyBinderLayout persists the first edit.
      const newPageId = crypto.randomUUID();
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      layout.pages = [{ id: newPageId, pageId: newPageId, pageIndex: 0, layers: [], sectionKey: 'photos' }];
      // This return sends the completed value or response back to the code that called this function.
      return res.json({ ok: true, layout });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `photoIdsSet` here so the nearby steps can reuse the same value without rebuilding it each time.
    const photoIdsSet = new Set();
    // Older saved layouts may carry only photoId. Resolve storage keys in one scoped
    // query so the current editor can load them without issuing a lookup per layer.
    for (const row of layoutRows) {
      // I am saving `layoutJson` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layoutJson = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      // I am saving `layers` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layers = layoutJson?.layers || [];
      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const layer of layers) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (layer?.type === 'photo' && layer.photoId && !layer.storageKey) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          photoIdsSet.add(String(layer.photoId));
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `photoIdsToLookup` here so the nearby steps can reuse the same value without rebuilding it each time.
    const photoIdsToLookup = Array.from(photoIdsSet);

    // I am saving `photoStorageMap` here so the nearby steps can reuse the same value without rebuilding it each time.
    const photoStorageMap = {};
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (photoIdsToLookup.length > 0) {
      // One binder/user-scoped query repairs every legacy photoId in this response.
      const { data: photos, error: photosErr } = await client
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from('binder_photos')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .select('id, storage_key')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .eq('binder_id', binderId)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .eq('user_id', userId)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .in('id', photoIdsToLookup);

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (photosErr) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn({ event: 'binder.layout.photo_storage_lookup_failed', binderId, userId, error: photosErr.message }, 'Failed to lookup photo storage_keys for layout');
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (photos) {
        // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
        for (const p of photos) {
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (p?.id && p?.storage_key) photoStorageMap[String(p.id)] = p.storage_key;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: photoRows, error: captionsErr } = await client
      // Captions live on photo rows, so merge them into layout layers for Layer.jsx to display.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('storage_key, caption')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (captionsErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'binder.layout.captions_query_failed', binderId, userId, error: captionsErr.message }, 'Failed to load binder photo captions for layout');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `captionByStorageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const captionByStorageKey = new Map();
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (photoRows || []).forEach((row) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (row.storage_key && typeof row.caption === 'string') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        captionByStorageKey.set(row.storage_key, row.caption);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // Reading also performs a best-effort compatibility repair for layouts saved before
    // stable page IDs existed. Build the response regardless; failed backfills can retry
    // on a later read.
    const pagesNeedingUpsert = [];
    // I am saving `layoutRowsNeedingPatch` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layoutRowsNeedingPatch = [];

    // I am mapping the collection here so each input item becomes the output shape expected by the next step.
    layout.pages = layoutRows.map((row, idx) => {
      // Use row order as a fallback, but preserve an explicit database page number when present.
      const pageNumber = typeof row.page_number === 'number' ? row.page_number : idx + 1;
      // I am saving `pageIndex` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pageIndex = pageNumber - 1;

      // I am saving `layoutJsonRaw` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layoutJsonRaw = row.layout_json && typeof row.layout_json === 'string' ? safeJsonParse(row.layout_json) : row.layout_json;
      // I am saving `layoutJson` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layoutJson = layoutJsonRaw && typeof layoutJsonRaw === 'object' ? layoutJsonRaw : {};

      // I am saving `pageId` here so the nearby steps can reuse the same value without rebuilding it each time.
      let pageId = layoutJson.pageId ? String(layoutJson.pageId) : null;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!pageId && pageIdByNumber[pageNumber]) {
        // Recover the ID from pages without scheduling a database repair.
        pageId = String(pageIdByNumber[pageNumber]);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!pageId) {
        // Generate once for the response and queue both tables for best-effort backfill.
        pageId = crypto.randomUUID();

        // I am calling this helper here so the current workflow performs this step before it moves on.
        pagesNeedingUpsert.push({
          // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
          id: pageId,
          // I am keeping the `binder_id` field in this object so the receiving code can read that value by its expected name.
          binder_id: binderId,
          // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
          user_id: userId,
          // I am keeping the `page_number` field in this object so the receiving code can read that value by its expected name.
          page_number: pageNumber
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });

        // I am calling this helper here so the current workflow performs this step before it moves on.
        layoutRowsNeedingPatch.push({
          // I am keeping the `page_number` field in this object so the receiving code can read that value by its expected name.
          page_number: pageNumber,
          // I am keeping the `next_layout_json` field in this object so the receiving code can read that value by its expected name.
          next_layout_json: { ...layoutJson, pageId }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `rawLayers` here so the nearby steps can reuse the same value without rebuilding it each time.
      const rawLayers = layoutJson.layers || [];
      // I am saving `layers` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layers = rawLayers.map((layer) => {
        // Enrich a copy only when legacy photo metadata or current caption data is available.
        let enriched = layer;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (enriched?.type === 'photo' && enriched.photoId && !enriched.storageKey) {
          // I am saving `storageKey2` here so the nearby steps can reuse the same value without rebuilding it each time.
          const storageKey2 = photoStorageMap[String(enriched.photoId)];
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (storageKey2) enriched = { ...enriched, storageKey: storageKey2 };
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (enriched?.type === 'photo' && enriched.storageKey) {
          // I am saving `cap` here so the nearby steps can reuse the same value without rebuilding it each time.
          const cap = captionByStorageKey.get(enriched.storageKey);
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (typeof cap === 'string' && cap.length > 0) {
            // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
            enriched = { ...enriched, caption: cap };
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This return sends the completed value or response back to the code that called this function.
        return enriched;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // This return sends the completed value or response back to the code that called this function.
      return {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: pageId,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        pageId,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        pageIndex,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        layers,
        // I am keeping the `sectionKey` field in this object so the receiving code can read that value by its expected name.
        sectionKey: layoutJson.sectionKey || null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (pagesNeedingUpsert.length > 0) {
      // Backfill is allowed to fail because the normalized response is already usable this request.
      const { error: upsertErr } = await client.from('pages').upsert(pagesNeedingUpsert, { onConflict: 'id' });
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (upsertErr) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn({ event: 'binder.pages.backfill_failed', binderId, userId, error: upsertErr.message }, 'Failed to backfill pages table with generated pageIds');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const patch of layoutRowsNeedingPatch) {
      // Patch each historical row by its existing binder/page scope to preserve other layout fields.
      try {
        // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
        const { error: patchErr } = await client
          // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
          .from('binder_layouts')
          // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
          .update({ layout_json: patch.next_layout_json })
          // I am continuing the existing call chain here so this option stays attached to the same operation started above.
          .eq('user_id', userId)
          // I am continuing the existing call chain here so this option stays attached to the same operation started above.
          .eq('binder_id', String(binderId))
          // I am continuing the existing call chain here so this option stays attached to the same operation started above.
          .eq('page_number', patch.page_number);

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (patchErr) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.warn(
            // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
            { event: 'binder.layout.backfill_pageid_failed', binderId, userId, pageNumber: patch.page_number, error: patchErr.message },
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'Failed to backfill layout_json.pageId'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (e) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.warn(
          // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
          { event: 'binder.layout.backfill_pageid_exception', binderId, userId, pageNumber: patch.page_number, error: e.message },
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'Exception while backfilling layout_json.pageId'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `latestUpdatedAt` here so the nearby steps can reuse the same value without rebuilding it each time.
    const latestUpdatedAt =
      // The newest per-page timestamp becomes the editor's single save-status timestamp.
      (layoutRows || [])
        // I am mapping the collection here so each input item becomes the output shape expected by the next step.
        .map((r) => r.updated_at)
        // I am filtering the collection here so only items that pass the nearby check continue to the next step.
        .filter(Boolean)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .sort()
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .slice(-1)[0] || null;

    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    layout.updatedAt = latestUpdatedAt || layout.updatedAt;

    // This return sends the completed value or response back to the code that called this function.
    return res.json({ ok: true, layout });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ event: 'binder.layout.get.failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) }, 'Binder layout get failed');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// -----------------------------------------------------------------------------
// Pages reorder helper + applyBinderLayout
// -----------------------------------------------------------------------------

async function syncPagesTableOrder({ client, userId, binderId, layoutPages }) {
  // 1. Validate stable incoming IDs and load the owned database rows.
  // 2. Preserve database-only pages at the end rather than treating reorder as deletion.
  // 3. Use temporary page numbers before assigning the final order to avoid unique collisions.
  if (!Array.isArray(layoutPages)) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('layoutPages must be an array');
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 400;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `incomingIds` here so the nearby steps can reuse the same value without rebuilding it each time.
  const incomingIds = layoutPages
    // Accept historical aliases but normalize every value to the database string ID.
    .map((p) => String(p?.pageId || p?.id || p?.page_id || ''))
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    .filter(Boolean);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (incomingIds.length !== layoutPages.length) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error('Each page must have a stable pageId/id for reorder');
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 400;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { data: existingRows, error: existingErr } = await client
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .from('pages')
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    .select('id, binder_id, user_id, page_number')
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('binder_id', binderId)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .eq('user_id', userId)
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .order('page_number', { ascending: true })
    // I am continuing the existing call chain here so this option stays attached to the same operation started above.
    .limit(5000);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (existingErr) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error(`Unable to load pages for reorder: ${existingErr.message || 'unknown error'}`);
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 500;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `existing` here so the nearby steps can reuse the same value without rebuilding it each time.
  const existing = Array.isArray(existingRows) ? existingRows : [];
  // The set makes it cheap to find database rows omitted by this editor payload.
  const incomingSet = new Set(incomingIds);

  // Pages absent from this editor payload are kept at the end rather than silently
  // deleted here. Deletion has its own flow and storage cleanup rules.
  const extraIds = existing
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    .filter((r) => !incomingSet.has(String(r.id)))
    // I am mapping the collection here so each input item becomes the output shape expected by the next step.
    .map((r) => String(r.id));

  // I am saving `fullOrder` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fullOrder = [...incomingIds, ...extraIds];

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const row of existing) {
    // Keep this defensive ownership check even though the select query is already scoped.
    if (String(row.binder_id) !== String(binderId) || String(row.user_id) !== String(userId)) {
      // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
      const err = new Error('Invalid pageId provided (does not belong to this binder)');
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      err.status = 400;
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw err;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `maxPageNumber` here so the nearby steps can reuse the same value without rebuilding it each time.
  const maxPageNumber = existing.reduce((m, r) => {
    // Temporary numbers start beyond every current value in this binder.
    const n = Number(r.page_number);
    // This return sends the completed value or response back to the code that called this function.
    return Number.isFinite(n) ? Math.max(m, n) : m;
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  }, 0);

  // Move every row out of the final number range first. This avoids transient uniqueness
  // collisions when two pages swap positions under a unique binder/page_number index.
  const tempBase = maxPageNumber + 1000;

  // I am saving `tempRows` here so the nearby steps can reuse the same value without rebuilding it each time.
  const tempRows = fullOrder.map((id, idx) => ({
    // Upsert also creates incoming page IDs that are new to the pages table.
    id,
    // I am keeping the `binder_id` field in this object so the receiving code can read that value by its expected name.
    binder_id: binderId,
    // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
    user_id: userId,
    // I am keeping the `page_number` field in this object so the receiving code can read that value by its expected name.
    page_number: tempBase + idx + 1
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  }));

  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { error: tempErr } = await client.from('pages').upsert(tempRows, { onConflict: 'id' });
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (tempErr) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error(`Unable to reorder pages (temp step): ${tempErr.message || 'unknown error'}`);
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 500;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `finalRows` here so the nearby steps can reuse the same value without rebuilding it each time.
  const finalRows = fullOrder.map((id, idx) => ({
    // The editor's array order becomes the one-based database page_number order.
    id,
    // I am keeping the `binder_id` field in this object so the receiving code can read that value by its expected name.
    binder_id: binderId,
    // I am keeping the `user_id` field in this object so the receiving code can read that value by its expected name.
    user_id: userId,
    // I am keeping the `page_number` field in this object so the receiving code can read that value by its expected name.
    page_number: idx + 1
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  }));

  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const { error: finalErr } = await client.from('pages').upsert(finalRows, { onConflict: 'id' });
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (finalErr) {
    // I am saving `err` here so the nearby steps can reuse the same value without rebuilding it each time.
    const err = new Error(`Unable to reorder pages (final step): ${finalErr.message || 'unknown error'}`);
    // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
    err.status = 500;
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw err;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `pageCount` field in this object so the receiving code can read that value by its expected name.
    pageCount: incomingIds.length,
    // I am keeping the `usedClientIds` field in this object so the receiving code can read that value by its expected name.
    usedClientIds: true,
    // I am keeping the `extraDbPagesAppended` field in this object so the receiving code can read that value by its expected name.
    extraDbPagesAppended: extraIds.length
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `applyBinderLayout` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function applyBinderLayout(req, res, next) {
  // App autosave posts the complete layout to this controller through binderRoutes.
  const binderIdParam = String(req.params.binderId || '');

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // 1. Validate shape/limits and resolve the owned binder.
    // 2. Verify page/photo references, then synchronize stable page order.
    // 3. Replace persisted per-page layouts and return the server timestamp to App.
    const { userId, client } = getContext(req);
    // I am saving `layout` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layout = validateAndNormalizeLayout(req.body);

    // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { binderId } = await resolveBinder({
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      client,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      binderIdParam,
      // I am keeping the `createIfMissing` field in this object so the receiving code can read that value by its expected name.
      createIfMissing: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (layout.binderId && layout.binderId !== binderIdParam && layout.binderId !== binderId) {
      // Accept either the route alias or resolved UUID, but never a third binder identity.
      return res.status(400).json({ ok: false, message: 'Binder ID mismatch' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Payload validation proves shape, not ownership. Verify stable page IDs and photo
    // references against rows scoped to the authenticated user before writing anything.
    const normalizedPages = layout.pages;
    // Query claimed IDs without binder filtering so a foreign existing ID can be detected.
    const incomingPageIds = normalizedPages.map((page) => page.pageId);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (incomingPageIds.length > 0) {
      // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
      const { data: claimedPages, error: claimedPagesErr } = await client
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .from('pages')
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        .select('id, binder_id, user_id')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .in('id', incomingPageIds);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (claimedPagesErr) {
        // This return sends the completed value or response back to the code that called this function.
        return res.status(500).json({ ok: false, message: 'Unable to verify page ownership' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am saving `foreignPage` here so the nearby steps can reuse the same value without rebuilding it each time.
      const foreignPage = (claimedPages || []).find(
        // Every existing claim must match both the resolved binder and authenticated user.
        (row) => String(row.binder_id) !== String(binderId) || String(row.user_id) !== String(userId)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (foreignPage) return res.status(400).json({ ok: false, message: 'Invalid pageId provided' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: ownedPhotos, error: ownedPhotosErr } = await client
      // The validator uses this scoped allowlist to canonicalize all photo references.
      .from('binder_photos')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .select('id, storage_key')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', binderId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (ownedPhotosErr) {
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to verify photo ownership' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    assertOwnedPhotoReferences(layout, ownedPhotos || []);

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Keep page-table synchronization isolated so its specific error can return cleanly.
      await syncPagesTableOrder({
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        client,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        binderId,
        // I am keeping the `layoutPages` field in this object so the receiving code can read that value by its expected name.
        layoutPages: normalizedPages
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (e) {
      // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
      const status = e.status || 500;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error(
        // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
        { event: 'binder.pages.reorder_failed', binderId, binderIdParam, userId, error: e.message },
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to persist page order to pages table'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
      // This return sends the completed value or response back to the code that called this function.
      return res.status(status).json({ ok: false, message: e.message || 'Unable to reorder pages right now.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // binder_layouts stores one row per page. Replace the binder's row set so removed
    // pages do not leave stale layout rows behind; every query remains user/binder scoped.
    const { error: deleteErr } = await client
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('binder_layouts')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .delete()
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('binder_id', String(binderId));

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (deleteErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.error({ event: 'binder.layout.apply.delete_failed', binderId, userId, error: deleteErr.message }, 'Failed to delete existing layouts');
      // This return sends the completed value or response back to the code that called this function.
      return res.status(500).json({ ok: false, message: 'Unable to save layout' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `layoutRows` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layoutRows = normalizedPages.map((page, idx) => ({
      // Persist only the per-page fields the load/export paths read from layout_json.
      user_id: userId,
      // I am keeping the `binder_id` field in this object so the receiving code can read that value by its expected name.
      binder_id: String(binderId),
      // I am keeping the `page_number` field in this object so the receiving code can read that value by its expected name.
      page_number: idx + 1,
      // I am keeping the `layout_json` field in this object so the receiving code can read that value by its expected name.
      layout_json: {
        // I am keeping the `pageId` field in this object so the receiving code can read that value by its expected name.
        pageId: page.pageId,
        // I am keeping the `layers` field in this object so the receiving code can read that value by its expected name.
        layers: page.layers || [],
        // I am keeping the `sectionKey` field in this object so the receiving code can read that value by its expected name.
        sectionKey: page.sectionKey || null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    }));

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (layoutRows.length > 0) {
      // Empty binders intentionally leave no binder_layouts rows after the scoped delete.
      const { error: insertErr } = await client.from('binder_layouts').insert(layoutRows);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (insertErr) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        logger.error({ event: 'binder.layout.apply.insert_failed', binderId, userId, error: insertErr.message }, 'Failed to insert new layouts');
        // This return sends the completed value or response back to the code that called this function.
        return res.status(500).json({ ok: false, message: 'Unable to save layout' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await client
      // Touch binder metadata for list ordering/status; layout rows keep their own timestamps too.
      .from('binders')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .update({ updated_at: new Date().toISOString() })
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('id', binderId)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId);

    // I am saving `updatedAt` here so the nearby steps can reuse the same value without rebuilding it each time.
    const updatedAt = new Date().toISOString();

    // This return sends the completed value or response back to the code that called this function.
    return res.json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: true,
      // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
      updatedAt,
      // I am mapping the collection here so each input item becomes the output shape expected by the next step.
      pageIds: normalizedPages.map((p) => p.pageId),
      // I am keeping the `layout` field in this object so the receiving code can read that value by its expected name.
      layout: { ...layout, binderId, updatedAt }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ event: 'binder.layout.apply.failed', error: err.message, binderId: binderIdParam, userId: getUserIdFromReq(req) }, 'Binder layout apply failed');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(err);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `safeJsonParse` as a named helper so the surrounding workflow can call this step when it needs it.
function safeJsonParse(v) {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Historical layout rows may still be serialized strings rather than JSON columns.
    return JSON.parse(v);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // This return sends the completed value or response back to the code that called this function.
    return null;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from binderController.js.
module.exports = {
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  list,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  newForm,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  create,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  addPhotos,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  updatePhotoCaption,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  exportPdf,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  renderBinderEditor,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  getPhotoViewUrl,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  streamPhotoRaw,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  deletePhoto,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  getBinderLayout,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  applyBinderLayout,
  // I am keeping this line here because the surrounding binderController.js workflow expects this value or operation before it continues.
  resolveBinder
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
