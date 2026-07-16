// File: binder-editor/src/App.jsx
// Description: Main React component for binder editor
// Purpose: Canvas editor with pages, layers, drag/resize + autosave

import React, { useState, useEffect, useCallback, useRef } from 'react';
// I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
import {
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  getLayout,
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  applyLayout,
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  exportBinderPdf,
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  deleteBinderPhoto,
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  uploadBinderPhotos,
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  getPhotoViewUrl
// I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
} from './api';
// I am importing `useModal` from `./ModalProvider` here because App.jsx uses it in the steps below.
import { useModal } from './ModalProvider';
// I am importing `Canvas` from `./Canvas` here because App.jsx uses it in the steps below.
import Canvas from './Canvas';
// I am importing `PageList` from `./PageList` here because App.jsx uses it in the steps below.
import PageList from './PageList';
// I am importing `ActionSidebar` from `./ActionSidebar` here because App.jsx uses it in the steps below.
import ActionSidebar from './ActionSidebar';
// I am loading `./App.css` here because its setup work is needed before the rest of App.jsx runs.
import './App.css';
// I am importing `SECTION_LABELS` from `./sections` here because App.jsx uses it in the steps below.
import { SECTION_LABELS, SECTION_OPTIONS } from './sections';
// I am importing `preloadBinderPhotos` from `./preloadPhotos` here because App.jsx uses it in the steps below.
import { preloadBinderPhotos } from './preloadPhotos';
// I am importing `MobileMenu` from `./MobileMenu` here because App.jsx uses it in the steps below.
import MobileMenu from './MobileMenu';
// I am importing `captureImageDimensions` from `./utils/imageDimensions` here because App.jsx uses it in the steps below.
import { captureImageDimensions } from './utils/imageDimensions';

// I am saving `AUTOSAVE_DEBOUNCE_MS` here so the nearby steps can reuse the same value without rebuilding it each time.
const AUTOSAVE_DEBOUNCE_MS = 1500;

// A4 at 96 DPI (same as elsewhere)
const PAGE_WIDTH = 794;
// I am saving `PAGE_HEIGHT` here so the nearby steps can reuse the same value without rebuilding it each time.
const PAGE_HEIGHT = 1122;

// Photo layers store TOTAL height (image area + caption).
// Must match CSS (.layer-caption-shell).
const CAPTION_H = 88;

