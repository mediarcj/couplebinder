// File: binder-editor/src/utils/imageFitMath.js
// Description: Shared math for image fit calculations (contain and cover)
// Purpose: Ensure canvas and PDF use identical placement logic
// Notes: Used for rendering parity verification and future crop implementation

/**
 * WHAT:
 * Compute image placement for "contain" behavior (entire image visible, may have empty bands).
 *
 * WHY:
 * Provides reference implementation for contain behavior.
 * Ensures canvas and PDF can use the same math if needed.
 *
 * HOW:
 * Scale = min(scaleByWidth, scaleByHeight) to fit entire image
 * Offsets center the scaled image within the frame
 *
 * @param {number} naturalWidth - Natural image width in pixels
 * @param {number} naturalHeight - Natural image height in pixels
 * @param {number} frameWidth - Frame width in pixels
 * @param {number} frameHeight - Frame height in pixels
 * @returns {Object} { scale, offsetX, offsetY, method: 'contain' }
 */
export function computeContainFit(naturalWidth, naturalHeight, frameWidth, frameHeight) {
  if (!naturalWidth || !naturalHeight || !frameWidth || !frameHeight) {
    return { scale: 1, offsetX: 0, offsetY: 0, method: 'contain' };
  }

  const scaleByWidth = frameWidth / naturalWidth;
  const scaleByHeight = frameHeight / naturalHeight;
  const scale = Math.min(scaleByWidth, scaleByHeight);

  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;

  const offsetX = (frameWidth - scaledWidth) / 2;
  const offsetY = (frameHeight - scaledHeight) / 2;

  return { scale, offsetX, offsetY, method: 'contain' };
}

/**
 * WHAT:
 * Compute image placement for "cover" behavior (image fills frame, may be cropped).
 *
 * WHY:
 * Provides reference implementation for cover behavior.
 * Ensures canvas and PDF use identical placement logic.
 *
 * HOW:
 * Scale = max(scaleByWidth, scaleByHeight) to fill frame
 * Offsets center the scaled image (edges may be clipped)
 *
 * @param {number} naturalWidth - Natural image width in pixels
 * @param {number} naturalHeight - Natural image height in pixels
 * @param {number} frameWidth - Frame width in pixels
 * @param {number} frameHeight - Frame height in pixels
 * @returns {Object} { scale, offsetX, offsetY, method: 'cover' }
 */
export function computeCoverFit(naturalWidth, naturalHeight, frameWidth, frameHeight) {
  if (!naturalWidth || !naturalHeight || !frameWidth || !frameHeight) {
    return { scale: 1, offsetX: 0, offsetY: 0, method: 'cover' };
  }

  const scaleByWidth = frameWidth / naturalWidth;
  const scaleByHeight = frameHeight / naturalHeight;
  const scale = Math.max(scaleByWidth, scaleByHeight);

  const scaledWidth = naturalWidth * scale;
  const scaledHeight = naturalHeight * scale;

  const offsetX = (frameWidth - scaledWidth) / 2;
  const offsetY = (frameHeight - scaledHeight) / 2;

  return { scale, offsetX, offsetY, method: 'cover' };
}

