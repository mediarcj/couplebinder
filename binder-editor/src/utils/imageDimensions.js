// File: binder-editor/src/utils/imageDimensions.js
// Description: Utility to capture natural image dimensions
// Purpose: Prep work for crop implementation (crop math needs natural dimensions)
// Notes: No UI changes, only data capture

/**
 * WHAT:
 * Load an image and capture its natural dimensions.
 *
 * WHY:
 * Crop math needs natural image dimensions to denormalize crop rects.
 * This utility provides a clean way to capture dimensions without UI changes.
 *
 * HOW:
 * Creates an Image object, loads the URL, and resolves with dimensions.
 * Returns aspect ratio for backward compatibility.
 *
 * @param {string} url - Image URL to load
 * @returns {Promise<Object>} { naturalWidth, naturalHeight, aspectRatio }
 */
export function captureImageDimensions(url) {
  // This return sends the completed value or response back to the code that called this function.
  return new Promise((resolve) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!url || typeof url !== 'string') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      resolve({ naturalWidth: 0, naturalHeight: 0, aspectRatio: 1 });
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `img` here so the nearby steps can reuse the same value without rebuilding it each time.
    const img = new Image();

    // I am saving `cleanup` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cleanup = () => {
      // I am keeping this line here because the surrounding imageDimensions.js workflow expects this value or operation before it continues.
      img.onload = null;
      // I am keeping this line here because the surrounding imageDimensions.js workflow expects this value or operation before it continues.
      img.onerror = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    img.onload = () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      cleanup();
      // I am saving `naturalWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
      const naturalWidth = img.naturalWidth || 0;
      // I am saving `naturalHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
      const naturalHeight = img.naturalHeight || 0;
      // I am saving `aspectRatio` here so the nearby steps can reuse the same value without rebuilding it each time.
      const aspectRatio =
        // I am keeping this line here because the surrounding imageDimensions.js workflow expects this value or operation before it continues.
        naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;

      // I am calling this helper here so the current workflow performs this step before it moves on.
      resolve({ naturalWidth, naturalHeight, aspectRatio });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    img.onerror = () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      cleanup();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      resolve({ naturalWidth: 0, naturalHeight: 0, aspectRatio: 1 });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am keeping this line here because the surrounding imageDimensions.js workflow expects this value or operation before it continues.
    img.src = url;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Create an updated layer object with natural dimensions.
 *
 * WHY:
 * Prepares layer for future crop implementation.
 * Stores natural dimensions alongside existing photoAspectRatio.
 *
 * HOW:
 * Returns a new layer object with photoNaturalWidth and photoNaturalHeight added.
 * Does not mutate the original layer.
 *
 * @param {Object} layer - Original layer object
 * @param {number} naturalWidth - Natural image width in pixels
 * @param {number} naturalHeight - Natural image height in pixels
 * @returns {Object} Updated layer object with natural dimensions
 */
export function updateLayerWithNaturalDimensions(layer, naturalWidth, naturalHeight) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!layer || typeof layer !== 'object') {
    // This return sends the completed value or response back to the code that called this function.
    return layer;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (layer.type !== 'photo') {
    // This return sends the completed value or response back to the code that called this function.
    return layer;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `aspectRatio` here so the nearby steps can reuse the same value without rebuilding it each time.
  const aspectRatio =
    // I am keeping this line here because the surrounding imageDimensions.js workflow expects this value or operation before it continues.
    naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping this line here because the surrounding imageDimensions.js workflow expects this value or operation before it continues.
    ...layer,
    // I am keeping the `photoNaturalWidth` field in this object so the receiving code can read that value by its expected name.
    photoNaturalWidth: naturalWidth,
    // I am keeping the `photoNaturalHeight` field in this object so the receiving code can read that value by its expected name.
    photoNaturalHeight: naturalHeight,
    // I am keeping the `photoAspectRatio` field in this object so the receiving code can read that value by its expected name.
    photoAspectRatio: aspectRatio
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

