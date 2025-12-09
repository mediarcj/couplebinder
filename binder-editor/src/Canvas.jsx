// File: binder-editor/src/Canvas.jsx
// Description: Canvas component for editing layers
// Purpose: Display and manipulate layers on a page

import React, { useState, useCallback } from 'react';
import Layer from './Layer';

function Canvas({
  page,
  layers,
  onUpdateLayer,
  onAddLayer,
  onRemoveLayer,
  onAddPhoto,
  selectedLayerId,
  onSelectLayer
}) {
  const [dragging, setDragging] = useState(false);
  const [dragAxis, setDragAxis] = useState(null);
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

  // Simple overlap helper (DOM-based like legacy dashboard)
  const rectsOverlap = (l1, t1, w1, h1, l2, t2, w2, h2) => {
    return !(
      l1 + w1 <= l2 ||
      l1 >= l2 + w2 ||
      t1 + h1 <= t2 ||
      t1 >= t2 + h2
    );
  };

  // Collision-aware constraint similar to legacy dashboard.js
  const constrainDragWithCollisions = (
    layerEl,
    proposedLeft,
    proposedTop,
    width,
    height,
    dx,
    dy,
    canvasRect,
    axis
  ) => {
    let left = proposedLeft;
    let top = proposedTop;

    const canvas = layerEl.closest('.canvas-page') || layerEl.closest('.canvas-stage');
    if (!canvas) {
      return { left, top };
    }

    const others = canvas.querySelectorAll('.binder-editor-layer');
    others.forEach((other) => {
      if (other === layerEl) return;
      const r = other.getBoundingClientRect();
      const oLeft = r.left - canvasRect.left;
      const oTop = r.top - canvasRect.top;
      const oWidth = r.width;
      const oHeight = r.height;

      if (!rectsOverlap(left, top, width, height, oLeft, oTop, oWidth, oHeight)) {
        return;
      }

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const resolvedAxis = axis || (absDx >= absDy ? 'x' : 'y');

      if (resolvedAxis === 'x') {
        if (dx > 0) {
          left = Math.min(left, oLeft - width);
        } else if (dx < 0) {
          left = Math.max(left, oLeft + oWidth);
        }
      } else if (resolvedAxis === 'y') {
        if (dy > 0) {
          top = Math.min(top, oTop - height);
        } else if (dy < 0) {
          top = Math.max(top, oTop + oHeight);
        }
      }
    });

    // Clamp within canvas bounds
    left = Math.max(0, Math.min(left, canvasRect.width - width));
    top = Math.max(0, Math.min(top, canvasRect.height - height));

    return { left, top };
  };

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onSelectLayer(null);
    }
  }, [onSelectLayer]);

  // Start dragging a layer
  const handleDragStart = useCallback((layerId, e) => {
    onSelectLayer(layerId);
    setDragging(true);
    setDragAxis(null);

    const layerEl = e.currentTarget;
    if (!layerEl) return;

    // Prefer the white page as the coordinate system
    const canvasEl =
      layerEl.closest('.canvas-page') ||
      layerEl.closest('.canvas-stage') ||
      layerEl.closest('.binder-editor-canvas');

    if (!canvasEl) return;

    const canvasRect = canvasEl.getBoundingClientRect();
    const layerRect = layerEl.getBoundingClientRect();

    // How far inside the layer the pointer is
    const offsetX = e.clientX - layerRect.left;
    const offsetY = e.clientY - layerRect.top;

    setDragStart({
      offsetX,
      offsetY,
      canvasLeft: canvasRect.left,
      canvasTop: canvasRect.top,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height
    });

    setLastDrag({
      mouseX: e.clientX,
      mouseY: e.clientY,
      left: layerRect.left - canvasRect.left,
      top: layerRect.top - canvasRect.top
    });
  }, [onSelectLayer]);

// Handle drag move (pointer is over the canvas)
const handleDragMove = useCallback(
  (e) => {
    if (!dragging || !selectedLayerId) return;

    const canvas = e.currentTarget;
    if (!canvas) return;

    const {
      offsetX,
      offsetY,
      canvasLeft,
      canvasTop,
      canvasWidth,
      canvasHeight
    } = dragStart;

    const insideCanvasBounds =
      e.clientX >= canvasLeft &&
      e.clientX <= canvasLeft + canvasWidth &&
      e.clientY >= canvasTop &&
      e.clientY <= canvasTop + canvasHeight;
    if (!insideCanvasBounds) {
      handleDragEnd();
      return;
    }

    // Step-based deltas
    const dx = e.clientX - lastDrag.mouseX;
    const dy = e.clientY - lastDrag.mouseY;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!dragAxis && (absDx > 0 || absDy > 0)) {
      setDragAxis(absDx >= absDy ? 'x' : 'y');
    }

    const currentLayer = layers.find((l) => l.id === selectedLayerId);
    if (!currentLayer) return;

    const layerWidth = currentLayer.width || 0;
    const layerHeight = currentLayer.height || 0;

    let proposedLeft = lastDrag.left + dx;
    let proposedTop = lastDrag.top + dy;

    // Collision-aware constraint
    const layerEl = e.target.closest('.binder-editor-layer');
    const canvasRect = {
      left: canvasLeft,
      top: canvasTop,
      width: canvasWidth,
      height: canvasHeight
    };

    const constrained = layerEl
      ? constrainDragWithCollisions(
          layerEl,
          proposedLeft,
          proposedTop,
          layerWidth,
          layerHeight,
          dx,
          dy,
          canvasRect,
          dragAxis
        )
      : { left: proposedLeft, top: proposedTop };

    onUpdateLayer(selectedLayerId, { x: constrained.left, y: constrained.top });

    setLastDrag({
      mouseX: e.clientX,
      mouseY: e.clientY,
      left: constrained.left,
      top: constrained.top
    });
  },
  [dragging, selectedLayerId, dragStart, onUpdateLayer, layers, lastDrag, dragAxis]
);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragging(false);
    setDragAxis(null);
  }, []);

  // Add photo layer (placeholder)
  return (
    <div
      className="binder-editor-canvas bg-slate-50"
      onClick={handleCanvasClick}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="canvas-header bg-white/90 backdrop-blur">
        <h3 className="text-slate-900 font-semibold">
          Page {page.pageIndex + 1}
        </h3>
      </div>

      <div className="canvas-stage">
        <div className="canvas-page shadow-lg">
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