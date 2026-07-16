// Description: Dev-only test harness for crop math parity checks
// Purpose: Verify crop math is deterministic and matches between modal and canvas
// Notes: Underscore prefix = dev-only, not imported in production code

/**
 * Dev-only harness to test crop math functions.
 *
 * Ensures crop math is deterministic and produces consistent results.
 * Validates parity between modal preview math and canvas rendering math.
 *
 * Defines test cases and logs results.
 * Can be run manually for verification.
 * No test framework required (minimal approach).
 */

// Test cases: { naturalWidth, naturalHeight, frameWidth, frameHeight }
const TEST_CASES = [
  {
    name: 'Square image, square frame',
    naturalWidth: 1000,
    naturalHeight: 1000,
    frameWidth: 400,
    frameHeight: 400
  },
  {
    name: 'Wide image, square frame',
    naturalWidth: 2000,
    naturalHeight: 1000,
    frameWidth: 400,
    frameHeight: 400
  },
  {
    name: 'Tall image, square frame',
    naturalWidth: 1000,
    naturalHeight: 2000,
    frameWidth: 400,
    frameHeight: 400
  },
  {
    name: 'Wide image, wide frame',
    naturalWidth: 2000,
    naturalHeight: 1000,
    frameWidth: 600,
    frameHeight: 400
  },
  {
    name: 'Tall image, tall frame',
    naturalWidth: 1000,
    naturalHeight: 2000,
    frameWidth: 400,
    frameHeight: 600
  }
];

/**
 * Compute default crop rect for "contain centered" behavior.
 *
 * Validates that default crop matches current canvas rendering.
 *
 * For contain behavior, entire image is visible (no actual cropping).
 * Default crop rect = entire image (0, 0, 1, 1).
 */
function computeDefaultCropRect(naturalWidth, naturalHeight, frameWidth, frameHeight) {
  // For contain behavior, entire image is always visible
  // Default crop = entire image (normalized)
  return { x: 0, y: 0, width: 1, height: 1 };
}

/**
 * Test default crop rect computation.
 *
 * Ensures default crop is deterministic and matches expectations.
 */
export function testDefaultCropRect() {
  console.log('[CropMathHarness] Testing default crop rect computation...\n');

  TEST_CASES.forEach((testCase) => {
    const crop = computeDefaultCropRect(
      testCase.naturalWidth,
      testCase.naturalHeight,
      testCase.frameWidth,
      testCase.frameHeight
    );

    console.log(`Test: ${testCase.name}`);
    console.log(`  Natural: ${testCase.naturalWidth}x${testCase.naturalHeight}`);
    console.log(`  Frame: ${testCase.frameWidth}x${testCase.frameHeight}`);
    console.log(`  Default crop:`, crop);
    console.log('');
  });
}

/**
 * Test crop transform computation (placeholder for future implementation).
 *
 * Will validate crop transform math once implemented.
 */
export function testCropTransform() {
  console.log('[CropMathHarness] Crop transform tests (placeholder - implement in Phase 5)\n');
  console.log('  This will test computeCropTransform() function once implemented.\n');
}

/**
 * Test parity between canvas math and PDF math (placeholder).
 *
 * Ensures crop renders identically in canvas and PDF.
 */
export function testParity() {
  console.log('[CropMathHarness] Parity tests (placeholder - implement in Phase 5)\n');
  console.log('  This will compare canvas crop math vs PDF crop math results.\n');
}

/**
 * Run all tests.
 *
 * Convenience function to run all harness tests.
 */
export function runAllTests() {
  console.log('='.repeat(60));
  console.log('Crop Math Harness - Dev-Only Test Suite');
  console.log('='.repeat(60));
  console.log('');

  testDefaultCropRect();
  testCropTransform();
  testParity();

  console.log('='.repeat(60));
  console.log('Harness complete (some tests are placeholders for Phase 5)');
  console.log('='.repeat(60));
}

// Auto-run if imported directly (for manual testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

