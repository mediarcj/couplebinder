// File: binder-editor/src/Canvas.jsx
// Description: Canvas component for editing layers
// Purpose: Display and manipulate layers on a page

import React, { useState, useCallback, useRef } from 'react';
import Layer from './Layer';

function Canvas({
  page,
  layers,
  onUpdateLayer,
  onAddLayer,
  onRemoveLayer,
  onAddPhoto,
  sectionKey,
  sectionLabels,
  sectionOptions,
  onSectionChange,
  selectedLayerId,
  onSelectLayer,
  zoom = 1,
  onZoomChange,
  onZoomFit,
  canvasStageRef
}) {
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({
    offsetX: 0,
    offsetY: 0,
    canvasLeft: 0,
    canvasTop: 0,
    canvasWidth: 0,
    canvasHeight: 0
  });
  const [lastDrag, setLastDrag] = useState({
    mouseX: 0,
    mouseY: 0,
    left: 0,
    top: 0
  });

  // Reference to the DOM element of the layer being dragged.
  const dragLayerRef = useRef(null);

  const rectsOverlap = (l1, t1, w1, h1, l2, t2, w2, h2) => {
    return !(
      l1 + w1 <= l2 ||
      l1 >= l2 + w2 ||
      t1 + h1 <= t2 ||
      t1 >= t2 + h2
    );
  };

  const clamp = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
  };

  /**
   * Smoother collision logic:
   * 1) Try full move (dx, dy).
   * 2) If it collides, try horizontal only (dx, 0).
   * 3) If still collides, try vertical only (0, dy).
   * 4) If all collide, stay at previous position.
   */
  const constrainDragWithCollisions = (
    layerEl,
    proposedLeft,
    proposedTop,
    width,
    height,
    dx,
    dy,
    canvasRect,
    prevLeft,
    prevTop
  ) => {
    if (!layerEl) {
      return { left: prevLeft, top: prevTop, collided: false };
    }

    const canvas =
      layerEl.closest('.canvas-page') ||
      layerEl.closest('.canvas-stage') ||
      layerEl.closest('.binder-editor-canvas');

    if (!canvas) {
      return { left: prevLeft, top: prevTop, collided: false };
    }

    const testPosition = (left, top) => {
      // Clamp to canvas (cannot leave the board)
      const clampedLeft = clamp(left, 0, canvasRect.width - width);
      const clampedTop = clamp(top, 0, canvasRect.height - height);

      const others = canvas.querySelectorAll('.binder-editor-layer');

      for (const other of others) {
        if (other === layerEl) continue;
        const r = other.getBoundingClientRect();
        const oLeft = r.left - canvasRect.left;
        const oTop = r.top - canvasRect.top;
        const oWidth = r.width;
        const oHeight = r.height;

        if (rectsOverlap(clampedLeft, clampedTop, width, height, oLeft, oTop, oWidth, oHeight)) {
          return null; // invalid position
        }
      }

      return { left: clampedLeft, top: clampedTop };
    };

    // 1) Full move
    const full = testPosition(proposedLeft, proposedTop);
    if (full) {
      return { ...full, collided: false };
    }

    // 2) Horizontal only (slide left/right while "rubbing" vertically)
    const horiz = testPosition(proposedLeft, prevTop);
    if (horiz) {
      return { ...horiz, collided: false };
    }

    // 3) Vertical only (slide up/down while "rubbing" horizontally)
    const vert = testPosition(prevLeft, proposedTop);
    if (vert) {
      return { ...vert, collided: false };
    }

    // 4) Completely blocked: stay put
    return { left: prevLeft, top: prevTop, collided: true };
  };

  // Deselect when clicking whitespace inside the canvas (but not on a layer)
  const handleCanvasMouseDown = useCallback(
    (e) => {
      // If the click is not inside a .binder-editor-layer, clear selection
      const layerEl = e.target.closest('.binder-editor-layer');
      if (!layerEl) {
        onSelectLayer(null);
      }
    },
    [onSelectLayer]
  );

  const handleDragStart = useCallback(
    (layerId, e) => {
      onSelectLayer(layerId);
      setDragging(true);

      const layerEl = e.currentTarget;
      if (!layerEl) return;

      dragLayerRef.current = layerEl;

      const canvasEl =
        layerEl.closest('.canvas-page') ||
        layerEl.closest('.canvas-stage') ||
        layerEl.closest('.binder-editor-canvas');

      if (!canvasEl) return;

      const canvasRect = canvasEl.getBoundingClientRect();
      const layerRect = layerEl.getBoundingClientRect();

      const offsetX = e.clientX - layerRect.left;
      const offsetY = e.clientY - layerRect.top;

      setDragStart({
        offsetX,
        offsetY,
        canvasLeft: canvasRect.left,
        canvasTop: canvasRect.top,
        canvasWidth: canvasRect.width,
        canvasHeight: canvasRect.height,
        zoom: zoom
      });

      setLastDrag({
        mouseX: e.clientX,
        mouseY: e.clientY,
        left: layerRect.left - canvasRect.left,
        top: layerRect.top - canvasRect.top
      });
    },
    [onSelectLayer]
  );

  const handleDragEnd = useCallback(() => {
    setDragging(false);
    dragLayerRef.current = null;
  }, []);

  const handleDragMove = useCallback(
    (e) => {
      if (!dragging || !selectedLayerId) return;

      const {
        canvasLeft,
        canvasTop,
        canvasWidth,
        canvasHeight
      } = dragStart;

      // We keep the drag active even if the pointer leaves the canvas;
      // positions are still clamped by canvasRect, so tiles never leave.
      // Account for zoom: mouse movement needs to be divided by zoom to get canvas coordinates
      const dx = (e.clientX - lastDrag.mouseX) / dragStart.zoom;
      const dy = (e.clientY - lastDrag.mouseY) / dragStart.zoom;

      const currentLayer = layers.find((l) => l.id === selectedLayerId);
      if (!currentLayer) return;

      const layerWidth = currentLayer.width || 0;
      const layerHeight = currentLayer.height || 0;

      const proposedLeft = lastDrag.left + dx;
      const proposedTop = lastDrag.top + dy;

      const layerEl = dragLayerRef.current;
      const canvasRect = {
        left: canvasLeft,
        top: canvasTop,
        width: canvasWidth,
        height: canvasHeight
      };

      const constrained = constrainDragWithCollisions(
        layerEl,
        proposedLeft,
        proposedTop,
        layerWidth,
        layerHeight,
        dx,
        dy,
        canvasRect,
        lastDrag.left,
        lastDrag.top
      );

      onUpdateLayer(selectedLayerId, { x: constrained.left, y: constrained.top });

      // Only treat as "blocked" if there was truly no legal move.
      if (!constrained.collided) {
        setLastDrag({
          mouseX: e.clientX,
          mouseY: e.clientY,
          left: constrained.left,
          top: constrained.top
        });
      }
    },
    [dragging, selectedLayerId, dragStart, onUpdateLayer, layers, lastDrag]
  );

  return (
    <div
      className="binder-editor-canvas bg-slate-50"
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="canvas-header bg-white/90 backdrop-blur">
        <div className="canvas-header-left">
          <label className="section-select-label">
            SECTION
            <select
              className="section-select"
              value={sectionKey || ''}
              onChange={(e) => onSectionChange?.(page.pageIndex, e.target.value)}
            >
              {sectionOptions?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="canvas-header-actions flex items-center gap-3">
          {/* Modern Zoom Controls */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={onZoomFit}
              className="p-1.5 hover:bg-white rounded-md transition-all duration-200 hover:shadow-sm group"
              title="Fit to page"
            >
              <svg className="w-4 h-4 text-slate-600 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <div className="flex items-center gap-2 min-w-[140px]">
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10V7m0 3h3m-3 0H10" />
              </svg>
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
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-700 min-w-[45px] text-right tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="canvas-stage" ref={canvasStageRef}>
        <div 
          className="canvas-page shadow-lg transition-transform duration-200 ease-out"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center'
          }}
        >
          {layers.map((layer) => (
            <Layer
              key={layer.id}
              layer={layer}
              selected={selectedLayerId === layer.id}
              onSelect={() => onSelectLayer(layer.id)}
              onUpdate={onUpdateLayer}
              onRemove={onRemoveLayer}
              onDragStart={handleDragStart}
              binderId={page.binderId || null}
              zoom={zoom}
            />
          ))}

          {layers.length === 0 && (
            <div className="canvas-empty">
              <p>No layers on this page. Click "Add Photo" to start.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Canvas;