// File: binder-editor/src/preloadPhotos.js
// Purpose: Preload all binder photo URLs + image bytes so tab switching feels instant.

import { getPhotoViewUrl } from './api';

function preloadImage(url, signal) {
  return new Promise((resolve) => {
    if (!url) return resolve({ ok: false });

    // If we got aborted, stop early.
    if (signal?.aborted) return resolve({ ok: false, aborted: true });

    const img = new Image();

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      resolve({ ok: true, url });
    };

    img.onerror = () => {
      cleanup();
      resolve({ ok: false, url });
    };

    // Kick off fetch of bytes (browser will cache if headers allow)
    img.src = url;
  });
}

// Small concurrency pool so we don’t open 200 connections at once.
async function runPool(items, worker, concurrency = 6) {
  let i = 0;
  const results = [];
  const runners = new Array(concurrency).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Preload all photos referenced by the layout.
 * - First: resolves each storageKey -> final URL (via getPhotoViewUrl)
 * - Second: preloads image bytes via <img> loading
 */
export async function preloadBinderPhotos({
  binderId,
  layout,
  onProgress,
  signal
}) {
  const pages = Array.isArray(layout?.pages) ? layout.pages : [];

  const storageKeys = [];
  const directSrcs = [];

  for (const p of pages) {
    const layers = Array.isArray(p?.layers) ? p.layers : [];
    for (const layer of layers) {
      if (!layer || layer.type !== 'photo') continue;

      if (layer.storageKey) storageKeys.push(layer.storageKey);
      else if (layer.src) directSrcs.push(layer.src);
    }
  }

  const uniqueStorageKeys = Array.from(new Set(storageKeys));
  const uniqueDirectSrcs = Array.from(new Set(directSrcs));

  // Resolve storageKey -> URL
  const resolvedUrls = [];

  // Count total work as: (urls to resolve) + (images to preload)
  const totalResolve = uniqueStorageKeys.length;
  let done = 0;

  const bump = (extraDone = 1, totalOverride = null) => {
    done += extraDone;
    const total = totalOverride ?? null;
    onProgress?.({ done, total });
  };

  // First phase: resolve URLs for storageKeys
  for (const sk of uniqueStorageKeys) {
    if (signal?.aborted) return { urls: [], aborted: true };

    // This hits your /photos/view-url endpoint once per photo (per tab),
    // then caches the result for 3 hours (Patch 1).
    const u = await getPhotoViewUrl(binderId, sk);
    if (u) resolvedUrls.push(u);
    bump(1);
  }

  // Merge in direct src URLs
  const allUrls = Array.from(new Set([...resolvedUrls, ...uniqueDirectSrcs]));

  // Second phase total = resolve count + preload count
  const totalOverall = totalResolve + allUrls.length;
  onProgress?.({ done, total: totalOverall });

  // Preload image bytes with a pool (fills disk cache)
  await runPool(
    allUrls,
    async (url) => {
      if (signal?.aborted) return { ok: false, aborted: true };
      const r = await preloadImage(url, signal);
      bump(1, totalOverall);
      return r;
    },
    6
  );

  return { urls: allUrls, aborted: false };
}