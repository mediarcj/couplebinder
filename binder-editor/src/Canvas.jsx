// File: binder-editor/src/Canvas.jsx
// Description: Canvas component for editing layers
// Purpose: Display and manipulate layers on a page

import React, { useState, useCallback } from 'react';
import Layer from './Layer';

function Canvas({ page, layers, onUpdateLayer, onAddLayer, onRemoveLayer }) {
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      setSelectedLayer(null);
    }
  }, []);

  // Handle drag start
  const handleDragStart = useCallback((layerId, e) => {
    setSelectedLayer(layerId);
    setDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  }, []);

  // Handle drag move
  const handleDragMove = useCallback((e) => {
    if (!dragging || !selectedLayer) return;
    
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - dragStart.x;
    const y = e.clientY - rect.top - dragStart.y;
    
    onUpdateLayer(selectedLayer, { x: Math.max(0, x), y: Math.max(0, y) });
  }, [dragging, selectedLayer, dragStart, onUpdateLayer]);

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

