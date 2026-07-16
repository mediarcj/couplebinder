// Description: Validate and normalize binder layouts before persistence or export
// Purpose: Keep untrusted editor JSON inside the bounds the server knows how to handle
// Notes: Shape checks happen here; binder/photo ownership is checked with database rows supplied by the controller.

'use strict';

// These limits are both business rules and resource guards. Keep the page dimensions
// in sync with the editor/PDF renderer so a layout accepted here can be rendered there.
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;
const MAX_PAGES = 200;
const MAX_LAYERS_PER_PAGE = 500;
const MAX_TOTAL_LAYERS = 5000;
const ALLOWED_SECTIONS = new Set(['overview', 'photos', 'trips', 'family', 'chats', 'receipts']);
const ALLOWED_LAYER_TYPES = new Set(['photo', 'text']);

function invalid(message) {
  // Controllers pass this status through the shared Express error path as a client error.
  const error = new Error(message);
  error.status = 400;
  return error;
}

function requiredString(value, label, maxLength = 512) {
  // Normalize IDs/keys once and keep field-specific labels in any validation message.
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${label} is required`);
  const result = value.trim();
  if (result.length > maxLength) throw invalid(`${label} is too long`);
  return result;
}

function finiteNumber(value, label) {
  // Reject numeric strings, NaN, and Infinity before geometry reaches storage or PDF math.
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(`${label} must be a finite number`);
  return value;
}

function validateCrop(crop, label) {
  if (crop == null) return crop;
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) throw invalid(`${label} must be an object`);
  // Crop values are ratios, not page pixels, so they must stay inside the source image.
  const normalized = { ...crop };
  for (const key of ['x', 'y', 'width', 'height']) {
    const value = finiteNumber(crop[key], `${label}.${key}`);
    if (value < 0 || value > 1) throw invalid(`${label}.${key} must be between 0 and 1`);
    normalized[key] = value;
  }
  if (normalized.width <= 0 || normalized.height <= 0) throw invalid(`${label} dimensions must be positive`);
  if (normalized.x + normalized.width > 1 || normalized.y + normalized.height > 1) {
    throw invalid(`${label} must remain within the source image`);
  }
  return normalized;
}

function validateLayer(layer, pageIndex, layerIndex) {
  // 1. Validate identity/type and fixed-page geometry.
  // 2. Copy optional render fields only after their own checks.
  // 3. Require a photo reference or bound text size depending on layer type.
  const label = `pages[${pageIndex}].layers[${layerIndex}]`;
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) throw invalid(`${label} must be an object`);

  const id = requiredString(layer.id, `${label}.id`);
  const type = requiredString(layer.type, `${label}.type`, 32);
  if (!ALLOWED_LAYER_TYPES.has(type)) throw invalid(`${label}.type is unsupported`);

  const x = finiteNumber(layer.x, `${label}.x`);
  // Canvas/App save total photo height, including the caption band, in this geometry.
  const y = finiteNumber(layer.y, `${label}.y`);
  const width = finiteNumber(layer.width, `${label}.width`);
  const height = finiteNumber(layer.height, `${label}.height`);
  if (x < 0 || y < 0 || width <= 0 || height <= 0) throw invalid(`${label} has invalid geometry`);
  if (x + width > PAGE_WIDTH || y + height > PAGE_HEIGHT) throw invalid(`${label} is outside the page boundaries`);

  // Preserve fields used by newer editor versions while replacing trusted core fields
  // with their validated values. This lets the layout format evolve without weakening
  // the geometry and ownership checks below.
  const normalized = { ...layer, id, type, x, y, width, height };
  if (layer.rotation != null) normalized.rotation = finiteNumber(layer.rotation, `${label}.rotation`);
  if (layer.zIndex != null) normalized.zIndex = finiteNumber(layer.zIndex, `${label}.zIndex`);
  if (layer.crop != null) normalized.crop = validateCrop(layer.crop, `${label}.crop`);

  if (type === 'photo') {
    // Ownership is checked later, but shape validation requires at least one resolvable identity.
    const photoId = layer.photoId == null ? null : requiredString(layer.photoId, `${label}.photoId`);
    const storageKey = layer.storageKey == null ? null : requiredString(layer.storageKey, `${label}.storageKey`, 2048);
    if (!photoId && !storageKey) throw invalid(`${label} must reference an owned photo`);
    normalized.photoId = photoId;
    normalized.storageKey = storageKey;
  } else if (typeof layer.text === 'string' && layer.text.length > 10000) {
    throw invalid(`${label}.text is too long`);
  }

  return normalized;
}

function validateAndNormalizeLayout(layout) {
  // This is the first boundary called by binderController.applyBinderLayout for untrusted JSON.
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw invalid('Invalid layout data');
  if (!Array.isArray(layout.pages)) throw invalid('Layout pages must be an array');
  if (layout.pages.length > MAX_PAGES) throw invalid(`Layout exceeds the ${MAX_PAGES}-page safety limit`);

  // IDs are later used for updates and ordering, so duplicates would make an otherwise
  // valid-looking payload ambiguous.
  const pageIds = new Set();
  const layerIds = new Set();
  let totalLayers = 0;

  const pages = layout.pages.map((page, pageIndex) => {
    // Persist array position as pageIndex while retaining the stable page ID used for reorder.
    const label = `pages[${pageIndex}]`;
    if (!page || typeof page !== 'object' || Array.isArray(page)) throw invalid(`${label} must be an object`);
    const pageId = requiredString(page.pageId || page.id || page.page_id, `${label}.pageId`);
    if (pageIds.has(pageId)) throw invalid(`Duplicate page ID: ${pageId}`);
    pageIds.add(pageId);

    if (!Array.isArray(page.layers)) throw invalid(`${label}.layers must be an array`);
    if (page.layers.length > MAX_LAYERS_PER_PAGE) {
      throw invalid(`${label} exceeds the ${MAX_LAYERS_PER_PAGE}-layer safety limit`);
    }
    totalLayers += page.layers.length;
    // The total guard protects a payload made of many individually valid-sized pages.
    if (totalLayers > MAX_TOTAL_LAYERS) throw invalid(`Layout exceeds the ${MAX_TOTAL_LAYERS}-layer safety limit`);

    const sectionKey = page.sectionKey == null || page.sectionKey === '' ? null : requiredString(page.sectionKey, `${label}.sectionKey`, 32);
    if (sectionKey && !ALLOWED_SECTIONS.has(sectionKey)) throw invalid(`${label}.sectionKey is unsupported`);

    const layers = page.layers.map((layer, layerIndex) => {
      // Layer IDs are global within the layout because App.updateLayer searches by stable ID.
      const normalized = validateLayer(layer, pageIndex, layerIndex);
      if (layerIds.has(normalized.id)) throw invalid(`Duplicate layer ID: ${normalized.id}`);
      layerIds.add(normalized.id);
      return normalized;
    });

    return { ...page, id: pageId, pageId, pageIndex, layers, sectionKey };
  });

  return { ...layout, pages };
}

function assertOwnedPhotoReferences(layout, ownedPhotoRows) {
  // Accept either identifier for compatibility with older saved layouts, but resolve
  // both through rows already scoped to this user and binder by the controller.
  const byId = new Map();
  const byKey = new Map();
  for (const row of ownedPhotoRows || []) {
    // binderController has already scoped these rows to the authenticated user and binder.
    if (row?.id) byId.set(String(row.id), row);
    if (row?.storage_key) byKey.set(String(row.storage_key), row);
  }

  for (const page of layout.pages) {
    for (const layer of page.layers) {
      // Text layers have no storage ownership relationship to verify here.
      if (layer.type !== 'photo') continue;
      const idRow = layer.photoId ? byId.get(String(layer.photoId)) : null;
      const keyRow = layer.storageKey ? byKey.get(String(layer.storageKey)) : null;
      if (!idRow && !keyRow) throw invalid(`Photo layer ${layer.id} does not belong to this binder`);
      if (idRow && keyRow && String(idRow.id) !== String(keyRow.id)) {
        throw invalid(`Photo layer ${layer.id} contains mismatched photo references`);
      }
      // Canonicalize both fields so subsequent saves no longer depend on which legacy
      // reference happened to be present in the incoming layout.
      const row = idRow || keyRow;
      layer.photoId = String(row.id);
      layer.storageKey = String(row.storage_key);
    }
  }
  return layout;
}

module.exports = {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MAX_PAGES,
  MAX_LAYERS_PER_PAGE,
  MAX_TOTAL_LAYERS,
  validateAndNormalizeLayout,
  assertOwnedPhotoReferences
};
