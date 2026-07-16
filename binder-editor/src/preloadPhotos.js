// File: binder-editor/src/preloadPhotos.js
// Purpose: Preload all binder photo URLs + image bytes so tab switching feels instant.

import { getPhotoViewUrl } from './api';

// I am keeping `preloadImage` as a named helper so the surrounding workflow can call this step when it needs it.
function preloadImage(url, signal) {
  // Resolve every outcome instead of rejecting so one unavailable photo does not stop startup.
  return new Promise((resolve) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!url) return resolve({ ok: false });

    // If we got aborted, stop early.
    if (signal?.aborted) return resolve({ ok: false, aborted: true });

    // I am saving `img` here so the nearby steps can reuse the same value without rebuilding it each time.
    const img = new Image();

    // I am saving `cleanup` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cleanup = () => {
      // Release handlers once either load or error settles this small preload task.
      img.onload = null;
      // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
      img.onerror = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    img.onload = () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      cleanup();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      resolve({ ok: true, url });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    img.onerror = () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      cleanup();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      resolve({ ok: false, url });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // Kick off fetch of bytes (browser will cache if headers allow)
    img.src = url;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Small concurrency pool so we don’t open 200 connections at once.
async function runPool(items, worker, concurrency = 6) {
  // Runners share one index and place results back at that index to preserve input order.
  let i = 0;
  // I am saving `results` here so the nearby steps can reuse the same value without rebuilding it each time.
  const results = [];
  // I am saving `runners` here so the nearby steps can reuse the same value without rebuilding it each time.
  const runners = new Array(concurrency).fill(0).map(async () => {
    // I am repeating the next block while this condition remains true, using the existing guard to decide when to stop.
    while (i < items.length) {
      // JavaScript runs this increment synchronously before the worker awaits network work.
      const idx = i++;
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      results[idx] = await worker(items[idx], idx);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
  await Promise.all(runners);
  // This return sends the completed value or response back to the code that called this function.
  return results;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Preload all photos referenced by the layout.
 * - First: resolves each storageKey -> final URL (via getPhotoViewUrl)
 * - Second: preloads image bytes via <img> loading
 */
export async function preloadBinderPhotos({
  // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
  binderId,
  // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
  layout,
  // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
  onProgress,
  // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
  signal
// I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
}) {
  // Gather and deduplicate references before doing network work. A photo reused on
  // several pages should resolve and preload only once during editor startup.
  const pages = Array.isArray(layout?.pages) ? layout.pages : [];

  // I am saving `storageKeys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const storageKeys = [];
  // I am saving `directSrcs` here so the nearby steps can reuse the same value without rebuilding it each time.
  const directSrcs = [];

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const p of pages) {
    // I am saving `layers` here so the nearby steps can reuse the same value without rebuilding it each time.
    const layers = Array.isArray(p?.layers) ? p.layers : [];
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const layer of layers) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!layer || layer.type !== 'photo') continue;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (layer.storageKey) storageKeys.push(layer.storageKey);
      // I am checking this next possibility only because the earlier condition did not choose its path.
      else if (layer.src) directSrcs.push(layer.src);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `uniqueStorageKeys` here so the nearby steps can reuse the same value without rebuilding it each time.
  const uniqueStorageKeys = Array.from(new Set(storageKeys));
  // Direct sources are kept for old layouts that do not have a storage key yet.
  const uniqueDirectSrcs = Array.from(new Set(directSrcs));

  // Resolve storageKey -> URL
  const resolvedUrls = [];

  // Count total work as: (urls to resolve) + (images to preload)
  const totalResolve = uniqueStorageKeys.length;
  // I am saving `done` here so the nearby steps can reuse the same value without rebuilding it each time.
  let done = 0;

  // I am saving `bump` here so the nearby steps can reuse the same value without rebuilding it each time.
  const bump = (extraDone = 1, totalOverride = null) => {
    // App turns these counts into the percentage shown on its loading screen.
    done += extraDone;
    // I am saving `total` here so the nearby steps can reuse the same value without rebuilding it each time.
    const total = totalOverride ?? null;
    // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
    onProgress?.({ done, total });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // First phase: resolve URLs for storageKeys
  for (const sk of uniqueStorageKeys) {
    // Stop between requests when App aborts because the user moved to another binder.
    if (signal?.aborted) return { urls: [], aborted: true };

    // This hits your /photos/view-url endpoint once per photo (per tab),
    // then caches the result for 3 hours (Patch 1).
    const u = await getPhotoViewUrl(binderId, sk);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (u) resolvedUrls.push(u);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    bump(1);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Merge in direct src URLs
  const allUrls = Array.from(new Set([...resolvedUrls, ...uniqueDirectSrcs]));

  // URL resolution and byte warming are both visible work in the combined progress total.
  // Second phase total = resolve count + preload count
  const totalOverall = totalResolve + allUrls.length;
  // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
  onProgress?.({ done, total: totalOverall });

  // Preload image bytes with a pool (fills disk cache)
  await runPool(
    // Six workers avoid a connection burst while still warming independent images in parallel.
    allUrls,
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    async (url) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (signal?.aborted) return { ok: false, aborted: true };
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await preloadImage(url, signal);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      bump(1, totalOverall);
      // This return sends the completed value or response back to the code that called this function.
      return r;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding preloadPhotos.js workflow expects this value or operation before it continues.
    6
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // This return sends the completed value or response back to the code that called this function.
  return { urls: allUrls, aborted: false };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}