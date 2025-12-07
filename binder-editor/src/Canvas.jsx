// File: binder-editor/src/Canvas.jsx
// Description: Canvas component for editing layers
// Purpose: Display and manipulate layers on a page

import React, { useState, useCallback } from 'react';
import Layer from './Layer';

function Canvas({ page, layers, onUpdateLayer, onAddLayer, onRemoveLayer }) {
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({
    offsetX: 0,
    offsetY: 0,
    canvasLeft: 0,
    canvasTop: 0,
    canvasWidth: 0,
    canvasHeight: 0
  });

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      setSelectedLayer(null);
    }
  }, []);

  // Start dragging a layer
  const handleDragStart = useCallback((layerId, e) => {
    setSelectedLayer(layerId);
    setDragging(true);

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
  }, []);

// Handle drag move (pointer is over the canvas)
const handleDragMove = useCallback(
  (e) => {
    if (!dragging || !selectedLayer) return;

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

    // Raw position relative to the page
    const rawX = e.clientX - canvasLeft - offsetX;
    const rawY = e.clientY - canvasTop - offsetY;

    const currentLayer = layers.find((l) => l.id === selectedLayer);
    if (!currentLayer) return;

    const layerWidth = currentLayer.width || 0;
    const layerHeight = currentLayer.height || 0;

    // If the layer is smaller than the page, keep it fully inside.
    // If the layer is larger than the page, allow negative coords so you can pan.
    let minX;
    let maxX;
    let minY;
    let maxY;

    if (layerWidth <= canvasWidth) {
      // small or equal: keep inside 0..(canvasWidth - layerWidth)
      minX = 0;
      maxX = Math.max(0, canvasWidth - layerWidth);
    } else {
      // larger than page: allow full panning range
      minX = canvasWidth - layerWidth; // most left we can go
      maxX = 0;                        // most right we can go
    }

    if (layerHeight <= canvasHeight) {
      minY = 0;
      maxY = Math.max(0, canvasHeight - layerHeight);
    } else {
      minY = canvasHeight - layerHeight;
      maxY = 0;
    }

    // Clamp into [min, max]
    const x = Math.min(Math.max(rawX, minX), maxX);
    const y = Math.min(Math.max(rawY, minY), maxY);

    onUpdateLayer(selectedLayer, { x, y });
  },
  [dragging, selectedLayer, dragStart, onUpdateLayer, layers]
);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDragging(false);
  }, []);

  // Add photo layer (placeholder)
  const handleAddPhoto = useCallback(() => {
    const newLayer = {
      id: `layer-${Date.now()}`,
      type: 'photo',
      x: 50,
      y: 50,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: layers.length,
      photoId: null
    };
    onAddLayer(newLayer);
  }, [layers.length, onAddLayer]);

  return (
    <div
      className="binder-editor-canvas"
      onClick={handleCanvasClick}
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="canvas-header">
        <h3>Page {page.pageIndex + 1}</h3>
        <button
          type="button"
          className="btn btn-small"
          onClick={handleAddPhoto}
        >
          Add Photo
        </button>
      </div>

      <div className="canvas-stage">
        <div className="canvas-page">
          {layers.map((layer) => (
            <Layer
              key={layer.id}
              layer={layer}
              selected={selectedLayer === layer.id}
              onSelect={() => setSelectedLayer(layer.id)}
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