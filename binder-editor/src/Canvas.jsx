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
    canvasTop: 0
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

    // Find the canvas element (we use the stage div so coordinates are tighter)
    const canvasEl =
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
      canvasTop: canvasRect.top
    });
  }, []);

  // Handle drag move (pointer is over the canvas)
  const handleDragMove = useCallback(
    (e) => {
      if (!dragging || !selectedLayer) return;

      const canvas = e.currentTarget;
      if (!canvas) return;

      // We use the stored canvasLeft/canvasTop instead of reading again
      const { offsetX, offsetY, canvasLeft, canvasTop } = dragStart;

      const x = e.clientX - canvasLeft - offsetX;
      const y = e.clientY - canvasTop - offsetY;

      onUpdateLayer(selectedLayer, {
        x: Math.max(0, x),
        y: Math.max(0, y)
      });
    },
    [dragging, selectedLayer, dragStart, onUpdateLayer]
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
  );
}

export default Canvas;