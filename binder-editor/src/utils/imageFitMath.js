// File: binder-editor/src/utils/imageFitMath.js
// Description: Shared math for image fit calculations (contain and cover)
// Purpose: Ensure canvas and PDF use identical placement logic
// Notes: Used by PDF parity verification and will be reused by crop math; do not delete as unused.

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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!naturalWidth || !naturalHeight || !frameWidth || !frameHeight) {
    // This return sends the completed value or response back to the code that called this function.
    return { scale: 1, offsetX: 0, offsetY: 0, method: 'contain' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `scaleByWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaleByWidth = frameWidth / naturalWidth;
  // I am saving `scaleByHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaleByHeight = frameHeight / naturalHeight;
  // I am saving `scale` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scale = Math.min(scaleByWidth, scaleByHeight);

  // I am saving `scaledWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaledWidth = naturalWidth * scale;
  // I am saving `scaledHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaledHeight = naturalHeight * scale;

  // I am saving `offsetX` here so the nearby steps can reuse the same value without rebuilding it each time.
  const offsetX = (frameWidth - scaledWidth) / 2;
  // I am saving `offsetY` here so the nearby steps can reuse the same value without rebuilding it each time.
  const offsetY = (frameHeight - scaledHeight) / 2;

  // This return sends the completed value or response back to the code that called this function.
  return { scale, offsetX, offsetY, method: 'contain' };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!naturalWidth || !naturalHeight || !frameWidth || !frameHeight) {
    // This return sends the completed value or response back to the code that called this function.
    return { scale: 1, offsetX: 0, offsetY: 0, method: 'cover' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `scaleByWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaleByWidth = frameWidth / naturalWidth;
  // I am saving `scaleByHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaleByHeight = frameHeight / naturalHeight;
  // I am saving `scale` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scale = Math.max(scaleByWidth, scaleByHeight);

  // I am saving `scaledWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaledWidth = naturalWidth * scale;
  // I am saving `scaledHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scaledHeight = naturalHeight * scale;

  // I am saving `offsetX` here so the nearby steps can reuse the same value without rebuilding it each time.
  const offsetX = (frameWidth - scaledWidth) / 2;
  // I am saving `offsetY` here so the nearby steps can reuse the same value without rebuilding it each time.
  const offsetY = (frameHeight - scaledHeight) / 2;

  // This return sends the completed value or response back to the code that called this function.
  return { scale, offsetX, offsetY, method: 'cover' };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

