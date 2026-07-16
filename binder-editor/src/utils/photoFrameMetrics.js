// Description: Centralized helper for photo frame dimension calculations
// Purpose: Single source of truth for caption height and frame metrics
// Notes: Used by Layer.jsx, Canvas.jsx, and future crop implementation

/**
 * Caption height constant (matches CSS .layer-caption-shell height).
 *
 * Caption height is used in multiple places (Layer.jsx, Canvas.jsx, App.jsx).
 * Centralizing it prevents drift and ensures consistency.
 *
 * This constant must match the CSS value in App.css (.layer-caption-shell).
 * If CSS changes, update this constant.
 */
export const CAPTION_HEIGHT = 88;

/**
 * Compute photo frame dimensions from a layer object.
 *
 * Photo layers have total height = image height + caption height.
 * Crop math and other calculations need only the image frame dimensions.
 *
 * For photo layers: frameHeight = layer.height - CAPTION_HEIGHT
 * For non-photo layers: frameHeight = layer.height (no caption)
 * Frame width is always layer.width (caption doesn't affect width).
 *
 * @param {Object} layer - Layer object with type, width, height
 * @returns {Object} Frame metrics { frameWidth, frameHeight, captionHeight }
 */
export function getPhotoFrameRectFromLayer(layer) {
  if (!layer || typeof layer !== 'object') {
    return { frameWidth: 0, frameHeight: 0, captionHeight: 0 };
  }

  const width = typeof layer.width === 'number' && layer.width > 0 ? layer.width : 0;
  const totalHeight = typeof layer.height === 'number' && layer.height > 0 ? layer.height : 0;

  if (layer.type === 'photo') {
    const captionHeight = CAPTION_HEIGHT;
    const frameHeight = Math.max(0, totalHeight - captionHeight);
    return { frameWidth: width, frameHeight, captionHeight };
  }

  // Non-photo layers have no caption
  return { frameWidth: width, frameHeight: totalHeight, captionHeight: 0 };
}

