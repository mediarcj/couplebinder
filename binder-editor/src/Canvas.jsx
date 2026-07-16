// File: binder-editor/src/Canvas.jsx
// Description: Canvas editing surface (page + layers) with snapping + smart guide overlay
// Purpose: Display and manipulate layers on a page

import React, {
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  useState,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  useCallback,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  useRef,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  useEffect,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  useLayoutEffect,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  useMemo
// I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
} from 'react';
// I am importing `createPortal` from `react-dom` here because Canvas.jsx uses it in the steps below.
import { createPortal } from 'react-dom';
// I am importing `Layer` from `./Layer` here because Canvas.jsx uses it in the steps below.
import Layer from './Layer';
// I am importing `getPhotoFrameRectFromLayer` from `./utils/photoFrameMetrics` here because Canvas.jsx uses it in the steps below.
import { getPhotoFrameRectFromLayer, CAPTION_HEIGHT } from './utils/photoFrameMetrics';

// A4 logical size (must match your canvas-page CSS)
const PAGE_WIDTH = 794;
// I am saving `PAGE_HEIGHT` here so the nearby steps can reuse the same value without rebuilding it each time.
const PAGE_HEIGHT = 1122;

// Photo caption height (now imported from shared helper)
const CAPTION_H = CAPTION_HEIGHT;

// Snap distance in *screen* pixels; we convert to logical using current zoom.
const SNAP_SCREEN_PX = 8;

// “Magnet” easing range in *screen* pixels.
const MAGNET_SCREEN_PX = 2;

