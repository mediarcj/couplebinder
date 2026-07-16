// File: binder-editor/src/utils/photoFrameMetrics.js
// Description: Centralized helper for photo frame dimension calculations
// Purpose: Single source of truth for caption height and frame metrics
// Notes: Used by Layer.jsx, Canvas.jsx, and future crop implementation

/**
 * WHAT:
 * Caption height constant (matches CSS .layer-caption-shell height).
 *
 * WHY:
 * Caption height is used in multiple places (Layer.jsx, Canvas.jsx, App.jsx).
 * Centralizing it prevents drift and ensures consistency.
 *
 * HOW:
 * This constant must match the CSS value in App.css (.layer-caption-shell).
 * If CSS changes, update this constant.
 */
export const CAPTION_HEIGHT = 88;

/**
 * WHAT:
 * Compute photo frame dimensions from a layer object.
 *
 * WHY:
 * Photo layers have total height = image height + caption height.
 * Crop math and other calculations need only the image frame dimensions.
 *
 * HOW:
 * For photo layers: frameHeight = layer.height - CAPTION_HEIGHT
 * For non-photo layers: frameHeight = layer.height (no caption)
 * Frame width is always layer.width (caption doesn't affect width).
 *
 * @param {Object} layer - Layer object with type, width, height
 * @returns {Object} Frame metrics { frameWidth, frameHeight, captionHeight }
 */
export function getPhotoFrameRectFromLayer(layer) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!layer || typeof layer !== 'object') {
    // This return sends the completed value or response back to the code that called this function.
    return { frameWidth: 0, frameHeight: 0, captionHeight: 0 };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `width` here so the nearby steps can reuse the same value without rebuilding it each time.
  const width = typeof layer.width === 'number' && layer.width > 0 ? layer.width : 0;
  // I am saving `totalHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const totalHeight = typeof layer.height === 'number' && layer.height > 0 ? layer.height : 0;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (layer.type === 'photo') {
    // I am saving `captionHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
    const captionHeight = CAPTION_HEIGHT;
    // I am saving `frameHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
    const frameHeight = Math.max(0, totalHeight - captionHeight);
    // This return sends the completed value or response back to the code that called this function.
    return { frameWidth: width, frameHeight, captionHeight };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Non-photo layers have no caption
  return { frameWidth: width, frameHeight: totalHeight, captionHeight: 0 };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

