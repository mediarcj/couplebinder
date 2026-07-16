// Description: Utility to capture natural image dimensions
// Purpose: Prep work for crop implementation (crop math needs natural dimensions)
// Notes: No UI changes, only data capture

/**
 * Load an image and capture its natural dimensions.
 *
 * Crop math needs natural image dimensions to denormalize crop rects.
 * This utility provides a clean way to capture dimensions without UI changes.
 *
 * Creates an Image object, loads the URL, and resolves with dimensions.
 * Returns aspect ratio for backward compatibility.
 *
 * @param {string} url - Image URL to load
 * @returns {Promise<Object>} { naturalWidth, naturalHeight, aspectRatio }
 */
export function captureImageDimensions(url) {
  return new Promise((resolve) => {
    if (!url || typeof url !== 'string') {
      resolve({ naturalWidth: 0, naturalHeight: 0, aspectRatio: 1 });
      return;
    }

    const img = new Image();

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      const naturalWidth = img.naturalWidth || 0;
      const naturalHeight = img.naturalHeight || 0;
      const aspectRatio =
        naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;

      resolve({ naturalWidth, naturalHeight, aspectRatio });
    };

    img.onerror = () => {
      cleanup();
      resolve({ naturalWidth: 0, naturalHeight: 0, aspectRatio: 1 });
    };

    img.src = url;
  });
}

/**
 * Create an updated layer object with natural dimensions.
 *
 * Prepares layer for future crop implementation.
 * Stores natural dimensions alongside existing photoAspectRatio.
 *
 * Returns a new layer object with photoNaturalWidth and photoNaturalHeight added.
 * Does not mutate the original layer.
 *
 * @param {Object} layer - Original layer object
 * @param {number} naturalWidth - Natural image width in pixels
 * @param {number} naturalHeight - Natural image height in pixels
 * @returns {Object} Updated layer object with natural dimensions
 */
export function updateLayerWithNaturalDimensions(layer, naturalWidth, naturalHeight) {
  if (!layer || typeof layer !== 'object') {
    return layer;
  }

  if (layer.type !== 'photo') {
    return layer;
  }

  const aspectRatio =
    naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1;

  return {
    ...layer,
    photoNaturalWidth: naturalWidth,
    photoNaturalHeight: naturalHeight,
    photoAspectRatio: aspectRatio
  };
}

