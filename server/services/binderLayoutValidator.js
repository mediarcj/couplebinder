'use strict';

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1122;
const MAX_PAGES = 200;
const MAX_LAYERS_PER_PAGE = 500;
const MAX_TOTAL_LAYERS = 5000;
const ALLOWED_SECTIONS = new Set(['overview', 'photos', 'trips', 'family', 'chats', 'receipts']);
const ALLOWED_LAYER_TYPES = new Set(['photo', 'text']);

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function requiredString(value, label, maxLength = 512) {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${label} is required`);
  const result = value.trim();
  if (result.length > maxLength) throw invalid(`${label} is too long`);
  return result;
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(`${label} must be a finite number`);
  return value;
}

function validateCrop(crop, label) {
  if (crop == null) return crop;
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) throw invalid(`${label} must be an object`);
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
  const label = `pages[${pageIndex}].layers[${layerIndex}]`;
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) throw invalid(`${label} must be an object`);

  const id = requiredString(layer.id, `${label}.id`);
  const type = requiredString(layer.type, `${label}.type`, 32);
  if (!ALLOWED_LAYER_TYPES.has(type)) throw invalid(`${label}.type is unsupported`);

  const x = finiteNumber(layer.x, `${label}.x`);
  const y = finiteNumber(layer.y, `${label}.y`);
  const width = finiteNumber(layer.width, `${label}.width`);
  const height = finiteNumber(layer.height, `${label}.height`);
  if (x < 0 || y < 0 || width <= 0 || height <= 0) throw invalid(`${label} has invalid geometry`);
  if (x + width > PAGE_WIDTH || y + height > PAGE_HEIGHT) throw invalid(`${label} is outside the page boundaries`);

  const normalized = { ...layer, id, type, x, y, width, height };
  if (layer.rotation != null) normalized.rotation = finiteNumber(layer.rotation, `${label}.rotation`);
  if (layer.zIndex != null) normalized.zIndex = finiteNumber(layer.zIndex, `${label}.zIndex`);
  if (layer.crop != null) normalized.crop = validateCrop(layer.crop, `${label}.crop`);

  if (type === 'photo') {
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
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw invalid('Invalid layout data');
  if (!Array.isArray(layout.pages)) throw invalid('Layout pages must be an array');
  if (layout.pages.length > MAX_PAGES) throw invalid(`Layout exceeds the ${MAX_PAGES}-page safety limit`);

  const pageIds = new Set();
  const layerIds = new Set();
  let totalLayers = 0;

  const pages = layout.pages.map((page, pageIndex) => {
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
    if (totalLayers > MAX_TOTAL_LAYERS) throw invalid(`Layout exceeds the ${MAX_TOTAL_LAYERS}-layer safety limit`);

    const sectionKey = page.sectionKey == null || page.sectionKey === '' ? null : requiredString(page.sectionKey, `${label}.sectionKey`, 32);
    if (sectionKey && !ALLOWED_SECTIONS.has(sectionKey)) throw invalid(`${label}.sectionKey is unsupported`);

    const layers = page.layers.map((layer, layerIndex) => {
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
  const byId = new Map();
  const byKey = new Map();
  for (const row of ownedPhotoRows || []) {
    if (row?.id) byId.set(String(row.id), row);
    if (row?.storage_key) byKey.set(String(row.storage_key), row);
  }

  for (const page of layout.pages) {
    for (const layer of page.layers) {
      if (layer.type !== 'photo') continue;
      const idRow = layer.photoId ? byId.get(String(layer.photoId)) : null;
      const keyRow = layer.storageKey ? byKey.get(String(layer.storageKey)) : null;
      if (!idRow && !keyRow) throw invalid(`Photo layer ${layer.id} does not belong to this binder`);
      if (idRow && keyRow && String(idRow.id) !== String(keyRow.id)) {
        throw invalid(`Photo layer ${layer.id} contains mismatched photo references`);
      }
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
