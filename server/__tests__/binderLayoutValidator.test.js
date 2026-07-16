// I am importing `describe` from `vitest` here because binderLayoutValidator.test.js uses it in the steps below.
import { describe, expect, it } from 'vitest';

// I am saving this value here so the nearby steps can reuse the same value without rebuilding it each time.
const {
  // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
  PAGE_WIDTH,
  // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
  PAGE_HEIGHT,
  // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
  MAX_PAGES,
  // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
  validateAndNormalizeLayout,
  // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
  assertOwnedPhotoReferences
// I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
} = require('../services/binderLayoutValidator');

// I am keeping `validLayout` as a named helper so the surrounding workflow can call this step when it needs it.
function validLayout(overrides = {}) {
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `binderId` field in this object so the receiving code can read that value by its expected name.
    binderId: 'binder-1',
    // I am keeping the `pages` field in this object so the receiving code can read that value by its expected name.
    pages: [
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: 'page-1',
        // I am keeping the `sectionKey` field in this object so the receiving code can read that value by its expected name.
        sectionKey: 'photos',
        // I am keeping the `layers` field in this object so the receiving code can read that value by its expected name.
        layers: [
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          {
            // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
            id: 'layer-1',
            // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
            type: 'photo',
            // I am keeping the `x` field in this object so the receiving code can read that value by its expected name.
            x: 10,
            // I am keeping the `y` field in this object so the receiving code can read that value by its expected name.
            y: 20,
            // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
            width: 300,
            // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
            height: 400,
            // I am keeping the `rotation` field in this object so the receiving code can read that value by its expected name.
            rotation: 0,
            // I am keeping the `zIndex` field in this object so the receiving code can read that value by its expected name.
            zIndex: 0,
            // I am keeping the `photoId` field in this object so the receiving code can read that value by its expected name.
            photoId: 'photo-1',
            // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
            storageKey: 'users/u/binders/b/photo-1.jpg'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ]
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    ],
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    ...overrides
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('binderLayoutValidator', () => {
  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('normalizes a valid browser layout while preserving responsive client fields', () => {
    // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
    const result = validateAndNormalizeLayout(validLayout());
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(result.pages[0].pageId).toBe('page-1');
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(result.pages[0].pageIndex).toBe(0);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(result.pages[0].layers[0].storageKey).toContain('photo-1.jpg');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am calling this helper here so the current workflow performs this step before it moves on.
  it.each([
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    ['negative coordinates', { x: -1 }],
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    ['excessive x coordinate', { x: PAGE_WIDTH }],
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    ['invalid width', { width: 0 }],
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    ['excessive height', { y: 1, height: PAGE_HEIGHT }],
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    ['non-finite geometry', { width: Number.POSITIVE_INFINITY }]
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  ])('rejects %s', (_name, layerPatch) => {
    // I am saving `layout` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layout = validLayout();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    Object.assign(layout.pages[0].layers[0], layerPatch);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => validateAndNormalizeLayout(layout)).toThrow();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('rejects malformed pages, duplicate IDs, unsupported sections, and unsupported layers', () => {
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => validateAndNormalizeLayout({ pages: {} })).toThrow(/pages must be an array/i);

    // I am saving `duplicatePage` here so the nearby steps can reuse the same value without rebuilding it each time.
    const duplicatePage = validLayout();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    duplicatePage.pages.push({ ...duplicatePage.pages[0], layers: [] });
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => validateAndNormalizeLayout(duplicatePage)).toThrow(/duplicate page/i);

    // I am saving `badSection` here so the nearby steps can reuse the same value without rebuilding it each time.
    const badSection = validLayout();
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    badSection.pages[0].sectionKey = 'premium-secret-template';
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => validateAndNormalizeLayout(badSection)).toThrow(/sectionKey is unsupported/i);

    // I am saving `badLayer` here so the nearby steps can reuse the same value without rebuilding it each time.
    const badLayer = validLayout();
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    badLayer.pages[0].layers[0].type = 'script';
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => validateAndNormalizeLayout(badLayer)).toThrow(/type is unsupported/i);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('rejects invalid normalized crop values if a future client supplies them', () => {
    // I am saving `layout` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layout = validLayout();
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    layout.pages[0].layers[0].crop = { x: 0.8, y: 0, width: 0.4, height: 1 };
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => validateAndNormalizeLayout(layout)).toThrow(/within the source image/i);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('rejects excessive page counts without inventing a subscription tier', () => {
    // I am saving `layout` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layout = validLayout({ pages: [] });
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    layout.pages = Array.from({ length: MAX_PAGES + 1 }, (_, index) => ({
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: `page-${index}`,
      // I am keeping the `sectionKey` field in this object so the receiving code can read that value by its expected name.
      sectionKey: 'photos',
      // I am keeping the `layers` field in this object so the receiving code can read that value by its expected name.
      layers: []
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    }));
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => validateAndNormalizeLayout(layout)).toThrow(/safety limit/i);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('rejects foreign and mismatched photo references from direct API payloads', () => {
    // I am saving `normalized` here so the nearby steps can reuse the same value without rebuilding it each time.
    const normalized = validateAndNormalizeLayout(validLayout());
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() => assertOwnedPhotoReferences(normalized, [])).toThrow(/does not belong/i);

    // I am saving `mismatched` here so the nearby steps can reuse the same value without rebuilding it each time.
    const mismatched = validateAndNormalizeLayout(validLayout());
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(() =>
      // I am calling this helper here so the current workflow performs this step before it moves on.
      assertOwnedPhotoReferences(mismatched, [
        // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
        { id: 'photo-1', storage_key: 'owned-one.jpg' },
        // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
        { id: 'photo-2', storage_key: 'users/u/binders/b/photo-1.jpg' }
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      ])
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    ).toThrow(/mismatched/i);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('canonicalizes an owned photo ID and storage key', () => {
    // I am saving `layout` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layout = validLayout();
    // I am keeping this line here because the surrounding binderLayoutValidator.test.js workflow expects this value or operation before it continues.
    layout.pages[0].layers[0].storageKey = null;
    // I am saving `normalized` here so the nearby steps can reuse the same value without rebuilding it each time.
    const normalized = validateAndNormalizeLayout(layout);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    assertOwnedPhotoReferences(normalized, [{ id: 'photo-1', storage_key: 'canonical/photo.jpg' }]);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(normalized.pages[0].layers[0]).toMatchObject({
      // I am keeping the `photoId` field in this object so the receiving code can read that value by its expected name.
      photoId: 'photo-1',
      // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
      storageKey: 'canonical/photo.jpg'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
