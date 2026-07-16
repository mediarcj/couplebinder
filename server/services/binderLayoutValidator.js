// File: server/services/binderLayoutValidator.js
// Description: Validate and normalize binder layouts before persistence or export
// Purpose: Keep untrusted editor JSON inside the bounds the server knows how to handle
// Notes: Shape checks happen here; binder/photo ownership is checked with database rows supplied by the controller.

'use strict';

// These limits are both business rules and resource guards. Keep the page dimensions
// in sync with the editor/PDF renderer so a layout accepted here can be rendered there.
const PAGE_WIDTH = 794;
// I am saving `PAGE_HEIGHT` here so the nearby steps can reuse the same value without rebuilding it each time.
const PAGE_HEIGHT = 1122;
// I am saving `MAX_PAGES` here so the nearby steps can reuse the same value without rebuilding it each time.
const MAX_PAGES = 200;
// I am saving `MAX_LAYERS_PER_PAGE` here so the nearby steps can reuse the same value without rebuilding it each time.
const MAX_LAYERS_PER_PAGE = 500;
// I am saving `MAX_TOTAL_LAYERS` here so the nearby steps can reuse the same value without rebuilding it each time.
const MAX_TOTAL_LAYERS = 5000;
// I am saving `ALLOWED_SECTIONS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_SECTIONS = new Set(['overview', 'photos', 'trips', 'family', 'chats', 'receipts']);
// I am saving `ALLOWED_LAYER_TYPES` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_LAYER_TYPES = new Set(['photo', 'text']);