// Ease-out cubic for the “magnet” feel
function easeOutCubic(t) {
  // Clamp the input before easing so pointer math never overshoots the snap target.
  const tt = Math.max(0, Math.min(1, t));
  // This return sends the completed value or response back to the code that called this function.
  return 1 - Math.pow(1 - tt, 3);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `rectsOverlap` as a named helper so the surrounding workflow can call this step when it needs it.
function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  // Treat touching edges as non-overlap so neatly aligned photos do not show a warning.
  return !(
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    x1 + w1 <= x2 ||
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    x1 >= x2 + w2 ||
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    y1 + h1 <= y2 ||
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    y1 >= y2 + h2
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `intersectionArea` as a named helper so the surrounding workflow can call this step when it needs it.
function intersectionArea(ax, ay, aw, ah, bx, by, bw, bh) {
  // Find the shared rectangle used for both overlap and inside-page percentages.
  const x1 = Math.max(ax, bx);
  // I am saving `y1` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y1 = Math.max(ay, by);
  // I am saving `x2` here so the nearby steps can reuse the same value without rebuilding it each time.
  const x2 = Math.min(ax + aw, bx + bw);
  // I am saving `y2` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y2 = Math.min(ay + ah, by + bh);
  // I am saving `w` here so the nearby steps can reuse the same value without rebuilding it each time.
  const w = x2 - x1;
  // I am saving `h` here so the nearby steps can reuse the same value without rebuilding it each time.
  const h = y2 - y1;
  // Separated rectangles have no useful area even when the raw subtraction is negative.
  if (w <= 0 || h <= 0) return 0;
  // This return sends the completed value or response back to the code that called this function.
  return w * h;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `clamp` as a named helper so the surrounding workflow can call this step when it needs it.
function clamp(v, min, max) {
  // Keep repeated boundary calculations readable in the drag and overlay helpers below.
  return Math.min(Math.max(v, min), max);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

 /**
  * Snap rect for smart guides/snapping.
  * For photos: use ONLY the visible photo frame (exclude caption).
  */
 function getSnapRect(layer) {
   // Layer height includes its caption, but alignment should follow the visible photo edge.
   const x = typeof layer?.x === 'number' ? layer.x : 0;
   // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
   const y = typeof layer?.y === 'number' ? layer.y : 0;
   // Use helper for consistency (refactor only, same output)
   const { frameWidth, frameHeight } = getPhotoFrameRectFromLayer(layer);
   // This return sends the completed value or response back to the code that called this function.
   return { x, y, width: frameWidth, height: frameHeight };
 // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
 }

 // I am keeping `buildGuideCandidates` as a named helper so the surrounding workflow can call this step when it needs it.
 function buildGuideCandidates(allLayers, movingLayerId) {
   // Keep horizontal and vertical coordinates separate because snapAxis handles one at a time.
   const x = [];
   // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
   const y = [];

   // Page guides: left/center/right, top/middle/bottom
   x.push(0, PAGE_WIDTH / 2, PAGE_WIDTH);
   // I am calling this helper here so the current workflow performs this step before it moves on.
   y.push(0, PAGE_HEIGHT / 2, PAGE_HEIGHT);

   // Other layers’ edges + centers (photos exclude caption)
   (allLayers || []).forEach((l) => {
     // The moving layer must not snap to its own old position.
     if (!l || l.id === movingLayerId) return;

     // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
     const r = getSnapRect(l);
     // This check helps me choose or stop the next path before any work that depends on this condition runs.
     if (r.width <= 0 || r.height <= 0) return;

     // I am calling this helper here so the current workflow performs this step before it moves on.
     x.push(r.x, r.x + r.width / 2, r.x + r.width);
     // I am calling this helper here so the current workflow performs this step before it moves on.
     y.push(r.y, r.y + r.height / 2, r.y + r.height);
   // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
   });

   // This return sends the completed value or response back to the code that called this function.
   return { x, y };
 // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
 }

/**
 * Collision rect for overlap/outside prompts.
 * For photos, use ONLY the visible photo frame (exclude caption).
 */
function getCollisionRect(layer) {
  // Reuse the shared frame metric so collision warnings match guides and resize feedback.
  const x = typeof layer?.x === 'number' ? layer.x : 0;
  // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y = typeof layer?.y === 'number' ? layer.y : 0;
  // Use helper for consistency (refactor only, same output)
  const { frameWidth, frameHeight } = getPhotoFrameRectFromLayer(layer);
  // This return sends the completed value or response back to the code that called this function.
  return { x, y, width: frameWidth, height: frameHeight };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Compute how much of the PHOTO FRAME is outside the page, as 4 bands (top/left/right/bottom).
 * These values are in *layer-frame local pixels* and will drive the stripe overlay.
 */
function computePhotoOutsideBands(layer) {
  // Non-photo layers do not render the striped photo-frame overlay in Layer.
  if (!layer || layer.type !== 'photo') {
    // This return sends the completed value or response back to the code that called this function.
    return { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `x` here so the nearby steps can reuse the same value without rebuilding it each time.
  const x = typeof layer.x === 'number' ? layer.x : 0;
  // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y = typeof layer.y === 'number' ? layer.y : 0;
  // Use helper for consistency (refactor only, same output)
  const { frameWidth: w, frameHeight: frameH } = getPhotoFrameRectFromLayer(layer);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (w <= 0 || frameH <= 0) {
    // This return sends the completed value or response back to the code that called this function.
    return { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Intersection of the photo-frame rect with the page rect
  const ix1 = Math.max(x, 0);
  // I am saving `iy1` here so the nearby steps can reuse the same value without rebuilding it each time.
  const iy1 = Math.max(y, 0);
  // I am saving `ix2` here so the nearby steps can reuse the same value without rebuilding it each time.
  const ix2 = Math.min(x + w, PAGE_WIDTH);
  // I am saving `iy2` here so the nearby steps can reuse the same value without rebuilding it each time.
  const iy2 = Math.min(y + frameH, PAGE_HEIGHT);

  // I am saving `insideW` here so the nearby steps can reuse the same value without rebuilding it each time.
  const insideW = Math.max(0, ix2 - ix1);
  // I am saving `insideH` here so the nearby steps can reuse the same value without rebuilding it each time.
  const insideH = Math.max(0, iy2 - iy1);
  // Comparing visible and total frame area gives Layer a proportional warning strength.
  const insideArea = insideW * insideH;

  // I am saving `frameArea` here so the nearby steps can reuse the same value without rebuilding it each time.
  const frameArea = Math.max(1, w * frameH);
  // I am saving `outsideArea` here so the nearby steps can reuse the same value without rebuilding it each time.
  const outsideArea = Math.max(0, frameArea - insideArea);

  // I am saving `alpha` here so the nearby steps can reuse the same value without rebuilding it each time.
  const alpha = clamp(outsideArea / frameArea, 0, 1);

  // Bands in frame-local coords
  // These distances become the four CSS stripe widths around the photo frame.
  const top = Math.max(0, Math.round(iy1 - y));
  // I am saving `left` here so the nearby steps can reuse the same value without rebuilding it each time.
  const left = Math.max(0, Math.round(ix1 - x));
  // I am saving `right` here so the nearby steps can reuse the same value without rebuilding it each time.
  const right = Math.max(0, Math.round((x + w) - ix2));
  // I am saving `bottom` here so the nearby steps can reuse the same value without rebuilding it each time.
  const bottom = Math.max(0, Math.round((y + frameH) - iy2));

  // This return sends the completed value or response back to the code that called this function.
  return { top, left, right, bottom, alpha };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Snap 1 axis (x or y).
 */
function snapAxis(proposedStart, size, guides, threshold) {
  // Compare all three moving anchors against page and neighboring-layer guide positions.
  const candidates = [
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    { kind: 'start', value: proposedStart },
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    { kind: 'center', value: proposedStart + size / 2 },
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    { kind: 'end', value: proposedStart + size }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // I am saving `best` here so the nearby steps can reuse the same value without rebuilding it each time.
  let best = null;

  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const g of guides) {
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const c of candidates) {
      // Remember only the closest candidate that still falls inside the screen-scaled threshold.
      const delta = g - c.value;
      // I am saving `abs` here so the nearby steps can reuse the same value without rebuilding it each time.
      const abs = Math.abs(delta);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (abs <= threshold && (!best || abs < best.abs)) {
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        best = { abs, delta, guidePos: g, kind: c.kind };
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!best) {
    // Keep the proposed coordinate untouched when this axis has no nearby guide.
    return {
      // I am keeping the `snappedStart` field in this object so the receiving code can read that value by its expected name.
      snappedStart: proposedStart,
      // I am keeping the `guidePos` field in this object so the receiving code can read that value by its expected name.
      guidePos: null,
      // I am keeping the `delta` field in this object so the receiving code can read that value by its expected name.
      delta: 0,
      // I am keeping the `abs` field in this object so the receiving code can read that value by its expected name.
      abs: Infinity,
      // I am keeping the `kind` field in this object so the receiving code can read that value by its expected name.
      kind: null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return {
    // The caller may ease toward this exact destination before committing it on pointer-up.
    snappedStart: proposedStart + best.delta,
    // I am keeping the `guidePos` field in this object so the receiving code can read that value by its expected name.
    guidePos: best.guidePos,
    // I am keeping the `delta` field in this object so the receiving code can read that value by its expected name.
    delta: best.delta,
    // I am keeping the `abs` field in this object so the receiving code can read that value by its expected name.
    abs: best.abs,
    // I am keeping the `kind` field in this object so the receiving code can read that value by its expected name.
    kind: best.kind
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `closestEdgeX` as a named helper so the surrounding workflow can call this step when it needs it.
function closestEdgeX(left, width, guidePos) {
  // A center snap still glows the nearest visible edge so the feedback stays easy to notice.
  const l = left;
  // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
  const r = left + width;
  // This return sends the completed value or response back to the code that called this function.
  return Math.abs(guidePos - l) <= Math.abs(guidePos - r) ? 'left' : 'right';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `closestEdgeY` as a named helper so the surrounding workflow can call this step when it needs it.
function closestEdgeY(top, height, guidePos) {
  // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
  const t = top;
  // I am saving `b` here so the nearby steps can reuse the same value without rebuilding it each time.
  const b = top + height;
  // This return sends the completed value or response back to the code that called this function.
  return Math.abs(guidePos - t) <= Math.abs(guidePos - b) ? 'top' : 'bottom';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Cursor-follow badge rendered via portal to <body>,
 * so transforms/scales in the editor cannot offset it.
 */
function CursorBadge({ show, text, clientX, clientY }) {
  // Measure after rendering because overlap and outside messages can have different widths.
  const badgeRef = useRef(null);
  // I am saving `size` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [size, setSize] = useState({ w: 0, h: 0 });

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useLayoutEffect(() => {
    // Layout effect lets the portal correct its position before the browser paints again.
    if (!show) return;
    // I am saving `el` here so the nearby steps can reuse the same value without rebuilding it each time.
    const el = badgeRef.current;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!el) return;

    // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
    const r = el.getBoundingClientRect();
    // I am saving `w` here so the nearby steps can reuse the same value without rebuilding it each time.
    const w = Math.round(r.width);
    // I am saving `h` here so the nearby steps can reuse the same value without rebuilding it each time.
    const h = Math.round(r.height);

    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setSize((prev) => {
      // Avoid a measurement loop when the badge dimensions have not actually changed.
      if (prev.w === w && prev.h === h) return prev;
      // This return sends the completed value or response back to the code that called this function.
      return { w, h };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  }, [show, text]);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!show) return null;

  // I am saving `OFFSET` here so the nearby steps can reuse the same value without rebuilding it each time.
  const OFFSET = 12;
  // I am saving `PAD` here so the nearby steps can reuse the same value without rebuilding it each time.
  const PAD = 8;

  // I am saving `w` here so the nearby steps can reuse the same value without rebuilding it each time.
  const w = size.w || 180;
  // I am saving `h` here so the nearby steps can reuse the same value without rebuilding it each time.
  const h = size.h || 32;

  // Follow the pointer while clamping the badge inside the visible browser window.
  const x = clamp(clientX + OFFSET, PAD, Math.max(PAD, window.innerWidth - w - PAD));
  // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y = clamp(clientY + OFFSET, PAD, Math.max(PAD, window.innerHeight - h - PAD));

  // This return sends the completed value or response back to the code that called this function.
  return createPortal(
    // The body portal avoids inheriting the canvas scale transform.
    // I am opening the `div` element here. The `ref`, `className`, `style`, `role`, `aria-live` attributes pass the exact values this element or component uses. The confirmed `canvas-feedback-badge` class name connects this markup to matching rules in App.css. The accessibility attributes give assistive technology the label or role already chosen for this control.
    <div
      ref={badgeRef}
      className="canvas-feedback-badge"
      style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}
      role="status"
      aria-live="polite"
    >
      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      {text}
    {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
    </div>,
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    document.body
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Smart guides overlay (Figma/Canva-style dashed lines).
 * Drawn in logical page coords so it scales with the page transform.
 */
function SmartGuides({ guideX, guideY }) {
  // Null means no snap on that axis; zero is a valid guide at the page edge.
  const hasX = typeof guideX === 'number' && Number.isFinite(guideX);
  // I am saving `hasY` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hasY = typeof guideY === 'number' && Number.isFinite(guideY);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!hasX && !hasY) return null;

  // Align to half-pixel for crisp 1px strokes in most browsers.
  const x = hasX ? clamp(guideX, 0, PAGE_WIDTH) + 0.5 : null;
  // I am saving `y` here so the nearby steps can reuse the same value without rebuilding it each time.
  const y = hasY ? clamp(guideY, 0, PAGE_HEIGHT) + 0.5 : null;

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    // I am opening the `svg` element here. The `className`, `viewBox`, `preserveAspectRatio`, `aria-hidden` attributes pass the exact values this element or component uses. The confirmed `canvas-guides` class name connects this markup to matching rules in App.css. The accessibility attributes give assistive technology the label or role already chosen for this control.
    <svg
      className="canvas-guides"
      viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      {hasX && <line className="canvas-guide-line" x1={x} y1={0} x2={x} y2={PAGE_HEIGHT} />}
      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      {hasY && <line className="canvas-guide-line" x1={0} y1={y} x2={PAGE_WIDTH} y2={y} />}
    {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
    </svg>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `Canvas` as a named helper so the surrounding workflow can call this step when it needs it.
function Canvas({
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  page,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  layers,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onUpdateLayer,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onAddLayer,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onRemoveLayer,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onAddPhoto,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  sectionKey,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  sectionLabels,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  sectionOptions,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onSectionChange,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  selectedLayerId,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onSelectLayer,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  zoom = 1,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onZoomChange,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onZoomFit,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  canvasStageRef,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onToggleMobilePageList,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onAddPage,
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  onDeletePage
// I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
}) {
  // Drag and resize feedback lives here because it depends on every layer on the page,
  // while each Layer remains responsible for rendering its own controls.
  // Keep drag feedback separate from resize feedback because each gesture has its own owner.
  const [dragging, setDragging] = useState(false);

  // I am saving `dragFeedback` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [dragFeedback, setDragFeedback] = useState({
    // I am keeping the `ids` field in this object so the receiving code can read that value by its expected name.
    ids: [],
    // I am keeping the `pct` field in this object so the receiving code can read that value by its expected name.
    pct: 0,
    // I am keeping the `outside` field in this object so the receiving code can read that value by its expected name.
    outside: false,
    // I am keeping the `insidePct` field in this object so the receiving code can read that value by its expected name.
    insidePct: 100,
    // I am keeping the `clientX` field in this object so the receiving code can read that value by its expected name.
    clientX: 0,
    // I am keeping the `clientY` field in this object so the receiving code can read that value by its expected name.
    clientY: 0
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am saving `resizeFeedback` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [resizeFeedback, setResizeFeedback] = useState({
    // Layer sends this model upward while its resize handles are active.
    ids: [],
    // I am keeping the `pct` field in this object so the receiving code can read that value by its expected name.
    pct: 0,
    // I am keeping the `outside` field in this object so the receiving code can read that value by its expected name.
    outside: false,
    // I am keeping the `clientX` field in this object so the receiving code can read that value by its expected name.
    clientX: 0,
    // I am keeping the `clientY` field in this object so the receiving code can read that value by its expected name.
    clientY: 0
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // These were already in your file, but guides weren’t being drawn anywhere.
  const [activeGuides, setActiveGuides] = useState({ x: null, y: null });
  // I am saving `activeGlowEdges` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [activeGlowEdges, setActiveGlowEdges] = useState({ x: null, y: null });

  // I am saving `snapAnimatingLayerId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const [snapAnimatingLayerId, setSnapAnimatingLayerId] = useState(null);
  // The timer clears the short visual snap animation after the final position is committed.
  const snapAnimTimerRef = useRef(null);

  // Pointer moves are high-frequency. This ref holds the working drag model without
  // forcing a React render for every coordinate change.
  const dragRef = useRef({
    // I am keeping the `active` field in this object so the receiving code can read that value by its expected name.
    active: false,
    // I am keeping the `layerId` field in this object so the receiving code can read that value by its expected name.
    layerId: null,
    // I am keeping the `pageEl` field in this object so the receiving code can read that value by its expected name.
    pageEl: null,
    // I am keeping the `pageRect` field in this object so the receiving code can read that value by its expected name.
    pageRect: null,
    // I am keeping the `zoom` field in this object so the receiving code can read that value by its expected name.
    zoom: 1,
    // I am keeping the `offsetX` field in this object so the receiving code can read that value by its expected name.
    offsetX: 0,
    // I am keeping the `offsetY` field in this object so the receiving code can read that value by its expected name.
    offsetY: 0,

    // I am keeping the `w` field in this object so the receiving code can read that value by its expected name.
    w: 0,
    // I am keeping the `h` field in this object so the receiving code can read that value by its expected name.
    h: 0,

    // Snap dimensions can exclude a caption while collision dimensions follow the photo frame.
    cw: 0,
    // I am keeping the `ch` field in this object so the receiving code can read that value by its expected name.
    ch: 0,
    // I am keeping the `isPhoto` field in this object so the receiving code can read that value by its expected name.
    isPhoto: false,

    // I am keeping the `lastX` field in this object so the receiving code can read that value by its expected name.
    lastX: 0,
    // I am keeping the `lastY` field in this object so the receiving code can read that value by its expected name.
    lastY: 0,
    // I am keeping the `otherRects` field in this object so the receiving code can read that value by its expected name.
    otherRects: [],
    // Candidate guides and targets are captured at drag start, then updated during moves.
    guides: { x: [], y: [] },
    // I am keeping the `snapTargets` field in this object so the receiving code can read that value by its expected name.
    snapTargets: { x: null, y: null },
    // I am keeping the `axisLock` field in this object so the receiving code can read that value by its expected name.
    axisLock: null,

    // I am keeping the `pointerId` field in this object so the receiving code can read that value by its expected name.
    pointerId: null,
    // Pointer capture keeps a drag alive when the pointer briefly leaves the layer element.
    pointerEl: null,

    // I am keeping the `lastUi` field in this object so the receiving code can read that value by its expected name.
    lastUi: {
      // I am keeping the `guideX` field in this object so the receiving code can read that value by its expected name.
      guideX: null,
      // I am keeping the `guideY` field in this object so the receiving code can read that value by its expected name.
      guideY: null,
      // I am keeping the `glowX` field in this object so the receiving code can read that value by its expected name.
      glowX: null,
      // I am keeping the `glowY` field in this object so the receiving code can read that value by its expected name.
      glowY: null,
      // I am keeping the `feedbackSig` field in this object so the receiving code can read that value by its expected name.
      feedbackSig: null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am saving `rafRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const rafRef = useRef(0);
  // Keep only the newest browser event until the next animation frame processes it.
  const lastEventRef = useRef(null);

  // I am saving `moveHandlerRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const moveHandlerRef = useRef(null);
  // Store exact listener functions so stopDragging can remove every document/window hook.
  const upHandlerRef = useRef(null);
  // I am saving `cancelHandlerRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cancelHandlerRef = useRef(null);
  // I am saving `blurHandlerRef` here so the nearby steps can reuse the same value without rebuilding it each time.
  const blurHandlerRef = useRef(null);

  // I am saving `setGuidesIfChanged` here so the nearby steps can reuse the same value without rebuilding it each time.
  const setGuidesIfChanged = (x, y) => {
    // Skip React state work when the guide coordinates stayed the same between pointer events.
    const last = dragRef.current.lastUi;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (last.guideX === x && last.guideY === y) return;
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    dragRef.current.lastUi = { ...last, guideX: x, guideY: y };
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setActiveGuides({ x, y });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `setGlowIfChanged` here so the nearby steps can reuse the same value without rebuilding it each time.
  const setGlowIfChanged = (x, y) => {
    // Edge glow follows the same deduplication rule as the dashed guides.
    const last = dragRef.current.lastUi;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (last.glowX === x && last.glowY === y) return;
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    dragRef.current.lastUi = { ...last, glowX: x, glowY: y };
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setActiveGlowEdges({ x, y });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `setFeedbackIfChanged` here so the nearby steps can reuse the same value without rebuilding it each time.
  const setFeedbackIfChanged = (next) => {
    // I am saving `d` here so the nearby steps can reuse the same value without rebuilding it each time.
    const d = dragRef.current;
    // Build a stable signature from collision meaning while tracking pointer position separately.
    const idsSig = (next.ids || []).slice().sort().join(',');
    // I am saving `insidePctRounded` here so the nearby steps can reuse the same value without rebuilding it each time.
    const insidePctRounded = Math.round(next.insidePct || 0);
    // I am saving `sig` here so the nearby steps can reuse the same value without rebuilding it each time.
    const sig = `${idsSig}|${next.outside ? 1 : 0}|${Math.round(next.pct || 0)}|${insidePctRounded}`;

    // I am saving `coordsChanged` here so the nearby steps can reuse the same value without rebuilding it each time.
    const coordsChanged =
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      d.lastUi?.lastClientX !== next.clientX || d.lastUi?.lastClientY !== next.clientY;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (d.lastUi?.feedbackSig === sig && !coordsChanged) return;

    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    d.lastUi = {
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      ...(d.lastUi || {}),
      // I am keeping the `feedbackSig` field in this object so the receiving code can read that value by its expected name.
      feedbackSig: sig,
      // I am keeping the `lastClientX` field in this object so the receiving code can read that value by its expected name.
      lastClientX: next.clientX,
      // I am keeping the `lastClientY` field in this object so the receiving code can read that value by its expected name.
      lastClientY: next.clientY
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setDragFeedback(next);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `handleResizeFeedback` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleResizeFeedback = useCallback((feedback) => {
    // Layer calculates resize geometry; Canvas only stores it for the shared cursor badge.
    setResizeFeedback(feedback);
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `clearUi` here so the nearby steps can reuse the same value without rebuilding it each time.
  const clearUi = () => {
    // Reset every transient visual together so a completed gesture leaves no stale warning.
    dragRef.current.lastUi = {
      // I am keeping the `guideX` field in this object so the receiving code can read that value by its expected name.
      guideX: null,
      // I am keeping the `guideY` field in this object so the receiving code can read that value by its expected name.
      guideY: null,
      // I am keeping the `glowX` field in this object so the receiving code can read that value by its expected name.
      glowX: null,
      // I am keeping the `glowY` field in this object so the receiving code can read that value by its expected name.
      glowY: null,
      // I am keeping the `feedbackSig` field in this object so the receiving code can read that value by its expected name.
      feedbackSig: null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setActiveGuides({ x: null, y: null });
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setActiveGlowEdges({ x: null, y: null });
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setDragFeedback({ ids: [], pct: 0, outside: false, insidePct: 100, clientX: 0, clientY: 0 });
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setResizeFeedback({ ids: [], pct: 0, outside: false, clientX: 0, clientY: 0 });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `stopDragging` here so the nearby steps can reuse the same value without rebuilding it each time.
  const stopDragging = useCallback(() => {
    // One cleanup path handles drops, cancellation, unmounts, and window blur so a missed
    // pointer-up cannot leave document listeners or text selection locked.
    if (rafRef.current) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      cancelAnimationFrame(rafRef.current);
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      rafRef.current = 0;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    lastEventRef.current = null;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (moveHandlerRef.current) {
      // Remove both pointer and mouse fallbacks with the same function used at registration.
      document.removeEventListener('pointermove', moveHandlerRef.current);
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('mousemove', moveHandlerRef.current);
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      moveHandlerRef.current = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (upHandlerRef.current) {
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('pointerup', upHandlerRef.current);
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('mouseup', upHandlerRef.current);
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      upHandlerRef.current = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (cancelHandlerRef.current) {
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('pointercancel', cancelHandlerRef.current);
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      cancelHandlerRef.current = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (blurHandlerRef.current) {
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      window.removeEventListener('blur', blurHandlerRef.current);
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      blurHandlerRef.current = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `d` here so the nearby steps can reuse the same value without rebuilding it each time.
      const d = dragRef.current;
      // Capture may already be released by the browser, so cleanup stays best-effort.
      if (d.pointerEl && d.pointerId != null) {
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        d.pointerEl.releasePointerCapture?.(d.pointerId);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {}

    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      document.body.style.userSelect = '';
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {}

    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    dragRef.current.active = false;
    // Clear the working model before updating React feedback to prevent a late frame from acting.
    dragRef.current.layerId = null;
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    dragRef.current.axisLock = null;
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    dragRef.current.pointerId = null;
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    dragRef.current.pointerEl = null;
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    dragRef.current.snapTargets = { x: null, y: null };

    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setDragging(false);
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearUi();
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `processMove` here so the nearby steps can reuse the same value without rebuilding it each time.
  const processMove = useCallback(() => {
    // Work at most once per animation frame, then calculate snapping and collision
    // feedback in logical page coordinates rather than browser-scaled coordinates.
    rafRef.current = 0;

    // I am saving `ev` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ev = lastEventRef.current;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!ev) return;

    // I am saving `d` here so the nearby steps can reuse the same value without rebuilding it each time.
    const d = dragRef.current;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!d.active || !d.layerId || !d.pageRect) return;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (ev.pointerId != null && d.pointerId != null && ev.pointerId !== d.pointerId) {
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `zoomAtStart` here so the nearby steps can reuse the same value without rebuilding it each time.
    const zoomAtStart = d.zoom || 1;

    // Convert the pointer from screen pixels back into the fixed A4 coordinate system.
    const px = (ev.clientX - d.pageRect.left) / zoomAtStart;
    // I am saving `py` here so the nearby steps can reuse the same value without rebuilding it each time.
    const py = (ev.clientY - d.pageRect.top) / zoomAtStart;

    // I am saving `desiredLeftRaw` here so the nearby steps can reuse the same value without rebuilding it each time.
    const desiredLeftRaw = px - d.offsetX;
    // I am saving `desiredTopRaw` here so the nearby steps can reuse the same value without rebuilding it each time.
    const desiredTopRaw = py - d.offsetY;

    // I am saving `dx` here so the nearby steps can reuse the same value without rebuilding it each time.
    const dx = desiredLeftRaw - d.lastX;
    // I am saving `dy` here so the nearby steps can reuse the same value without rebuilding it each time.
    const dy = desiredTopRaw - d.lastY;

    // I am saving `proposedLeft` here so the nearby steps can reuse the same value without rebuilding it each time.
    let proposedLeft = desiredLeftRaw;
    // I am saving `proposedTop` here so the nearby steps can reuse the same value without rebuilding it each time.
    let proposedTop = desiredTopRaw;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (ev.shiftKey) {
      // Choose an axis once per Shift gesture so small hand movements do not flip direction.
      if (!d.axisLock) {
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        d.axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (d.axisLock === 'x') proposedTop = d.lastY;
      // This alternative runs only when the condition above did not use its first path.
      else proposedLeft = d.lastX;
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      d.axisLock = null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `snappingEnabled` here so the nearby steps can reuse the same value without rebuilding it each time.
    const snappingEnabled = !ev.altKey;

    // Screen-pixel constants feel consistent even when the page is zoomed in or out.
    const threshold = SNAP_SCREEN_PX / zoomAtStart;
    // I am saving `magnetRange` here so the nearby steps can reuse the same value without rebuilding it each time.
    const magnetRange = MAGNET_SCREEN_PX / zoomAtStart;

    // I am saving `guideX` here so the nearby steps can reuse the same value without rebuilding it each time.
    let guideX = null;
    // I am saving `guideY` here so the nearby steps can reuse the same value without rebuilding it each time.
    let guideY = null;
    // I am saving `glowXEdge` here so the nearby steps can reuse the same value without rebuilding it each time.
    let glowXEdge = null;
    // I am saving `glowYEdge` here so the nearby steps can reuse the same value without rebuilding it each time.
    let glowYEdge = null;

    // I am saving `xTarget` here so the nearby steps can reuse the same value without rebuilding it each time.
    let xTarget = null;
    // I am saving `yTarget` here so the nearby steps can reuse the same value without rebuilding it each time.
    let yTarget = null;

    // I am saving `snappedLeft` here so the nearby steps can reuse the same value without rebuilding it each time.
    let snappedLeft = proposedLeft;
    // I am saving `snappedTop` here so the nearby steps can reuse the same value without rebuilding it each time.
    let snappedTop = proposedTop;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (snappingEnabled) {
      // snapping is based on SNAP rect (photos exclude caption)
      // Keep full-layer fallbacks for any older layer type without explicit snap dimensions.
      const sw = typeof d.snapW === 'number' ? d.snapW : d.w;
      // I am saving `sh` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sh = typeof d.snapH === 'number' ? d.snapH : d.h;

      // I am saving `sx` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sx = snapAxis(proposedLeft, sw, d.guides.x || [], threshold);
      // I am saving `sy` here so the nearby steps can reuse the same value without rebuilding it each time.
      const sy = snapAxis(proposedTop, sh, d.guides.y || [], threshold);

      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      guideX = sx.guidePos;
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      guideY = sy.guidePos;

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (sx.guidePos !== null) {
        // Pick the edge Layer should highlight for the horizontal snap feedback.
        if (sx.kind === 'start') glowXEdge = 'left';
        // I am checking this next possibility only because the earlier condition did not choose its path.
        else if (sx.kind === 'end') glowXEdge = 'right';
        // This alternative runs only when the condition above did not use its first path.
        else glowXEdge = closestEdgeX(proposedLeft, sw, sx.guidePos);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (sy.guidePos !== null) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (sy.kind === 'start') glowYEdge = 'top';
        // I am checking this next possibility only because the earlier condition did not choose its path.
        else if (sy.kind === 'end') glowYEdge = 'bottom';
        // This alternative runs only when the condition above did not use its first path.
        else glowYEdge = closestEdgeY(proposedTop, sh, sy.guidePos);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `nextLeft` here so the nearby steps can reuse the same value without rebuilding it each time.
      let nextLeft = sx.snappedStart;
      // I am saving `nextTop` here so the nearby steps can reuse the same value without rebuilding it each time.
      let nextTop = sy.snappedStart;

      // Very close positions ease into the guide; positions elsewhere in the threshold snap directly.
      if (sx.guidePos !== null && sx.abs <= magnetRange && magnetRange > 0) {
        // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
        const t = 1 - sx.abs / magnetRange;
        // I am saving `eased` here so the nearby steps can reuse the same value without rebuilding it each time.
        const eased = easeOutCubic(t);
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        nextLeft = proposedLeft + sx.delta * eased;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (sy.guidePos !== null && sy.abs <= magnetRange && magnetRange > 0) {
        // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
        const t = 1 - sy.abs / magnetRange;
        // I am saving `eased` here so the nearby steps can reuse the same value without rebuilding it each time.
        const eased = easeOutCubic(t);
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        nextTop = proposedTop + sy.delta * eased;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      snappedLeft = nextLeft;
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      snappedTop = nextTop;

      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      xTarget = sx.guidePos !== null ? sx.snappedStart : null;
      // Save exact targets so pointer-up can finish the snap after the eased preview.
      yTarget = sy.guidePos !== null ? sy.snappedStart : null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `finalX` here so the nearby steps can reuse the same value without rebuilding it each time.
    const finalX = snappedLeft;
    // I am saving `finalY` here so the nearby steps can reuse the same value without rebuilding it each time.
    const finalY = snappedTop;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (snappingEnabled) {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setGuidesIfChanged(guideX, guideY);
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setGlowIfChanged(glowXEdge, glowYEdge);
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      d.snapTargets = { x: xTarget, y: yTarget };
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setGuidesIfChanged(null, null);
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      setGlowIfChanged(null, null);
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      d.snapTargets = { x: null, y: null };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // ===== Prompts are based on COLLISION RECT (photos exclude caption) =====
    const cw = d.cw;
    // I am saving `ch` here so the nearby steps can reuse the same value without rebuilding it each time.
    const ch = d.ch;

    // I am saving `outside` here so the nearby steps can reuse the same value without rebuilding it each time.
    const outside =
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      finalX < 0 ||
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      finalY < 0 ||
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      finalX + cw > PAGE_WIDTH ||
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      finalY + ch > PAGE_HEIGHT;

    // I am saving `movingArea` here so the nearby steps can reuse the same value without rebuilding it each time.
    const movingArea = Math.max(1, cw * ch);
    // Inside percentage distinguishes a partly clipped frame from one fully outside the page.
    const insideArea = intersectionArea(finalX, finalY, cw, ch, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    // I am saving `insidePct` here so the nearby steps can reuse the same value without rebuilding it each time.
    const insidePct = (insideArea / movingArea) * 100;

    // I am saving `ids` here so the nearby steps can reuse the same value without rebuilding it each time.
    let ids = [];
    // I am saving `maxPct` here so the nearby steps can reuse the same value without rebuilding it each time.
    let maxPct = 0;

    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (const r of d.otherRects || []) {
      // Collect every collision for styling, while the badge reports only the largest percentage.
      if (!r) continue;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (rectsOverlap(finalX, finalY, cw, ch, r.x, r.y, r.width, r.height)) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        ids.push(r.id);
        // I am saving `a` here so the nearby steps can reuse the same value without rebuilding it each time.
        const a = intersectionArea(finalX, finalY, cw, ch, r.x, r.y, r.width, r.height);
        // I am saving `pct` here so the nearby steps can reuse the same value without rebuilding it each time.
        const pct = (a / movingArea) * 100;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (pct > maxPct) maxPct = pct;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setFeedbackIfChanged({
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      ids,
      // I am keeping the `pct` field in this object so the receiving code can read that value by its expected name.
      pct: maxPct,
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      outside,
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      insidePct,
      // I am keeping the `clientX` field in this object so the receiving code can read that value by its expected name.
      clientX: ev.clientX,
      // I am keeping the `clientY` field in this object so the receiving code can read that value by its expected name.
      clientY: ev.clientY
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `changed` here so the nearby steps can reuse the same value without rebuilding it each time.
    const changed =
      // I am calling this helper here so the current workflow performs this step before it moves on.
      Math.abs(finalX - d.lastX) > 0.01 || Math.abs(finalY - d.lastY) > 0.01;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (changed) {
      // App.updateLayer receives logical coordinates and marks the layout dirty for autosave.
      d.lastX = finalX;
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      d.lastY = finalY;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      onUpdateLayer(d.layerId, { x: finalX, y: finalY });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  }, [onUpdateLayer]);

  // I am saving `scheduleMove` here so the nearby steps can reuse the same value without rebuilding it each time.
  const scheduleMove = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (ev) => {
      // Replace older pending events, then request at most one calculation for this frame.
      lastEventRef.current = ev;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (rafRef.current) return;
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      rafRef.current = requestAnimationFrame(processMove);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    [processMove]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `handleCanvasMouseDown` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleCanvasMouseDown = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (e) => {
      // Clicking page space clears App's selection, while Layer clicks stop on their own element.
      const layerEl = e.target.closest('.binder-editor-layer');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!layerEl) onSelectLayer(null);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    [onSelectLayer]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `handleDragStart` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleDragStart = useCallback(
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    (layerId, e) => {
      // Capture geometry and guide candidates once. The move loop can compare against a
      // stable view of the other layers instead of measuring the DOM on every event.
      onSelectLayer(layerId);

      // I am saving `layer` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layer = (layers || []).find((l) => l && l.id === layerId);
      // A stale DOM event should stop if App has already removed the matching layer.
      if (!layer) return;

      // I am saving `layerEl` here so the nearby steps can reuse the same value without rebuilding it each time.
      const layerEl = e?.currentTarget;
      // I am saving `pageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pageEl = layerEl?.closest('.canvas-page');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!pageEl) return;

      // I am saving `pageRect` here so the nearby steps can reuse the same value without rebuilding it each time.
      const pageRect = pageEl.getBoundingClientRect();
      // Freeze zoom and page bounds so one drag uses a consistent coordinate conversion.
      const zoomAtStart = zoom || 1;
 
      // I am saving `w` here so the nearby steps can reuse the same value without rebuilding it each time.
      const w = typeof layer.width === 'number' ? layer.width : 0;
      // I am saving `h` here so the nearby steps can reuse the same value without rebuilding it each time.
      const h = typeof layer.height === 'number' ? layer.height : 0;
       // Smart guides/snapping should ignore photo captions
      const snapRect = getSnapRect(layer);
      // I am saving `snapW` here so the nearby steps can reuse the same value without rebuilding it each time.
      const snapW = snapRect.width;
      // I am saving `snapH` here so the nearby steps can reuse the same value without rebuilding it each time.
      const snapH = snapRect.height;
      // I am saving `lx` here so the nearby steps can reuse the same value without rebuilding it each time.
      const lx = typeof layer.x === 'number' ? layer.x : 0;
      // I am saving `ly` here so the nearby steps can reuse the same value without rebuilding it each time.
      const ly = typeof layer.y === 'number' ? layer.y : 0;

      // I am saving `col` here so the nearby steps can reuse the same value without rebuilding it each time.
      const col = getCollisionRect(layer);
      // I am saving `cw` here so the nearby steps can reuse the same value without rebuilding it each time.
      const cw = col.width;
      // I am saving `ch` here so the nearby steps can reuse the same value without rebuilding it each time.
      const ch = col.height;

      // I am saving `px` here so the nearby steps can reuse the same value without rebuilding it each time.
      const px = (e.clientX - pageRect.left) / zoomAtStart;
      // I am saving `py` here so the nearby steps can reuse the same value without rebuilding it each time.
      const py = (e.clientY - pageRect.top) / zoomAtStart;
      // Preserve the exact grab point so the layer does not jump under the pointer.
      const offsetX = px - lx;
      // I am saving `offsetY` here so the nearby steps can reuse the same value without rebuilding it each time.
      const offsetY = py - ly;

      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      dragRef.current = {
        // Replace gesture-specific values while retaining the stable ref object shape.
        ...dragRef.current,
        // I am keeping the `active` field in this object so the receiving code can read that value by its expected name.
        active: true,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        layerId,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        pageEl,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        pageRect,
        // I am keeping the `zoom` field in this object so the receiving code can read that value by its expected name.
        zoom: zoomAtStart,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        offsetX,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        offsetY,

        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        w,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        h,        

        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        snapW,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        snapH,

        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        cw,
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        ch,

        // I am keeping the `lastX` field in this object so the receiving code can read that value by its expected name.
        lastX: lx,
        // I am keeping the `lastY` field in this object so the receiving code can read that value by its expected name.
        lastY: ly,
        // I am keeping the `otherRects` field in this object so the receiving code can read that value by its expected name.
        otherRects: (layers || [])
          // Store only other visible collision boxes for the animation-frame loop.
          .filter((l) => l && l.id !== layerId)
          // I am mapping the collection here so each input item becomes the output shape expected by the next step.
          .map((l) => {
            // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
            const r = getCollisionRect(l);
            // This return sends the completed value or response back to the code that called this function.
            return { id: l.id, x: r.x, y: r.y, width: r.width, height: r.height };
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          })
          // I am filtering the collection here so only items that pass the nearby check continue to the next step.
          .filter((r) => r.width > 0 && r.height > 0),
        // I am keeping the `guides` field in this object so the receiving code can read that value by its expected name.
        guides: buildGuideCandidates(layers || [], layerId),
        // I am keeping the `snapTargets` field in this object so the receiving code can read that value by its expected name.
        snapTargets: { x: null, y: null },
        // I am keeping the `axisLock` field in this object so the receiving code can read that value by its expected name.
        axisLock: null,

        // I am keeping the `pointerId` field in this object so the receiving code can read that value by its expected name.
        pointerId: e.pointerId != null ? e.pointerId : null,
        // I am keeping the `pointerEl` field in this object so the receiving code can read that value by its expected name.
        pointerEl: layerEl || null,

        // I am keeping the `lastUi` field in this object so the receiving code can read that value by its expected name.
        lastUi: { guideX: null, guideY: null, glowX: null, glowY: null, feedbackSig: null }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearUi();
      // Lock text selection after the drag model is ready so normal clicks can still select text.
      setDragging(true);

      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        document.body.style.userSelect = 'none';
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {}

      // I am saving `onMove` here so the nearby steps can reuse the same value without rebuilding it each time.
      const onMove = (ev) => scheduleMove(ev);

      // I am saving `onUp` here so the nearby steps can reuse the same value without rebuilding it each time.
      const onUp = (ev) => {
        // 1. Ignore another pointer, then finish any exact snap destination.
        // 2. Clamp the full layer (including caption), commit a final update, and clean up.
        const d = dragRef.current;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (ev?.pointerId != null && d.pointerId != null && ev.pointerId !== d.pointerId) {
          // This return sends the completed value or response back to the code that called this function.
          return;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am saving `nextX` here so the nearby steps can reuse the same value without rebuilding it each time.
        let nextX = d.lastX;
        // I am saving `nextY` here so the nearby steps can reuse the same value without rebuilding it each time.
        let nextY = d.lastY;

        // I am saving `targetX` here so the nearby steps can reuse the same value without rebuilding it each time.
        const targetX = d.snapTargets?.x;
        // I am saving `targetY` here so the nearby steps can reuse the same value without rebuilding it each time.
        const targetY = d.snapTargets?.y;

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (targetX !== null) nextX = targetX;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (targetY !== null) nextY = targetY;

        // Clamp final position based on FULL layer size (keeps caption inside page)
        nextX = clamp(nextX, 0, PAGE_WIDTH - d.w);
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        nextY = clamp(nextY, 0, PAGE_HEIGHT - d.h);

        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (d.active && d.layerId) {
          // Restart the short snap animation when another drop happens quickly.
          if (snapAnimTimerRef.current) {
            // I am updating or clearing this saved state here so the interface reflects the result of the action above.
            clearTimeout(snapAnimTimerRef.current);
            // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
            snapAnimTimerRef.current = null;
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
          // I am updating or clearing this saved state here so the interface reflects the result of the action above.
          setSnapAnimatingLayerId(d.layerId);
          // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
          snapAnimTimerRef.current = setTimeout(() => setSnapAnimatingLayerId(null), 220);

          // This check helps me choose or stop the next path before any work that depends on this condition runs.
          if (Math.abs(nextX - d.lastX) > 0.01 || Math.abs(nextY - d.lastY) > 0.01) {
            // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
            d.lastX = nextX;
            // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
            d.lastY = nextY;
            // I am calling this helper here so the current workflow performs this step before it moves on.
            onUpdateLayer(d.layerId, { x: nextX, y: nextY });
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // I am calling this helper here so the current workflow performs this step before it moves on.
        stopDragging();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };

      // I am saving `onCancel` here so the nearby steps can reuse the same value without rebuilding it each time.
      const onCancel = () => stopDragging();
      // I am saving `onBlur` here so the nearby steps can reuse the same value without rebuilding it each time.
      const onBlur = () => stopDragging();

      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      moveHandlerRef.current = onMove;
      // Refs connect these local closures to the shared stopDragging cleanup function.
      upHandlerRef.current = onUp;
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      cancelHandlerRef.current = onCancel;
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      blurHandlerRef.current = onBlur;

      // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
      document.addEventListener('pointermove', onMove);
      // Document listeners keep the gesture responsive outside the original layer bounds.
      document.addEventListener('pointerup', onUp);
      // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
      document.addEventListener('pointercancel', onCancel);

      // Compatibility fallback
      document.addEventListener('mousemove', onMove);
      // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
      document.addEventListener('mouseup', onUp);

      // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
      window.addEventListener('blur', onBlur);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    [layers, onSelectLayer, onUpdateLayer, scheduleMove, stopDragging, zoom]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Unmount uses the same drag cleanup and also retires a pending snap-animation timer.
    return () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      stopDragging();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (snapAnimTimerRef.current) {
        // I am updating or clearing this saved state here so the interface reflects the result of the action above.
        clearTimeout(snapAnimTimerRef.current);
        // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
        snapAnimTimerRef.current = null;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  }, [stopDragging]);

  // ---- Cursor badge: choose drag feedback first, else resize feedback ----
  const badgeModel = useMemo(() => {
    // Drag owns the badge while active; resize becomes the fallback when no drag warning shows.
    const showDrag =
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      dragging && (dragFeedback.outside || (dragFeedback.ids?.length || 0) > 0);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (showDrag) {
      // Outside-page feedback is more important than overlap when both are true.
      return {
        // I am keeping the `show` field in this object so the receiving code can read that value by its expected name.
        show: true,
        // I am keeping the `text` field in this object so the receiving code can read that value by its expected name.
        text: dragFeedback.outside
          // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
          ? 'Outside page'
          // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
          : `Overlap: ${Math.max(1, Math.round(dragFeedback.pct || 0))}%`,
        // I am keeping the `clientX` field in this object so the receiving code can read that value by its expected name.
        clientX: dragFeedback.clientX || 0,
        // I am keeping the `clientY` field in this object so the receiving code can read that value by its expected name.
        clientY: dragFeedback.clientY || 0
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `showResize` here so the nearby steps can reuse the same value without rebuilding it each time.
    const showResize =
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      (resizeFeedback.outside || (resizeFeedback.ids?.length || 0) > 0) &&
      // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
      (resizeFeedback.clientX || resizeFeedback.clientY);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (showResize) {
      // Resize feedback already carries the latest pointer coordinates from Layer.
      return {
        // I am keeping the `show` field in this object so the receiving code can read that value by its expected name.
        show: true,
        // I am keeping the `text` field in this object so the receiving code can read that value by its expected name.
        text: resizeFeedback.outside
          // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
          ? 'Outside page'
          // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
          : `Overlap: ${Math.max(1, Math.round(resizeFeedback.pct || 0))}%`,
        // I am keeping the `clientX` field in this object so the receiving code can read that value by its expected name.
        clientX: resizeFeedback.clientX || 0,
        // I am keeping the `clientY` field in this object so the receiving code can read that value by its expected name.
        clientY: resizeFeedback.clientY || 0
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return { show: false, text: '', clientX: 0, clientY: 0 };
  // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
  }, [dragging, dragFeedback, resizeFeedback]);

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
    // I am opening the `div` element here. The `className`, `onMouseDown`, `onContextMenu` attributes pass the exact values this element or component uses. The confirmed `binder-editor-canvas` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here.
    <div
      className="binder-editor-canvas bg-slate-50"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `CursorBadge` React component here. The `show`, `text`, `clientX`, `clientY` attributes pass the exact values this element or component uses. */}
      <CursorBadge
        /* This portal receives one normalized model regardless of the active gesture type. */
        show={badgeModel.show}
        text={badgeModel.text}
        clientX={badgeModel.clientX}
        clientY={badgeModel.clientY}
      />

      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `canvas-header` class name connects this markup to matching rules in App.css. */}
      <div className="canvas-header bg-white/90 backdrop-blur">
        {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `canvas-header-left` class name connects this markup to matching rules in App.css. */}
        <div className="canvas-header-left">
          {/* App handles this selection and persists the sections.js key on the current page. */}
          {/* I am opening the `label` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `section-select-label` class name connects this markup to matching rules in App.css. */}
          <label className="section-select-label">
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            SECTION
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `select` element here. The `className`, `value`, `onChange` attributes pass the exact values this element or component uses. The confirmed `section-select` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
            <select
              className="section-select"
              value={sectionKey || ''}
              onChange={(e) => onSectionChange?.(page.pageIndex, e.target.value)}
            >
              {/* I am mapping the collection here so each input item becomes the output shape expected by the next step. */}
              {sectionOptions?.map((opt) => (
                // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
                // I am opening the `option` element here. The `key`, `value` attributes pass the exact values this element or component uses.
                <option key={opt.value} value={opt.value}>
                  {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
                  {opt.label}
                {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
                </option>
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              ))}
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            </select>
          {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
          </label>
        {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
        </div>

        {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `canvas-header-actions` class name connects this markup to matching rules in App.css. */}
        <div className="canvas-header-actions flex items-center gap-3">
          {/* Mobile opens PageList as an overlay; desktop keeps its add/delete controls here. */}
          {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `aria-label`, `title` attributes pass the exact values this element or component uses. The confirmed `mobile-pages-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
          <button
            type="button"
            className="mobile-pages-btn"
            onClick={onToggleMobilePageList}
            aria-label="Show pages"
            title="Show pages"
          >
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            </svg>
          {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
          </button>

          {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `desktop-page-controls` class name connects this markup to matching rules in App.css. */}
          <div className="desktop-page-controls">
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `aria-label`, `title` attributes pass the exact values this element or component uses. The confirmed `page-control-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
            <button
              type="button"
              className="page-control-btn page-control-add"
              onClick={onAddPage}
              aria-label="Add page"
              title="Add page"
            >
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              </svg>
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            </button>
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            {onDeletePage && (
              // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
              // I am opening the `button` element here. The `type`, `className`, `onClick`, `aria-label`, `title` attributes pass the exact values this element or component uses. The confirmed `page-control-btn`, `page-control-delete` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control.
              <button
                type="button"
                className="page-control-btn page-control-delete"
                onClick={() => onDeletePage(page.pageIndex)}
                aria-label="Delete page"
                title="Delete page"
              >
                {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
                  {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
                </svg>
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              </button>
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            )}
          {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
          </div>

          {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200 shadow-sm">
            {/* Fit delegates measurement to App, while the range sends a bounded manual zoom. */}
            {/* I am opening the `button` element here. The `type`, `onClick`, `className`, `title` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
            <button
              type="button"
              onClick={onZoomFit}
              className="p-1.5 hover:bg-white rounded-md transition-all duration-200 hover:shadow-sm group"
              title="Fit to page"
            >
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
              <svg
                className="w-4 h-4 text-slate-600 group-hover:text-blue-600 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              </svg>
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            </button>

            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. */}
            <div className="flex items-center gap-2 min-w-[140px]">
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `input` element here. The `type`, `min`, `max`, `step`, `value`, `onChange`, `className`, `title` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.05"
                value={zoom}
                onChange={(e) => onZoomChange?.(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700 transition-all"
                title={`Zoom: ${Math.round(zoom * 100)}%`}
              />
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            </div>

            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. */}
            <span className="text-sm font-medium text-slate-700 min-w-[45px] text-right tabular-nums">
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              {Math.round(zoom * 100)}%
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            </span>
          {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
          </div>
        {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
        </div>
      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      </div>

      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className`, `ref` attributes pass the exact values this element or component uses. The confirmed `canvas-stage` class name connects this markup to matching rules in App.css. */}
      <div className="canvas-stage" ref={canvasStageRef}>
        {/* Layers stay in logical page coordinates; only this page wrapper receives the zoom scale. */}
        {/* I am opening the `div` element here. The `className`, `style` attributes pass the exact values this element or component uses. The confirmed `canvas-page` class name connects this markup to matching rules in App.css. */}
        <div
          className="canvas-page shadow-lg"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            transition: 'transform 0.2s ease-out'
          }}
        >
          {/* ✅ Smart guides (dashed alignment lines) */}
          {/* I am opening the `SmartGuides` React component here. The `guideX`, `guideY` attributes pass the exact values this element or component uses. */}
          <SmartGuides guideX={activeGuides.x} guideY={activeGuides.y} />

          {/* I am mapping the collection here so each input item becomes the output shape expected by the next step. */}
          {layers.map((layer) => {
            // Build gesture-specific presentation props without changing the saved layer object.
            const isDraggingLayer = dragging && dragRef.current.layerId === layer.id;
            // I am saving `isSnapAnimating` here so the nearby steps can reuse the same value without rebuilding it each time.
            const isSnapAnimating = snapAnimatingLayerId === layer.id;

            // I am saving `dragInsidePct` here so the nearby steps can reuse the same value without rebuilding it each time.
            const dragInsidePct = isDraggingLayer ? (dragFeedback.insidePct ?? 100) : null;
            // I am saving `isFullyOutside` here so the nearby steps can reuse the same value without rebuilding it each time.
            const isFullyOutside =
              // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
              isDraggingLayer && (dragInsidePct != null ? dragInsidePct <= 0.1 : false);

            // I am saving `isPartiallyOutside` here so the nearby steps can reuse the same value without rebuilding it each time.
            const isPartiallyOutside =
              // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
              isDraggingLayer && (dragInsidePct != null ? dragInsidePct < 99.9 : false);

            // I am saving `outsideBands` here so the nearby steps can reuse the same value without rebuilding it each time.
            const outsideBands =
              // Only the actively dragged photo needs the four striped outside-page bands.
              isDraggingLayer && layer?.type === 'photo'
                // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
                ? computePhotoOutsideBands(layer)
                // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
                : { top: 0, left: 0, right: 0, bottom: 0, alpha: 0 };

            // This return sends the completed value or response back to the code that called this function.
            return (
              // I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues.
              // I am opening the `Layer` React component here. The `key`, `layer`, `selected`, `onSelect`, `onUpdate`, `onRemove`, `onDragStart`, `onResizeFeedback`, `binderId`, `zoom`, `snapGlowX`, `snapGlowY`, `isDragging`, `isOverlapping`, `isOutside`, `isOverlapped`, `snapAnimating`, `isFullyOutside`, `insidePct`, `outsideBands` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here.
              <Layer
                /* Layer renders controls and reports updates; Canvas supplies page-wide feedback. */
                key={layer.id}
                layer={layer}
                selected={selectedLayerId === layer.id}
                onSelect={() => onSelectLayer(layer.id)}
                onUpdate={onUpdateLayer}
                onRemove={onRemoveLayer}
                onDragStart={handleDragStart}
                onResizeFeedback={handleResizeFeedback}
                binderId={page.binderId || null}
                zoom={zoom}
                // ✅ Edge glow now matches the snap guide (modern feel)
                snapGlowX={isDraggingLayer ? activeGlowEdges.x : null}
                snapGlowY={isDraggingLayer ? activeGlowEdges.y : null}
                isDragging={isDraggingLayer}
                isOverlapping={false}
                isOutside={isPartiallyOutside}
                isOverlapped={false}
                snapAnimating={isSnapAnimating}
                isFullyOutside={isFullyOutside}
                insidePct={isDraggingLayer ? (dragInsidePct ?? 100) : 100}
                outsideBands={outsideBands}
              />
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            );
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          })}

          {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
          {layers.length === 0 && (
            // Keep the empty page understandable before the first upload creates a layer.
            // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `canvas-empty` class name connects this markup to matching rules in App.css.
            <div className="canvas-empty">
              {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `p` element here. It does not need any attributes at this point. */}
              <p>No layers on this page. Click "Add Photo" to start.</p>
            {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
            </div>
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          )}
        {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
        </div>
      {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
      </div>
    {/* I am keeping this line here because the surrounding Canvas.jsx workflow expects this value or operation before it continues. */}
    </div>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this as the main value from Canvas.jsx so the module that imports this file receives the intended entry point.
export default Canvas;