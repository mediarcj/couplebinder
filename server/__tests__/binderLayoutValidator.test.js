import { describe, expect, it } from 'vitest';

const {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MAX_PAGES,
  validateAndNormalizeLayout,
  assertOwnedPhotoReferences
} = require('../services/binderLayoutValidator');

function validLayout(overrides = {}) {
  return {
    binderId: 'binder-1',
    pages: [
      {
        id: 'page-1',
        sectionKey: 'photos',
        layers: [
          {
            id: 'layer-1',
            type: 'photo',
            x: 10,
            y: 20,
            width: 300,
            height: 400,
            rotation: 0,
            zIndex: 0,
            photoId: 'photo-1',
            storageKey: 'users/u/binders/b/photo-1.jpg'
          }
        ]
      }
    ],
    ...overrides
  };
}

describe('binderLayoutValidator', () => {
  it('normalizes a valid browser layout while preserving responsive client fields', () => {
    const result = validateAndNormalizeLayout(validLayout());
    expect(result.pages[0].pageId).toBe('page-1');
    expect(result.pages[0].pageIndex).toBe(0);
    expect(result.pages[0].layers[0].storageKey).toContain('photo-1.jpg');
  });

  it.each([
    ['negative coordinates', { x: -1 }],
    ['excessive x coordinate', { x: PAGE_WIDTH }],
    ['invalid width', { width: 0 }],
    ['excessive height', { y: 1, height: PAGE_HEIGHT }],
    ['non-finite geometry', { width: Number.POSITIVE_INFINITY }]
  ])('rejects %s', (_name, layerPatch) => {
    const layout = validLayout();
    Object.assign(layout.pages[0].layers[0], layerPatch);
    expect(() => validateAndNormalizeLayout(layout)).toThrow();
  });

  it('rejects malformed pages, duplicate IDs, unsupported sections, and unsupported layers', () => {
    expect(() => validateAndNormalizeLayout({ pages: {} })).toThrow(/pages must be an array/i);

    const duplicatePage = validLayout();
    duplicatePage.pages.push({ ...duplicatePage.pages[0], layers: [] });
    expect(() => validateAndNormalizeLayout(duplicatePage)).toThrow(/duplicate page/i);

    const badSection = validLayout();
    badSection.pages[0].sectionKey = 'premium-secret-template';
    expect(() => validateAndNormalizeLayout(badSection)).toThrow(/sectionKey is unsupported/i);

    const badLayer = validLayout();
    badLayer.pages[0].layers[0].type = 'script';
    expect(() => validateAndNormalizeLayout(badLayer)).toThrow(/type is unsupported/i);
  });

  it('rejects invalid normalized crop values if a future client supplies them', () => {
    const layout = validLayout();
    layout.pages[0].layers[0].crop = { x: 0.8, y: 0, width: 0.4, height: 1 };
    expect(() => validateAndNormalizeLayout(layout)).toThrow(/within the source image/i);
  });

  it('rejects excessive page counts without inventing a subscription tier', () => {
    const layout = validLayout({ pages: [] });
    layout.pages = Array.from({ length: MAX_PAGES + 1 }, (_, index) => ({
      id: `page-${index}`,
      sectionKey: 'photos',
      layers: []
    }));
    expect(() => validateAndNormalizeLayout(layout)).toThrow(/safety limit/i);
  });

  it('rejects foreign and mismatched photo references from direct API payloads', () => {
    const normalized = validateAndNormalizeLayout(validLayout());
    expect(() => assertOwnedPhotoReferences(normalized, [])).toThrow(/does not belong/i);

    const mismatched = validateAndNormalizeLayout(validLayout());
    expect(() =>
      assertOwnedPhotoReferences(mismatched, [
        { id: 'photo-1', storage_key: 'owned-one.jpg' },
        { id: 'photo-2', storage_key: 'users/u/binders/b/photo-1.jpg' }
      ])
    ).toThrow(/mismatched/i);
  });

  it('canonicalizes an owned photo ID and storage key', () => {
    const layout = validLayout();
    layout.pages[0].layers[0].storageKey = null;
    const normalized = validateAndNormalizeLayout(layout);
    assertOwnedPhotoReferences(normalized, [{ id: 'photo-1', storage_key: 'canonical/photo.jpg' }]);
    expect(normalized.pages[0].layers[0]).toMatchObject({
      photoId: 'photo-1',
      storageKey: 'canonical/photo.jpg'
    });
  });
});
