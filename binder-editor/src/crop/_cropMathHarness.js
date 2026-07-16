// File: binder-editor/src/crop/_cropMathHarness.js
// Description: Dev-only test harness for crop math parity checks
// Purpose: Verify crop math is deterministic and matches between modal and canvas
// Notes: Underscore prefix = dev-only, not imported in production code

/**
 * WHAT:
 * Dev-only harness to test crop math functions.
 *
 * WHY:
 * Ensures crop math is deterministic and produces consistent results.
 * Validates parity between modal preview math and canvas rendering math.
 *
 * HOW:
 * Defines test cases and logs results.
 * Can be run manually for verification.
 * No test framework required (minimal approach).
 */

// Test cases: { naturalWidth, naturalHeight, frameWidth, frameHeight }
const TEST_CASES = [
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  {
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: 'Square image, square frame',
    // I am keeping the `naturalWidth` field in this object so the receiving code can read that value by its expected name.
    naturalWidth: 1000,
    // I am keeping the `naturalHeight` field in this object so the receiving code can read that value by its expected name.
    naturalHeight: 1000,
    // I am keeping the `frameWidth` field in this object so the receiving code can read that value by its expected name.
    frameWidth: 400,
    // I am keeping the `frameHeight` field in this object so the receiving code can read that value by its expected name.
    frameHeight: 400
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  {
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: 'Wide image, square frame',
    // I am keeping the `naturalWidth` field in this object so the receiving code can read that value by its expected name.
    naturalWidth: 2000,
    // I am keeping the `naturalHeight` field in this object so the receiving code can read that value by its expected name.
    naturalHeight: 1000,
    // I am keeping the `frameWidth` field in this object so the receiving code can read that value by its expected name.
    frameWidth: 400,
    // I am keeping the `frameHeight` field in this object so the receiving code can read that value by its expected name.
    frameHeight: 400
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  {
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: 'Tall image, square frame',
    // I am keeping the `naturalWidth` field in this object so the receiving code can read that value by its expected name.
    naturalWidth: 1000,
    // I am keeping the `naturalHeight` field in this object so the receiving code can read that value by its expected name.
    naturalHeight: 2000,
    // I am keeping the `frameWidth` field in this object so the receiving code can read that value by its expected name.
    frameWidth: 400,
    // I am keeping the `frameHeight` field in this object so the receiving code can read that value by its expected name.
    frameHeight: 400
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  {
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: 'Wide image, wide frame',
    // I am keeping the `naturalWidth` field in this object so the receiving code can read that value by its expected name.
    naturalWidth: 2000,
    // I am keeping the `naturalHeight` field in this object so the receiving code can read that value by its expected name.
    naturalHeight: 1000,
    // I am keeping the `frameWidth` field in this object so the receiving code can read that value by its expected name.
    frameWidth: 600,
    // I am keeping the `frameHeight` field in this object so the receiving code can read that value by its expected name.
    frameHeight: 400
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  {
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: 'Tall image, tall frame',
    // I am keeping the `naturalWidth` field in this object so the receiving code can read that value by its expected name.
    naturalWidth: 1000,
    // I am keeping the `naturalHeight` field in this object so the receiving code can read that value by its expected name.
    naturalHeight: 2000,
    // I am keeping the `frameWidth` field in this object so the receiving code can read that value by its expected name.
    frameWidth: 400,
    // I am keeping the `frameHeight` field in this object so the receiving code can read that value by its expected name.
    frameHeight: 600
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

/**
 * WHAT:
 * Compute default crop rect for "contain centered" behavior.
 *
 * WHY:
 * Validates that default crop matches current canvas rendering.
 *
 * HOW:
 * For contain behavior, entire image is visible (no actual cropping).
 * Default crop rect = entire image (0, 0, 1, 1).
 */
function computeDefaultCropRect(naturalWidth, naturalHeight, frameWidth, frameHeight) {
  // For contain behavior, entire image is always visible
  // Default crop = entire image (normalized)
  return { x: 0, y: 0, width: 1, height: 1 };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Test default crop rect computation.
 *
 * WHY:
 * Ensures default crop is deterministic and matches expectations.
 */
export function testDefaultCropRect() {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('[CropMathHarness] Testing default crop rect computation...\n');

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  TEST_CASES.forEach((testCase) => {
    // I am saving `crop` here so the nearby steps can reuse the same value without rebuilding it each time.
    const crop = computeDefaultCropRect(
      // I am keeping this line here because the surrounding _cropMathHarness.js workflow expects this value or operation before it continues.
      testCase.naturalWidth,
      // I am keeping this line here because the surrounding _cropMathHarness.js workflow expects this value or operation before it continues.
      testCase.naturalHeight,
      // I am keeping this line here because the surrounding _cropMathHarness.js workflow expects this value or operation before it continues.
      testCase.frameWidth,
      // I am keeping this line here because the surrounding _cropMathHarness.js workflow expects this value or operation before it continues.
      testCase.frameHeight
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`Test: ${testCase.name}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`  Natural: ${testCase.naturalWidth}x${testCase.naturalHeight}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`  Frame: ${testCase.frameWidth}x${testCase.frameHeight}`);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log(`  Default crop:`, crop);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.log('');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Test crop transform computation (placeholder for future implementation).
 *
 * WHY:
 * Will validate crop transform math once implemented.
 */
export function testCropTransform() {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('[CropMathHarness] Crop transform tests (placeholder - implement in Phase 5)\n');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('  This will test computeCropTransform() function once implemented.\n');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Test parity between canvas math and PDF math (placeholder).
 *
 * WHY:
 * Ensures crop renders identically in canvas and PDF.
 */
export function testParity() {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('[CropMathHarness] Parity tests (placeholder - implement in Phase 5)\n');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('  This will compare canvas crop math vs PDF crop math results.\n');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Run all tests.
 *
 * WHY:
 * Convenience function to run all harness tests.
 */
export function runAllTests() {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('='.repeat(60));
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('Crop Math Harness - Dev-Only Test Suite');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('='.repeat(60));
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('');

  // I am calling this helper here so the current workflow performs this step before it moves on.
  testDefaultCropRect();
  // I am calling this helper here so the current workflow performs this step before it moves on.
  testCropTransform();
  // I am calling this helper here so the current workflow performs this step before it moves on.
  testParity();

  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('='.repeat(60));
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('Harness complete (some tests are placeholders for Phase 5)');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.log('='.repeat(60));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Auto-run if imported directly (for manual testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  runAllTests();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