// I am keeping `isSessionExpiredError` as a named helper so the surrounding workflow can call this step when it needs it.
function isSessionExpiredError(err) {
  // The API helper uses this exact message after it has already redirected to login.
  return !!err && err.message === 'SESSION_EXPIRED';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `uuidv4Fallback` as a named helper so the surrounding workflow can call this step when it needs it.
function uuidv4Fallback() {
  // Build a browser-generated UUID for page/layer identity when randomUUID is unavailable.
  const bytes = new Uint8Array(16);
  // These masks set the version and variant bits expected by the UUID v4 format.
  crypto.getRandomValues(bytes);
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  // I am saving `hex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  // This return sends the completed value or response back to the code that called this function.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `makeId` as a named helper so the surrounding workflow can call this step when it needs it.
function makeId() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Prefer the platform helper, while keeping the fallback for older supported browsers.
    if (crypto?.randomUUID) return crypto.randomUUID();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch {}
  // This return sends the completed value or response back to the code that called this function.
  return uuidv4Fallback();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `ensurePageIds` as a named helper so the surrounding workflow can call this step when it needs it.
function ensurePageIds(pages) {
  // PageList uses stable IDs for drag-and-drop, including layouts saved before IDs existed.
  const arr = Array.isArray(pages) ? pages : [];
  // This return sends the completed value or response back to the code that called this function.
  return arr.map((p) => ({ ...p, id: p?.id || makeId() }));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `computeCascadingPhotoFrame` as a named helper so the surrounding workflow can call this step when it needs it.
function computeCascadingPhotoFrame({ index, aspectRatio = 1 }) {
  // 1. Start with a safe image ratio and a frame sized relative to the logical A4 page.
  // 2. Cap tall images, add caption room, then move repeated uploads by a small offset.
  // 3. Clamp the final frame so Canvas receives geometry that starts inside the page.
  const safeAr = typeof aspectRatio === 'number' && aspectRatio > 0 ? aspectRatio : 1;

  // Use the photo ratio for its image area; the saved height also includes the caption.
  let w = Math.round(PAGE_WIDTH * 0.55);
  // I am saving `imageH` here so the nearby steps can reuse the same value without rebuilding it each time.
  let imageH = Math.round(w / safeAr);
  // I am saving `maxImageH` here so the nearby steps can reuse the same value without rebuilding it each time.
  const maxImageH = Math.round(PAGE_HEIGHT * 0.55);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (imageH > maxImageH) {
    // Recalculate width from the capped height so portrait photos keep their proportions.
    imageH = maxImageH;
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    w = Math.round(imageH * safeAr);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `totalH` here so the nearby steps can reuse the same value without rebuilding it each time.
  const totalH = imageH + CAPTION_H;

  // I am saving `baseX` here so the nearby steps can reuse the same value without rebuilding it each time.
  const baseX = Math.round((PAGE_WIDTH - w) / 2);
  // I am saving `baseY` here so the nearby steps can reuse the same value without rebuilding it each time.
  const baseY = Math.round((PAGE_HEIGHT - totalH) / 2);
  // I am saving `step` here so the nearby steps can reuse the same value without rebuilding it each time.
  const step = 24;
  // A small repeating offset keeps new uploads visible instead of stacking them exactly.
  // Modulo keeps a large upload batch from walking off the page.
  const offset = (index % 8) * step;

  // I am saving `x` here so the nearby steps can reuse the same value without rebuilding it each time.
  const x = Math.min(Math.max(baseX + offset, 0), PAGE_WIDTH - w);
  // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y = Math.min(Math.max(baseY + offset, 0), PAGE_HEIGHT - totalH);

  // App stores this geometry on the new layer and Canvas reads it on the next render.
  return { x, y, width: w, height: totalH };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `App` as a named helper so the surrounding workflow can call this step when it needs it.
function App({ binderId }) {
  // This component owns the editor workflow: the saved layout, current selection,
  // upload progress, and save/export actions shared by the smaller UI components.
  // Keep the server layout and the visible page together because most editor actions need both.
  const [layout, setLayout] = useState(null);
  // I am saving `selectedPage` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [selectedPage, setSelectedPage] = useState(0);
  // I am saving `loading` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [loading, setLoading] = useState(true);
  // I am saving `preloadProgress` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [preloadProgress, setPreloadProgress] = useState({ done: 0, total: 0 });
  // ModalProvider supplies the one shared dialog owner used for preview and delete prompts.
  const { openModal } = useModal();

  // These flags feed the sidebar/menu labels and stop overlapping save or export actions.
  const [saving, setSaving] = useState(false);
  // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [error, setError] = useState(null);

  // I am saving `isDirty` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [isDirty, setIsDirty] = useState(false);
  // Initial-load state keeps the autosave effect from writing the layout it just received.
  const [hasLoadedInitialLayout, setHasLoadedInitialLayout] = useState(false);
  // I am saving `lastSavedAt` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // I am saving `selectedLayerId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [selectedLayerId, setSelectedLayerId] = useState(null);

  // Preview and download use separate flags because they finish in different UI destinations.
  const [exporting, setExporting] = useState(false);
  // I am saving `previewing` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [previewing, setPreviewing] = useState(false);

  // I am saving `zoom` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [zoom, setZoom] = useState(1);
  // These refs reach the measured canvas shell and the hidden upload input without extra renders.
  const canvasStageRef = useRef(null);
  // I am saving `fileInputRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fileInputRef = useRef(null);
  // I am saving `mobilePageListOpen` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [mobilePageListOpen, setMobilePageListOpen] = useState(false);

  // Keep latest layout in a ref (for saves that run later).
  const layoutRef = useRef(layout);
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    layoutRef.current = layout;
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, [layout]);

  // Refs give async saves the latest layout without rebuilding every callback. The
  // revision counter tells us whether a completed save fell behind newer edits.
  const dirtyRevRef = useRef(0);
  // I am saving `markDirty` here so the nearby steps can reuse the same value without rebuilding it each time.
  const markDirty = useCallback(() => {
    // Every real layout edit advances the revision that flushSaveNow compares after saving.
    dirtyRevRef.current += 1;
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setIsDirty(true);
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // Prevent overlapping saves; queue at most one follow-up.
  const saveInFlightRef = useRef(false);
  // I am saving `saveQueuedRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const saveQueuedRef = useRef(false);

  // Older layouts predate sections. Only infer defaults when the whole layout is old;
  // once any page has a section, blank values are treated as intentional.
  const applySectionDefaults = useCallback((pages) => {
    // Return an empty list for malformed server data so the editor can still open safely.
    if (!Array.isArray(pages)) return [];
    // I am saving `anyHasSection` here so the nearby steps can reuse the same value without rebuilding it each time.
    const anyHasSection = pages.some((p) => p && p.sectionKey);
    // This return sends the completed value or response back to the code that called this function.
    return pages.map((page, idx) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!page) return page;
      // The first legacy page becomes Overview; later legacy pages become Photos.
      const sectionKey = page.sectionKey
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        ? page.sectionKey
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        : anyHasSection
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        ? null
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        : idx === 0
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        ? 'overview'
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        : 'photos';
      // This return sends the completed value or response back to the code that called this function.
      return { ...page, sectionKey };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `flushSaveNow` here so the nearby steps can reuse the same value without rebuilding it each time.
  const flushSaveNow = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    async ({ reason } = {}) => {
      // 1. Refuse an incomplete save and collapse overlapping requests into one queued retry.
      // 2. Send one stable snapshot through api.applyLayout and update the save indicators.
      // 3. Clear dirty state only when no newer revision appeared during the request.
      if (!binderId) return;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!layoutRef.current) return;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (saveInFlightRef.current) {
        // One boolean is enough because the queued save reads the newest layoutRef snapshot.
        saveQueuedRef.current = true;
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      saveInFlightRef.current = true;
      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      saveQueuedRef.current = false;

      // Save a stable snapshot and remember its revision. Edits made while the request is
      // in flight remain dirty and cause the queued follow-up save below.
      const startRev = dirtyRevRef.current;
      // I am saving `snapshot` here so the nearby steps can reuse the same value without rebuilding it each time.
      const snapshot = layoutRef.current;

      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // Clear an older error as soon as a fresh save attempt begins.
        setSaving(true);
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setError(null);

        // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
        const result = await applyLayout(binderId, snapshot);

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (result?.ok) {
          // Keep the server timestamp with the local layout for status display and later loads.
          setLayout((prev) => (prev ? { ...prev, updatedAt: result.updatedAt } : prev));
          // I am updating or clearing this saved state here so the interface reflects the result of the action above.
          setLastSavedAt(result.updatedAt || new Date().toISOString());
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // Only clear dirty if nothing changed since we started this save.
        if (dirtyRevRef.current === startRev) {
          // I am updating or clearing this saved state here so the interface reflects the result of the action above.
          setIsDirty(false);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // api.request already owns the redirect, so this component only handles other failures.
        if (isSessionExpiredError(err)) return;
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setError(err.message || `Save failed${reason ? ` (${reason})` : ''}`);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('[BinderEditor] Save failed:', err);
      // This final block runs after success or failure so the shared cleanup still happens in either outcome.
      } finally {
        // Release the in-flight guard before starting any save that accumulated behind it.
        setSaving(false);
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        saveInFlightRef.current = false;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (saveQueuedRef.current) {
          // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
          saveQueuedRef.current = false;
          // Run queued save on next tick.
          setTimeout(() => {
            // The empty catch prevents a detached timer promise from becoming unhandled.
            flushSaveNow({ reason: 'queued' }).catch(() => {});
          // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
          }, 0);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [binderId]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Selection belongs to the canvas. Clicking its empty space, or leaving the editor
    // entirely, clears the active layer without coupling every child to this state.
    const handleGlobalMouseDown = (e) => {
      // I am saving `root` here so the nearby steps can reuse the same value without rebuilding it each time.
      const root = document.getElementById('binder-editor-root');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!root) return;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!root.contains(e.target)) {
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setSelectedLayerId(null);
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `canvas` here so the nearby steps can reuse the same value without rebuilding it each time.
      const canvas = root.querySelector('.binder-editor-canvas');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!canvas) return;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!canvas.contains(e.target)) return;

      // I am saving `layerEl` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layerEl = e.target.closest('.binder-editor-layer');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!layerEl) setSelectedLayerId(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('mousedown', handleGlobalMouseDown);
    // Remove the document listener when App unmounts so another editor mount gets one copy.
    return () => document.removeEventListener('mousedown', handleGlobalMouseDown);
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am keeping `pickInitialPage` as a named helper so the surrounding workflow can call this step when it needs it.
  function pickInitialPage(pages) {
    // Open on useful content when possible, while retaining the first-page fallback for
    // a new or entirely empty binder.
    if (!Array.isArray(pages) || pages.length === 0) return 0;

    // I am saving `withPhotos` here so the nearby steps can reuse the same value without rebuilding it each time.
    const withPhotos = pages.findIndex(
      // I am defining this small callback here so the surrounding API can run it with the value it supplies.
      (page) =>
        // I am calling this helper here so the current workflow performs this step before it moves on.
        Array.isArray(page.layers) &&
        // I am calling this helper here so the current workflow performs this step before it moves on.
        page.layers.some(
          // I am defining this small callback here so the surrounding API can run it with the value it supplies.
          (layer) =>
            // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
            layer &&
            // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
            layer.type === 'photo' &&
            // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
            (layer.storageKey || layer.src || layer.photoId)
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        )
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // A page containing a real photo reference is more useful than a text-only page on reopen.
    if (withPhotos >= 0) return withPhotos;

    // I am saving `nonEmpty` here so the nearby steps can reuse the same value without rebuilding it each time.
    const nonEmpty = pages.findIndex(
      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      (page) => Array.isArray(page.layers) && page.layers.length > 0
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (nonEmpty >= 0) return nonEmpty;

    // This return sends the completed value or response back to the code that called this function.
    return 0;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // This controller and mounted flag belong to one binderId load cycle.
    let mounted = true;
    // I am saving `ac` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ac = new AbortController();

    // Hydrate the editor first, then warm photo URLs/bytes before removing the loading
    // screen. Abort and mounted checks keep a binder switch from updating stale state.
    async function load() {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setLoading(true);

        // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
        const data = await getLayout(binderId);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!mounted) return;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (data.ok && data.layout) {
          // Keep only the editor fields App expects, then normalize older section/page shapes.
          const safeLayout = {
            // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
            binderId,
            // I am keeping the `pages` field in this object so the receiving code can read that value by its expected name.
            pages: applySectionDefaults(
              // I am calling this helper here so the current workflow performs this step before it moves on.
              Array.isArray(data.layout.pages) ? data.layout.pages : []
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            ),
            // I am keeping the `updatedAt` field in this object so the receiving code can read that value by its expected name.
            updatedAt: data.layout.updatedAt || new Date().toISOString()
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          };

          // I am mapping the collection here so each input item becomes the output shape expected by the next step.
          safeLayout.pages = ensurePageIds(safeLayout.pages).map((page, index) => ({
            // Saved order wins when present; missing layer lists become editable empty arrays.
            ...page,
            // I am keeping the `pageIndex` field in this object so the receiving code can read that value by its expected name.
            pageIndex: typeof page.pageIndex === 'number' ? page.pageIndex : index,
            // I am keeping the `layers` field in this object so the receiving code can read that value by its expected name.
            layers: Array.isArray(page.layers) ? page.layers : []
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          }));

          // I am updating or clearing this saved state here so the interface reflects the result of the action above.
          setLayout(safeLayout);
          // The status bar and initial page now come from this normalized local copy.
          setLastSavedAt(safeLayout.updatedAt);
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (safeLayout.pages.length > 0) setSelectedPage(pickInitialPage(safeLayout.pages));

          // Reset dirty state after initial load.
          dirtyRevRef.current = 0;
          // I am updating or clearing this saved state here so the interface reflects the result of the action above.
          setIsDirty(false);

          // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
          const result = await preloadBinderPhotos({
            // preloadPhotos resolves private view URLs and warms bytes before the canvas appears.
            binderId,
            // I am keeping the `layout` field in this object so the receiving code can read that value by its expected name.
            layout: safeLayout,
            // I am keeping the `signal` field in this object so the receiving code can read that value by its expected name.
            signal: ac.signal,
            // I am keeping the `onProgress` field in this object so the receiving code can read that value by its expected name.
            onProgress: (p) => {
              // Ignore late progress from a binder that unmounted while requests were finishing.
              if (!mounted) return;
              // I am updating or clearing this saved state here so the interface reflects the result of the action above.
              setPreloadProgress({
                // I am keeping the `done` field in this object so the receiving code can read that value by its expected name.
                done: Number(p.done || 0),
                // I am keeping the `total` field in this object so the receiving code can read that value by its expected name.
                total: Number(p.total || 0)
              // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
              });
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (result?.aborted) console.warn('[BinderEditor] preload aborted');
        // This alternative runs only when the condition above did not use its first path.
        } else {
          // A binder with no stored layout still needs the normal local shape for adding pages.
          setLayout({ binderId, pages: [], updatedAt: new Date().toISOString() });
          // I am updating or clearing this saved state here so the interface reflects the result of the action above.
          setLastSavedAt(null);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setHasLoadedInitialLayout(true);
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // Keep a redirecting session error quiet; other load errors remain visible in App.
        if (!mounted) return;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (isSessionExpiredError(err)) return;
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setError(err.message);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('[BinderEditor] Failed to load layout:', err);
      // This final block runs after success or failure so the shared cleanup still happens in either outcome.
      } finally {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (mounted) setLoading(false);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    load();

    // This return sends the completed value or response back to the code that called this function.
    return () => {
      // Stop both React state updates and pending preload requests when the binder changes.
      mounted = false;
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        ac.abort();
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {}
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, [binderId, applySectionDefaults]);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Fit reacts to both window changes and editor-shell changes (for example a sidebar
    // opening). The short debounce avoids repeated layout work during resize.
    const calculateFitZoom = () => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!canvasStageRef.current) return;

      // Measure the available shell rather than the window because sidebars also change width.
      const stageRect = canvasStageRef.current.getBoundingClientRect();
      // I am saving `isMobile` here so the nearby steps can reuse the same value without rebuilding it each time.
      const isMobile = window.innerWidth <= 900;
      // I am saving `padding` here so the nearby steps can reuse the same value without rebuilding it each time.
      const padding = isMobile ? 16 : 24;
      // I am saving `paddingTotal` here so the nearby steps can reuse the same value without rebuilding it each time.
      const paddingTotal = padding * 2;

      // I am saving `availableWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
      const availableWidth = Math.max(200, stageRect.width - paddingTotal);
      // I am saving `availableHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
      const availableHeight = Math.max(200, stageRect.height - paddingTotal);

      // I am saving `zoomX` here so the nearby steps can reuse the same value without rebuilding it each time.
      const zoomX = availableWidth / PAGE_WIDTH;
      // I am saving `zoomY` here so the nearby steps can reuse the same value without rebuilding it each time.
      const zoomY = availableHeight / PAGE_HEIGHT;
      // Never enlarge during automatic fit; users can still zoom above 100% themselves.
      const fitZoom = Math.min(zoomX, zoomY, 1);

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setZoom((prevZoom) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (Math.abs(prevZoom - fitZoom) < 0.01) return prevZoom;
        // This return sends the completed value or response back to the code that called this function.
        return fitZoom;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am saving `timeoutId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const timeoutId = setTimeout(calculateFitZoom, 100);

    // Debounce both sources into the same calculation to avoid flicker during layout changes.
    let resizeTimeout;
    // I am saving `handleResize` here so the nearby steps can reuse the same value without rebuilding it each time.
    const handleResize = () => {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearTimeout(resizeTimeout);
      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      resizeTimeout = setTimeout(calculateFitZoom, 150);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    window.addEventListener('resize', handleResize);

    // I am saving `observer` here so the nearby steps can reuse the same value without rebuilding it each time.
    const observer = new ResizeObserver(() => {
      // ResizeObserver catches workspace changes that do not fire a window resize event.
      clearTimeout(resizeTimeout);
      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      resizeTimeout = setTimeout(calculateFitZoom, 150);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (canvasStageRef.current) observer.observe(canvasStageRef.current);

    // This return sends the completed value or response back to the code that called this function.
    return () => {
      // Clear timers as well as observers so no measurement runs after the DOM is gone.
      clearTimeout(timeoutId);
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearTimeout(resizeTimeout);
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      window.removeEventListener('resize', handleResize);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      observer.disconnect();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `handleZoomChange` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleZoomChange = useCallback((newZoom) => {
    // Keep manual zoom inside a usable range before Canvas applies it to the page scale.
    setZoom(Math.max(0.25, Math.min(2, newZoom)));
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `handleZoomFit` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleZoomFit = useCallback(() => {
    // This immediate version supports the explicit Fit button in Canvas.
    if (!canvasStageRef.current) return;
    // I am saving `stageRect` here so the nearby steps can reuse the same value without rebuilding it each time.
    const stageRect = canvasStageRef.current.getBoundingClientRect();
    // I am saving `availableWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
    const availableWidth = stageRect.width - 48;
    // I am saving `availableHeight` here so the nearby steps can reuse the same value without rebuilding it each time.
    const availableHeight = stageRect.height - 48;
    // I am saving `zoomX` here so the nearby steps can reuse the same value without rebuilding it each time.
    const zoomX = availableWidth / PAGE_WIDTH;
    // I am saving `zoomY` here so the nearby steps can reuse the same value without rebuilding it each time.
    const zoomY = availableHeight / PAGE_HEIGHT;
    // I am saving `fitZoom` here so the nearby steps can reuse the same value without rebuilding it each time.
    const fitZoom = Math.min(zoomX, zoomY, 1);
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setZoom(fitZoom);
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Wait until a real user edit exists, then restart this timer after each layout change.
    if (!hasLoadedInitialLayout) return;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!layout) return;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!isDirty) return;

    // I am saving `timer` here so the nearby steps can reuse the same value without rebuilding it each time.
    const timer = setTimeout(() => {
      // flushSaveNow still protects against an export or manual save already in progress.
      flushSaveNow({ reason: 'autosave' }).catch(() => {});
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    }, AUTOSAVE_DEBOUNCE_MS);

    // This return sends the completed value or response back to the code that called this function.
    return () => clearTimeout(timer);
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, [layout, isDirty, hasLoadedInitialLayout, flushSaveNow]);

  // I am saving `updateLayer` here so the nearby steps can reuse the same value without rebuilding it each time.
  const updateLayer = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (layerId, updates) => {
      // Keep edits immutable so React sees the changed page, then send persistence
      // through the same dirty-state path used by page and section changes.
      setLayout((prev) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;

        // I am saving `newPages` here so the nearby steps can reuse the same value without rebuilding it each time.
        const newPages = [...prev.pages];
        // I am saving `page` here so the nearby steps can reuse the same value without rebuilding it each time.
        const page = { ...newPages[selectedPage] };
        // I am mapping the collection here so each input item becomes the output shape expected by the next step.
        page.layers = (page.layers || []).map((layer) =>
          // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
          layer.id === layerId ? { ...layer, ...updates } : layer
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        newPages[selectedPage] = page;

        // This return sends the completed value or response back to the code that called this function.
        return { ...prev, pages: newPages };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am calling this helper here so the current workflow performs this step before it moves on.
      markDirty();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [selectedPage, markDirty]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // Kept for Canvas prop compatibility; should be a no-op unless you actually implement it.
  const handleAddPhoto = useCallback(() => {}, []);

  // I am saving `handleAddPhotosClick` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleAddPhotosClick = useCallback(() => {
    // The visible sidebar/mobile button forwards to the one hidden native file input below.
    fileInputRef.current?.click();
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `handleUploadPhotos` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleUploadPhotos = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    async (files) => {
      // Stop before network work when the browser did not supply files or a binder route key.
      if (!files || !files.length) return;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!binderId) return;

      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // Upload first, resolve protected view URLs, then add the frames in one layout
        // update. This keeps partially resolved uploads out of the editable page.
        const data = await uploadBinderPhotos(binderId, files);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!data || !Array.isArray(data.photos)) return;

        // I am saving `photoDataWithAspectRatios` here so the nearby steps can reuse the same value without rebuilding it each time.
        const photoDataWithAspectRatios = await Promise.all(
          // Resolve every upload in parallel so a large selection does not wait serially.
          data.photos.map(async (photo) => {
            // I am saving `storageKey` here so the nearby steps can reuse the same value without rebuilding it each time.
            const storageKey = photo.storageKey || null;

            // Prefer server-provided url, otherwise ask view-url endpoint.
            let url =
              // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
              photo.url ||
              // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
              photo.signedUrl ||
              // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
              photo.publicUrl ||
              // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
              photo.previewUrl ||
              // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
              photo.src ||
              // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
              null;

            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (!url && storageKey) {
              // The API helper asks the protected view-url controller and caches its answer.
              url = await getPhotoViewUrl(binderId, storageKey).catch(() => null);
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }

            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (!url) {
              // This return sends the completed value or response back to the code that called this function.
              return { ...photo, url: null, aspectRatio: 1, naturalWidth: 0, naturalHeight: 0 };
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }

            // Natural dimensions let the first frame preserve the photo's real aspect
            // ratio. A failed metadata read should not discard an otherwise valid upload.
            try {
              // I am saving `naturalWidth` here so the nearby steps can reuse the same value without rebuilding it each time.
              const { naturalWidth, naturalHeight, aspectRatio } = await captureImageDimensions(url);
              // This return sends the completed value or response back to the code that called this function.
              return { ...photo, url, aspectRatio, naturalWidth, naturalHeight };
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch {
              // This return sends the completed value or response back to the code that called this function.
              return { ...photo, url, aspectRatio: 1, naturalWidth: 0, naturalHeight: 0 };
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          })
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );

        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setLayout((prev) => {
          // Use the latest state because uploads may finish after another local page edit.
          const base = prev || { binderId, pages: [], updatedAt: new Date().toISOString() };
          // I am saving `pages` here so the nearby steps can reuse the same value without rebuilding it each time.
          const pages = [...(base.pages || [])];

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (!pages[selectedPage]) {
            // Uploading into an empty binder creates the selected page before adding layers.
            pages[selectedPage] = { id: makeId(), pageIndex: selectedPage, layers: [] };
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }

          // I am saving `page` here so the nearby steps can reuse the same value without rebuilding it each time.
          const page = { ...pages[selectedPage] };
          // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
          page.layers = Array.isArray(page.layers) ? [...page.layers] : [];
          // I am saving `nextLayers` here so the nearby steps can reuse the same value without rebuilding it each time.
          const nextLayers = [...page.layers];

          // I am defining this small callback here so the surrounding API can run it with the value it supplies.
          photoDataWithAspectRatios.forEach((photo) => {
            // Each server photo becomes one saved photo layer with its storage identity intact.
            const url = photo.url || null;

            // I am saving `imageAspectRatio` here so the nearby steps can reuse the same value without rebuilding it each time.
            const imageAspectRatio =
              // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
              typeof photo.aspectRatio === 'number' && photo.aspectRatio > 0
                // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
                ? photo.aspectRatio
                // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
                : 1;

            // I am saving `totalFrame` here so the nearby steps can reuse the same value without rebuilding it each time.
            const totalFrame = computeCascadingPhotoFrame({
              // Existing layer count also keeps this upload batch from landing in one stack.
              index: nextLayers.length,
              // I am keeping the `aspectRatio` field in this object so the receiving code can read that value by its expected name.
              aspectRatio: imageAspectRatio
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });

            // I am calling this helper here so the current workflow performs this step before it moves on.
            nextLayers.push({
              // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
              id: makeId(),
              // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
              type: 'photo',
              // I am keeping the `x` field in this object so the receiving code can read that value by its expected name.
              x: totalFrame.x,
              // I am keeping the `y` field in this object so the receiving code can read that value by its expected name.
              y: totalFrame.y,
              // I am keeping the `width` field in this object so the receiving code can read that value by its expected name.
              width: totalFrame.width,
              // I am keeping the `height` field in this object so the receiving code can read that value by its expected name.
              height: totalFrame.height,
              // I am keeping the `rotation` field in this object so the receiving code can read that value by its expected name.
              rotation: 0,
              // I am keeping the `zIndex` field in this object so the receiving code can read that value by its expected name.
              zIndex: nextLayers.length,
              // I am keeping the `photoId` field in this object so the receiving code can read that value by its expected name.
              photoId: photo.photoId || null,
              // I am keeping the `storageKey` field in this object so the receiving code can read that value by its expected name.
              storageKey: photo.storageKey || null,
              // I am keeping the `src` field in this object so the receiving code can read that value by its expected name.
              src: url,
              // I am keeping the `photoAspectRatio` field in this object so the receiving code can read that value by its expected name.
              photoAspectRatio: imageAspectRatio,
              // I am keeping the `photoNaturalWidth` field in this object so the receiving code can read that value by its expected name.
              photoNaturalWidth: photo.naturalWidth || 0,
              // I am keeping the `photoNaturalHeight` field in this object so the receiving code can read that value by its expected name.
              photoNaturalHeight: photo.naturalHeight || 0
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            });
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          });

          // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
          pages[selectedPage] = { ...page, layers: nextLayers };

          // Section defaults are applied here too because this may be the binder's first page.
          return { ...base, pages: applySectionDefaults(pages) };
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });

        // I am calling this helper here so the current workflow performs this step before it moves on.
        markDirty();
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch (err) {
        // Keep the current layout untouched if any required upload stage fails.
        if (isSessionExpiredError(err)) return;
        // I am calling this helper here so the current workflow performs this step before it moves on.
        console.error('[BinderEditor] Upload exception', err);
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setError(err.message || 'Upload failed due to a network error. Please try again.');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [binderId, selectedPage, applySectionDefaults, markDirty]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `handleFileChange` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleFileChange = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    async (e) => {
      // Copy FileList before awaiting, then clear the input so choosing the same file works again.
      const files = Array.from(e.target.files || []);
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await handleUploadPhotos(files);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (fileInputRef.current) fileInputRef.current.value = '';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [handleUploadPhotos]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `handleSelectLayer` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleSelectLayer = useCallback((layerId) => {
    // Canvas and Layer report selection here; null is the shared no-selection value.
    setSelectedLayerId(layerId || null);
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `handleSectionChange` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleSectionChange = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (pageIndex, sectionKey) => {
      // PageList/Canvas send the page index and sections.js key selected by the user.
      setLayout((prev) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!prev || !prev.pages || !prev.pages[pageIndex]) return prev;
        // I am saving `pages` here so the nearby steps can reuse the same value without rebuilding it each time.
        const pages = [...prev.pages];
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        pages[pageIndex] = { ...pages[pageIndex], sectionKey };
        // This return sends the completed value or response back to the code that called this function.
        return { ...prev, pages };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am calling this helper here so the current workflow performs this step before it moves on.
      markDirty();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [markDirty]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // Placeholder: only mark dirty if you actually change layout.
  const handleTidyLayout = useCallback(() => {}, []);

  // I am saving `removeLayer` here so the nearby steps can reuse the same value without rebuilding it each time.
  const removeLayer = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    async (layerId) => {
      // Read the latest page snapshot because a confirmation dialog may stay open during edits.
      const current = layoutRef.current;
      // I am saving `page` here so the nearby steps can reuse the same value without rebuilding it each time.
      const page = current?.pages?.[selectedPage];
      // I am saving `layer` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layer = page?.layers?.find((l) => l.id === layerId);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!layer) throw new Error('Layer not found');

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (layer?.storageKey && binderId) {
        // Delete the owned storage/database photo first so the UI does not hide a failed cleanup.
        await deleteBinderPhoto(binderId, layer.storageKey);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setLayout((prev) => {
        // Remove only the confirmed layer from the current React layout.
        if (!prev || !prev.pages || !prev.pages[selectedPage]) return prev;
        // I am saving `newPages` here so the nearby steps can reuse the same value without rebuilding it each time.
        const newPages = [...prev.pages];
        // I am saving `p` here so the nearby steps can reuse the same value without rebuilding it each time.
        const p = { ...newPages[selectedPage] };
        // I am filtering the collection here so only items that pass the nearby check continue to the next step.
        p.layers = (p.layers || []).filter((l) => l.id !== layerId);
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        newPages[selectedPage] = p;
        // This return sends the completed value or response back to the code that called this function.
        return { ...prev, pages: newPages };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am calling this helper here so the current workflow performs this step before it moves on.
      markDirty();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [selectedPage, binderId, markDirty]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `handleReorderPages` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleReorderPages = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (fromIndex, toIndex) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (fromIndex === toIndex) return;

      // Keep the same logical page selected as surrounding pages move past it.
      setSelectedPage((prevSelected) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (prevSelected === fromIndex) return toIndex;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (fromIndex < toIndex && prevSelected > fromIndex && prevSelected <= toIndex) {
          // This return sends the completed value or response back to the code that called this function.
          return prevSelected - 1;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (toIndex < fromIndex && prevSelected >= toIndex && prevSelected < fromIndex) {
          // This return sends the completed value or response back to the code that called this function.
          return prevSelected + 1;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // This return sends the completed value or response back to the code that called this function.
        return prevSelected;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setLayout((prev) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!prev || !Array.isArray(prev.pages)) return prev;

        // Move a shallow copy, then rewrite pageIndex to match the new persisted order.
        const pages = [...prev.pages];
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!pages[fromIndex] || toIndex < 0 || toIndex >= pages.length) return prev;

        // I am saving `moved` here so the nearby steps can reuse the same value without rebuilding it each time.
        const [moved] = pages.splice(fromIndex, 1);
        // I am calling this helper here so the current workflow performs this step before it moves on.
        pages.splice(toIndex, 0, moved);

        // I am saving `normalizedPages` here so the nearby steps can reuse the same value without rebuilding it each time.
        const normalizedPages = pages.map((p, idx) => ({
          // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
          ...p,
          // I am keeping the `pageIndex` field in this object so the receiving code can read that value by its expected name.
          pageIndex: idx
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        }));

        // This return sends the completed value or response back to the code that called this function.
        return { ...prev, pages: normalizedPages };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am calling this helper here so the current workflow performs this step before it moves on.
      markDirty();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [markDirty]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `handleDeletePage` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleDeletePage = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    async (pageIndexToDelete) => {
      // Remove the page from the layout, then clean up storage only for photos that are
      // no longer referenced. Cleanup failures are collected so the layout can still save.
      const current = layoutRef.current;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!current || !Array.isArray(current.pages)) return;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof pageIndexToDelete !== 'number') return;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (pageIndexToDelete < 0 || pageIndexToDelete >= current.pages.length) return;

      // I am saving `pagesBefore` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pagesBefore = current.pages;
      // Take photo keys from the deleted page before removing it from the local array.
      const pageToDelete = pagesBefore[pageIndexToDelete];
      // I am saving `layers` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layers = Array.isArray(pageToDelete?.layers) ? pageToDelete.layers : [];

      // I am saving `keysOnDeletedPage` here so the nearby steps can reuse the same value without rebuilding it each time.
      const keysOnDeletedPage = new Set(
        // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
        layers
          // I am filtering the collection here so only items that pass the nearby check continue to the next step.
          .filter((l) => l && l.type === 'photo' && l.storageKey)
          // I am mapping the collection here so each input item becomes the output shape expected by the next step.
          .map((l) => String(l.storageKey))
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );

      // I am saving `keysUsedElsewhere` here so the nearby steps can reuse the same value without rebuilding it each time.
      const keysUsedElsewhere = new Set();
      // Scan all remaining pages because the same storage photo can appear more than once.
      pagesBefore.forEach((p, idx) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!p || idx === pageIndexToDelete) return;
        // I am saving `otherLayers` here so the nearby steps can reuse the same value without rebuilding it each time.
        const otherLayers = Array.isArray(p.layers) ? p.layers : [];
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        otherLayers.forEach((l) => {
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (l && l.type === 'photo' && l.storageKey) {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            keysUsedElsewhere.add(String(l.storageKey));
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // A photo may be placed on more than one page. Delete storage only when the page
      // being removed held the last remaining reference.
      const keysToDelete = [...keysOnDeletedPage].filter((k) => !keysUsedElsewhere.has(k));

      // I am saving `failures` here so the nearby steps can reuse the same value without rebuilding it each time.
      const failures = [];
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (binderId && keysToDelete.length > 0) {
        // Delete sequentially so each failure can be reported without cancelling later cleanup.
        for (const storageKey of keysToDelete) {
          // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
          try {
            // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
            await deleteBinderPhoto(binderId, storageKey);
          // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
          } catch (err) {
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (isSessionExpiredError(err)) return;
            // I am calling this helper here so the current workflow performs this step before it moves on.
            failures.push(storageKey);
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `newPages` here so the nearby steps can reuse the same value without rebuilding it each time.
      const newPages = pagesBefore
        // Reindex immediately because the server validator expects order and pageIndex to agree.
        .filter((_, idx) => idx !== pageIndexToDelete)
        // I am mapping the collection here so each input item becomes the output shape expected by the next step.
        .map((p, idx) => ({
          // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
          ...p,
          // I am keeping the `pageIndex` field in this object so the receiving code can read that value by its expected name.
          pageIndex: idx,
          // I am keeping the `layers` field in this object so the receiving code can read that value by its expected name.
          layers: Array.isArray(p?.layers) ? p.layers : []
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        }));

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setLayout((prev) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!prev) return prev;
        // This return sends the completed value or response back to the code that called this function.
        return { ...prev, pages: applySectionDefaults(newPages) };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am saving `nextLen` here so the nearby steps can reuse the same value without rebuilding it each time.
      const nextLen = newPages.length;
      // Keep selection in range and prefer the page that slides into the deleted position.
      setSelectedPage((prevSelected) => {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (prevSelected === pageIndexToDelete) {
          // This return sends the completed value or response back to the code that called this function.
          return nextLen > 0 ? Math.min(pageIndexToDelete, nextLen - 1) : 0;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (prevSelected > pageIndexToDelete) return prevSelected - 1;
        // This return sends the completed value or response back to the code that called this function.
        return prevSelected;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setSelectedLayerId(null);
      // Page removal changes the persisted layout even if some best-effort storage cleanup failed.
      markDirty();

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (failures.length > 0) {
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        setError(
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          `Page deleted, but ${failures.length} photo(s) could not be deleted from storage. Please retry deleting those photos later.`
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    [binderId, applySectionDefaults, markDirty]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `handlePreviewPdf` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handlePreviewPdf = useCallback(async () => {
    // Ignore repeated clicks and wait until App has both a binder route key and layout snapshot.
    if (previewing || !binderId || !layoutRef.current) return;

    // I am saving `url` here so the nearby steps can reuse the same value without rebuilding it each time.
    let url = null;

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // Export runs from the persisted server layout, so flush local edits first.
      if (isDirty) {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await flushSaveNow({ reason: 'preview' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setPreviewing(true);

      // api.exportBinderPdf calls the controller that rebuilds the PDF from saved rows.
      const blob = await exportBinderPdf(binderId);
      // The modal owns the object URL lifetime and revokes it when the preview closes.
      url = window.URL.createObjectURL(blob);

      // I am calling this helper here so the current workflow performs this step before it moves on.
      openModal({
        // ModalProvider renders PdfPreviewModal and calls this cleanup when it is replaced/closed.
        kind: 'pdf',
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: 'PDF Preview',
        // I am keeping the `subtitle` field in this object so the receiving code can read that value by its expected name.
        subtitle: '(A4-size)',
        // I am keeping the `pdfUrl` field in this object so the receiving code can read that value by its expected name.
        pdfUrl: url,
        // I am keeping the `onClose` field in this object so the receiving code can read that value by its expected name.
        onClose: () => {
          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (url) {
            // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
            try {
              // I am calling this helper here so the current workflow performs this step before it moves on.
              window.URL.revokeObjectURL(url);
            // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
            } catch {}
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (isSessionExpiredError(err)) return;

      // Revoke a URL created before a later modal setup failure so browser memory is released.
      if (url) {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          window.URL.revokeObjectURL(url);
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch {}
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setError(`Preview failed: ${err.message}`);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.error('[BinderEditor] Preview failed:', err);
    // This final block runs after success or failure so the shared cleanup still happens in either outcome.
    } finally {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setPreviewing(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, [previewing, binderId, isDirty, flushSaveNow, openModal]);

  // I am saving `handleExportPdf` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleExportPdf = useCallback(async () => {
    // Keep the download path single-flight just like preview.
    if (exporting || !binderId || !layoutRef.current) return;

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // As with preview, the server can only render the most recently saved layout.
      if (isDirty) {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await flushSaveNow({ reason: 'export' });
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setExporting(true);
      // I am saving `blob` here so the nearby steps can reuse the same value without rebuilding it each time.
      const blob = await exportBinderPdf(binderId);

      // A temporary anchor turns the in-memory PDF response into a normal browser download.
      const url = window.URL.createObjectURL(blob);
      // I am saving `a` here so the nearby steps can reuse the same value without rebuilding it each time.
      const a = document.createElement('a');
      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      a.href = url;
      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      a.download = `binder-${binderId || 'export'}.pdf`;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      document.body.appendChild(a);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      a.click();
      // I am calling this helper here so the current workflow performs this step before it moves on.
      document.body.removeChild(a);
      // The browser has accepted the click, so the temporary object URL is no longer needed.
      window.URL.revokeObjectURL(url);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (err) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (isSessionExpiredError(err)) return;
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setError(`Export failed: ${err.message}`);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      console.error('[BinderEditor] Export failed:', err);
    // This final block runs after success or failure so the shared cleanup still happens in either outcome.
    } finally {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setExporting(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
  }, [binderId, isDirty, exporting, flushSaveNow]);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (loading) {
    // Convert preload counts into the bounded percentage shown on the startup card.
    const done = preloadProgress?.done || 0;
    // I am saving `total` here so the nearby steps can reuse the same value without rebuilding it each time.
    const total = preloadProgress?.total || 0;
    // I am saving `pct` here so the nearby steps can reuse the same value without rebuilding it each time.
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

    // This return sends the completed value or response back to the code that called this function.
    return (
      // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
      // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses.
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
        <div className="w-full max-w-md mx-auto px-6">
          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
            <div className="flex items-center gap-4">
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
              <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
              <div className="flex-1">
                {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `h2` element here. The `className` attribute passes the exact values this element or component uses. */}
                <h2 className="text-base font-semibold text-slate-900">
                  {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                  Loading your binder…
                {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                </h2>
                {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `p` element here. The `className` attribute passes the exact values this element or component uses. */}
                <p className="text-sm text-slate-600 mt-1">
                  {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                  Preloading photos so page switching is instant.
                {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                </p>
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              </div>
            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            </div>

            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
            <div className="mt-5">
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `div` element here. The `className`, `style` attributes pass the exact values this element or component uses. */}
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              </div>
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600 tabular-nums">
                {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `span` element here. It does not need any attributes at this point. */}
                <span>{pct}%</span>
                {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `span` element here. It does not need any attributes at this point. */}
                <span>{total > 0 ? `${done} / ${total}` : 'Starting…'}</span>
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              </div>
            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            </div>

            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `p` element here. The `className` attribute passes the exact values this element or component uses. */}
            <p className="mt-4 text-xs text-slate-500">
              {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
              You may see a short delay only when adding new photos or after cache expiry.
            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            </p>
          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          </div>
        {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
        </div>
      {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
      </div>
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `currentPage` here so the nearby steps can reuse the same value without rebuilding it each time.
  const currentPage =
    // Canvas always receives a page-shaped object, including before the first page is added.
    layout?.pages?.[selectedPage] || { pageIndex: selectedPage, layers: [] };

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues.
    // I am opening the `div` element here. The `className`, `onContextMenu` attributes pass the exact values this element or component uses. The confirmed `binder-editor-app` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here.
    <div
      className="binder-editor-app flex flex-col min-h-full bg-slate-50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
      {error && (
        // Async handlers write errors here so the editor can remain open and retryable.
        // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `binder-editor-error` class name connects this markup to matching rules in App.css.
        <div className="binder-editor-error max-w-2xl mx-auto mb-3 rounded-lg border border-rose-100 bg-rose-50 text-rose-800 shadow-sm">
          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `p` element here. It does not need any attributes at this point. */}
          <p>Error: {error}</p>
          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `button` element here. The `className`, `onClick` attributes pass the exact values this element or component uses. The confirmed `btn`, `btn-small` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
          <button className="btn btn-small mt-2" onClick={() => setError(null)}>
            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            Dismiss
          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          </button>
        {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
        </div>
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      )}

      {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `binder-editor-workspace` class name connects this markup to matching rules in App.css. */}
      <div className="binder-editor-workspace flex-1">
        {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `binder-binder-card` class name connects this markup to matching rules in App.css. */}
        <div className="binder-binder-card flex h-full bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          {mobilePageListOpen && (
            // Tapping this backdrop closes the mobile PageList without changing selection.
            // I am opening the `div` element here. The `className`, `onClick`, `aria-hidden` attributes pass the exact values this element or component uses. The confirmed `mobile-page-list-overlay` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control.
            <div
              className="mobile-page-list-overlay"
              onClick={() => setMobilePageListOpen(false)}
              aria-hidden="true"
            />
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          )}

          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `PageList` React component here. The `pages`, `selectedPageIndex`, `sectionLabels`, `onSelectPage`, `onReorderPages`, `onAddPage`, `onDeletePage`, `mobileOverlayOpen`, `onCloseMobileOverlay` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
          <PageList
            /* PageList owns presentation/drag gestures; these callbacks keep layout ownership here. */
            pages={layout?.pages || []}
            selectedPageIndex={selectedPage}
            sectionLabels={SECTION_LABELS}
            onSelectPage={(idx) => setSelectedPage(idx)}
            onReorderPages={handleReorderPages}
            onAddPage={() => {
              // Both desktop page controls use this same immutable append-and-dirty sequence.
              setLayout((prev) => {
                if (!prev) {
                  return {
                    binderId,
                    pages: applySectionDefaults([{ id: makeId(), pageIndex: 0, layers: [] }]),
                    updatedAt: new Date().toISOString()
                  };
                }

                const pages = prev.pages || [];
                const nextIndex = pages.length;

                const newPages = [
                  ...pages,
                  { id: makeId(), pageIndex: nextIndex, layers: [] }
                ];

                return { ...prev, pages: applySectionDefaults(newPages) };
              });
              markDirty();
            }}
            onDeletePage={handleDeletePage}
            mobileOverlayOpen={mobilePageListOpen}
            onCloseMobileOverlay={() => setMobilePageListOpen(false)}
          />

          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `workspace-canvas-wrapper` class name connects this markup to matching rules in App.css. */}
          <div className="workspace-canvas-wrapper">
            {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `Canvas` React component here. The `page`, `layers`, `onUpdateLayer`, `onAddLayer`, `onRemoveLayer`, `sectionKey`, `sectionLabels`, `sectionOptions`, `onSectionChange`, `selectedLayerId`, `onSelectLayer`, `zoom`, `onZoomChange`, `onZoomFit`, `canvasStageRef`, `onToggleMobilePageList`, `onAddPage`, `onDeletePage` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
            <Canvas
              /* Canvas receives one page plus callbacks; App remains the source of saved truth. */
              page={{ ...currentPage, binderId: layout?.binderId || binderId }}
              layers={currentPage.layers || []}
              onUpdateLayer={updateLayer}
              onAddLayer={handleAddPhoto}
              onRemoveLayer={removeLayer}
              sectionKey={currentPage.sectionKey}
              sectionLabels={SECTION_LABELS}
              sectionOptions={SECTION_OPTIONS}
              onSectionChange={handleSectionChange}
              selectedLayerId={selectedLayerId}
              onSelectLayer={handleSelectLayer}
              zoom={zoom}
              onZoomChange={handleZoomChange}
              onZoomFit={handleZoomFit}
              canvasStageRef={canvasStageRef}
              onToggleMobilePageList={() => setMobilePageListOpen(!mobilePageListOpen)}
              onAddPage={() => {
                // The mobile canvas control mirrors PageList's add behavior for the same layout.
                setLayout((prev) => {
                  if (!prev) {
                    return {
                      binderId,
                      pages: applySectionDefaults([{ id: makeId(), pageIndex: 0, layers: [] }]),
                      updatedAt: new Date().toISOString()
                    };
                  }

                  const pages = prev.pages || [];
                  const nextIndex = pages.length;

                  const newPages = [
                    ...pages,
                    { id: makeId(), pageIndex: nextIndex, layers: [] }
                  ];

                  return { ...prev, pages: applySectionDefaults(newPages) };
                });
                markDirty();
              }}
              onDeletePage={handleDeletePage}
            />
          {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
          </div>
        {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
        </div>

        {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `ActionSidebar` React component here. The `onAddPhoto`, `onDeleteSelected`, `onPreviewPdf`, `previewing`, `onExportPdf`, `onTidyLayout`, `saving`, `exporting`, `canExport` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
        <ActionSidebar
          /* The desktop sidebar reports intent here and does not inspect layout internals itself. */
          onAddPhoto={handleAddPhotosClick}
          onDeleteSelected={() => {
            // Explain missing selection before attempting to find or delete a layer.
            if (!selectedLayerId) {
              openModal({
                title: 'No photo selected',
                body:
                  'To delete a photo, first click a photo on the page to select it, then click "Delete photo" again.',
                confirmLabel: 'Got it',
                cancelLabel: null,
                onConfirm: () => {}
              });
              return;
            }

            const p = layoutRef.current?.pages?.[selectedPage];
            // Re-read the layer after the dialog click because selection state can outlive a render.
            const layer = p?.layers?.find((l) => l.id === selectedLayerId);

            if (!layer) {
              setError('Photo not found. Please refresh the page.');
              return;
            }

            const hasStorageKey = layer?.storageKey && binderId;

            // Tell the user when deletion also reaches the server-side storage provider.
            const confirmMessage = hasStorageKey
              ? 'Delete this photo from your binder? This will remove it from this page and from our storage.'
              : 'Delete this photo from this page?';

            openModal({
              title: 'Delete photo',
              body: confirmMessage,
              confirmLabel: 'Delete photo',
              cancelLabel: 'Cancel',
              onConfirm: async () => {
                // removeLayer coordinates the API deletion and the local layout update.
                try {
                  await removeLayer(selectedLayerId);
                  setSelectedLayerId(null);
                } catch (err) {
                  if (isSessionExpiredError(err)) return;
                  setError(`Failed to delete photo: ${err.message}`);
                }
              }
            });
          }}
          onPreviewPdf={handlePreviewPdf}
          previewing={previewing}
          onExportPdf={handleExportPdf}
          onTidyLayout={handleTidyLayout}
          saving={saving}
          exporting={exporting}
          canExport={Boolean(binderId && layout && !loading)}
        />
      {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
      </div>

      {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `input` element here. The `type`, `ref`, `accept`, `multiple`, `hidden`, `onChange` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
      <input
        /* Keep native file selection available without duplicating an input in each menu. */
        type="file"
        ref={fileInputRef}
        accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif"
        multiple
        hidden
        onChange={handleFileChange}
      />

      {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `MobileMenu` React component here. The `onAddPhoto`, `onDeletePhoto`, `onTidy`, `onExportPdf`, `onPreviewPdf`, `canDelete` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
      <MobileMenu
        /* Mobile controls reuse the same handlers and confirmation rules as ActionSidebar. */
        onAddPhoto={handleAddPhotosClick}
        onDeletePhoto={() => {
          if (!selectedLayerId) return;
          const layer = currentPage.layers?.find((l) => l.id === selectedLayerId);
          if (!layer) return;

          // Match the desktop warning when the photo also has a server storage record.
          const hasStorageKey = layer?.storageKey && binderId;

          const confirmMessage = hasStorageKey
            ? 'Delete this photo from your binder? This will remove it from this page and from our storage.'
            : 'Delete this photo from this page?';

          openModal({
            kind: 'confirm',
            title: 'Delete photo',
            body: confirmMessage,
            confirmLabel: 'Delete photo',
            cancelLabel: 'Cancel',
            onConfirm: async () => {
              // Keep mobile deletion on the shared removeLayer path so persistence stays identical.
              try {
                await removeLayer(selectedLayerId);
                setSelectedLayerId(null);
              } catch (err) {
                if (isSessionExpiredError(err)) return;
                setError(`Failed to delete photo: ${err.message}`);
              }
            }
          });
        }}
        onTidy={handleTidyLayout}
        onExportPdf={handleExportPdf}
        onPreviewPdf={handlePreviewPdf}
        canDelete={!!selectedLayerId}
      />
    {/* I am keeping this line here because the surrounding App.jsx workflow expects this value or operation before it continues. */}
    </div>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this as the main value from App.jsx so the module that imports this file receives the intended entry point.
export default App;