// I am keeping `invalid` as a named helper so the surrounding workflow can call this step when it needs it.
function invalid(message) {
  // Controllers pass this status through the shared Express error path as a client error.
  const error = new Error(message);
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  error.status = 400;
  // This return sends the completed value or response back to the code that called this function.
  return error;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `requiredString` as a named helper so the surrounding workflow can call this step when it needs it.
function requiredString(value, label, maxLength = 512) {
  // Normalize IDs/keys once and keep field-specific labels in any validation message.
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${label} is required`);
  // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
  const result = value.trim();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (result.length > maxLength) throw invalid(`${label} is too long`);
  // This return sends the completed value or response back to the code that called this function.
  return result;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `finiteNumber` as a named helper so the surrounding workflow can call this step when it needs it.
function finiteNumber(value, label) {
  // Reject numeric strings, NaN, and Infinity before geometry reaches storage or PDF math.
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(`${label} must be a finite number`);
  // This return sends the completed value or response back to the code that called this function.
  return value;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateCrop` as a named helper so the surrounding workflow can call this step when it needs it.
function validateCrop(crop, label) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (crop == null) return crop;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) throw invalid(`${label} must be an object`);
  // Crop values are ratios, not page pixels, so they must stay inside the source image.
  const normalized = { ...crop };
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const key of ['x', 'y', 'width', 'height']) {
    // I am saving `value` here so the nearby steps can reuse the same value without rebuilding it each time.
    const value = finiteNumber(crop[key], `${label}.${key}`);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (value < 0 || value > 1) throw invalid(`${label}.${key} must be between 0 and 1`);
    // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
    normalized[key] = value;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (normalized.width <= 0 || normalized.height <= 0) throw invalid(`${label} dimensions must be positive`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (normalized.x + normalized.width > 1 || normalized.y + normalized.height > 1) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw invalid(`${label} must remain within the source image`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return normalized;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateLayer` as a named helper so the surrounding workflow can call this step when it needs it.
function validateLayer(layer, pageIndex, layerIndex) {
  // 1. Validate identity/type and fixed-page geometry.
  // 2. Copy optional render fields only after their own checks.
  // 3. Require a photo reference or bound text size depending on layer type.
  const label = `pages[${pageIndex}].layers[${layerIndex}]`;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) throw invalid(`${label} must be an object`);

  // I am saving `id` here so the nearby steps can reuse the same value without rebuilding it each time.
  const id = requiredString(layer.id, `${label}.id`);
  // I am saving `type` here so the nearby steps can reuse the same value without rebuilding it each time.
  const type = requiredString(layer.type, `${label}.type`, 32);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!ALLOWED_LAYER_TYPES.has(type)) throw invalid(`${label}.type is unsupported`);

  // I am saving `x` here so the nearby steps can reuse the same value without rebuilding it each time.
  const x = finiteNumber(layer.x, `${label}.x`);
  // Canvas/App save total photo height, including the caption band, in this geometry.
  const y = finiteNumber(layer.y, `${label}.y`);
  // I am saving `width` here so the nearby steps can reuse the same value without rebuilding it each time.
  const width = finiteNumber(layer.width, `${label}.width`);
  // I am saving `height` here so the nearby steps can reuse the same value without rebuilding it each time.
  const height = finiteNumber(layer.height, `${label}.height`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (x < 0 || y < 0 || width <= 0 || height <= 0) throw invalid(`${label} has invalid geometry`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (x + width > PAGE_WIDTH || y + height > PAGE_HEIGHT) throw invalid(`${label} is outside the page boundaries`);

  // Preserve fields used by newer editor versions while replacing trusted core fields
  // with their validated values. This lets the layout format evolve without weakening
  // the geometry and ownership checks below.
  const normalized = { ...layer, id, type, x, y, width, height };
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (layer.rotation != null) normalized.rotation = finiteNumber(layer.rotation, `${label}.rotation`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (layer.zIndex != null) normalized.zIndex = finiteNumber(layer.zIndex, `${label}.zIndex`);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (layer.crop != null) normalized.crop = validateCrop(layer.crop, `${label}.crop`);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (type === 'photo') {
    // Ownership is checked later, but shape validation requires at least one resolvable identity.
    const photoId = layer.photoId == null ? null : requiredString(layer.photoId, `${label}.photoId`);
    // I am saving `storageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const storageKey = layer.storageKey == null ? null : requiredString(layer.storageKey, `${label}.storageKey`, 2048);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!photoId && !storageKey) throw invalid(`${label} must reference an owned photo`);
    // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
    normalized.photoId = photoId;
    // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
    normalized.storageKey = storageKey;
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (typeof layer.text === 'string' && layer.text.length > 10000) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw invalid(`${label}.text is too long`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return normalized;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateAndNormalizeLayout` as a named helper so the surrounding workflow can call this step when it needs it.
function validateAndNormalizeLayout(layout) {
  // This is the first boundary called by binderController.applyBinderLayout for untrusted JSON.
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw invalid('Invalid layout data');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!Array.isArray(layout.pages)) throw invalid('Layout pages must be an array');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (layout.pages.length > MAX_PAGES) throw invalid(`Layout exceeds the ${MAX_PAGES}-page safety limit`);

  // IDs are later used for updates and ordering, so duplicates would make an otherwise
  // valid-looking payload ambiguous.
  const pageIds = new Set();
  // I am saving `layerIds` here so the nearby steps can reuse the same value without rebuilding it each time.
  const layerIds = new Set();
  // I am saving `totalLayers` here so the nearby steps can reuse the same value without rebuilding it each time.
  let totalLayers = 0;

  // I am saving `pages` here so the nearby steps can reuse the same value without rebuilding it each time.
  const pages = layout.pages.map((page, pageIndex) => {
    // Persist array position as pageIndex while retaining the stable page ID used for reorder.
    const label = `pages[${pageIndex}]`;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!page || typeof page !== 'object' || Array.isArray(page)) throw invalid(`${label} must be an object`);
    // I am saving `pageId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pageId = requiredString(page.pageId || page.id || page.page_id, `${label}.pageId`);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (pageIds.has(pageId)) throw invalid(`Duplicate page ID: ${pageId}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    pageIds.add(pageId);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!Array.isArray(page.layers)) throw invalid(`${label}.layers must be an array`);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (page.layers.length > MAX_LAYERS_PER_PAGE) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw invalid(`${label} exceeds the ${MAX_LAYERS_PER_PAGE}-layer safety limit`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
    totalLayers += page.layers.length;
    // The total guard protects a payload made of many individually valid-sized pages.
    if (totalLayers > MAX_TOTAL_LAYERS) throw invalid(`Layout exceeds the ${MAX_TOTAL_LAYERS}-layer safety limit`);

    // I am saving `sectionKey` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sectionKey = page.sectionKey == null || page.sectionKey === '' ? null : requiredString(page.sectionKey, `${label}.sectionKey`, 32);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (sectionKey && !ALLOWED_SECTIONS.has(sectionKey)) throw invalid(`${label}.sectionKey is unsupported`);

    // I am saving `layers` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layers = page.layers.map((layer, layerIndex) => {
      // Layer IDs are global within the layout because App.updateLayer searches by stable ID.
      const normalized = validateLayer(layer, pageIndex, layerIndex);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (layerIds.has(normalized.id)) throw invalid(`Duplicate layer ID: ${normalized.id}`);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      layerIds.add(normalized.id);
      // This return sends the completed value or response back to the code that called this function.
      return normalized;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This return sends the completed value or response back to the code that called this function.
    return { ...page, id: pageId, pageId, pageIndex, layers, sectionKey };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This return sends the completed value or response back to the code that called this function.
  return { ...layout, pages };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `assertOwnedPhotoReferences` as a named helper so the surrounding workflow can call this step when it needs it.
function assertOwnedPhotoReferences(layout, ownedPhotoRows) {
  // Accept either identifier for compatibility with older saved layouts, but resolve
  // both through rows already scoped to this user and binder by the controller.
  const byId = new Map();
  // I am saving `byKey` here so the nearby steps can reuse the same value without rebuilding it each time.
  const byKey = new Map();
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const row of ownedPhotoRows || []) {
    // binderController has already scoped these rows to the authenticated user and binder.
    if (row?.id) byId.set(String(row.id), row);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (row?.storage_key) byKey.set(String(row.storage_key), row);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const page of layout.pages) {
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const layer of page.layers) {
      // Text layers have no storage ownership relationship to verify here.
      if (layer.type !== 'photo') continue;
      // I am saving `idRow` here so the nearby steps can reuse the same value without rebuilding it each time.
      const idRow = layer.photoId ? byId.get(String(layer.photoId)) : null;
      // I am saving `keyRow` here so the nearby steps can reuse the same value without rebuilding it each time.
      const keyRow = layer.storageKey ? byKey.get(String(layer.storageKey)) : null;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!idRow && !keyRow) throw invalid(`Photo layer ${layer.id} does not belong to this binder`);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (idRow && keyRow && String(idRow.id) !== String(keyRow.id)) {
        // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
        throw invalid(`Photo layer ${layer.id} contains mismatched photo references`);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // Canonicalize both fields so subsequent saves no longer depend on which legacy
      // reference happened to be present in the incoming layout.
      const row = idRow || keyRow;
      // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
      layer.photoId = String(row.id);
      // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
      layer.storageKey = String(row.storage_key);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return layout;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from binderLayoutValidator.js.
module.exports = {
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  PAGE_WIDTH,
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  PAGE_HEIGHT,
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  MAX_PAGES,
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  MAX_LAYERS_PER_PAGE,
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  MAX_TOTAL_LAYERS,
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  validateAndNormalizeLayout,
  // I am keeping this line here because the surrounding binderLayoutValidator.js workflow expects this value or operation before it continues.
  assertOwnedPhotoReferences
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
