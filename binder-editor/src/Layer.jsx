// File: binder-editor/src/Layer.jsx
// Description: Individual layer component
// Purpose: Render and edit a single layer on canvas

import React, { useState, useEffect, useRef } from 'react';
import { getPhotoViewUrl } from './api';

function Layer({ layer, selected, onSelect, onUpdate, onRemove, onDragStart, binderId }) {
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef(null);
  // Start with any existing URL baked into the layout (legacy EJS binder)
  const [imageUrl, setImageUrl] = useState(layer.src || null);
  const [imageLoading, setImageLoading] = useState(false);
  const fetchAttemptedRef = useRef(false);

  const handleMouseDown = (e) => {
    // IMPORTANT: prevent the browser's default image drag behavior
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    onDragStart(layer.id, e);
  };

  const handleResizeStart = (e, corner) => {
    e.preventDefault();
    e.stopPropagation();

    const layerEl = e.currentTarget.closest('.binder-editor-layer');
    if (!layerEl) return;

    const canvasEl =
      layerEl.closest('.canvas-page') ||
      layerEl.closest('.canvas-stage') ||
      layerEl.closest('.binder-editor-canvas');
    const canvasRect = canvasEl?.getBoundingClientRect();
    const rect = layerEl.getBoundingClientRect();

    if (!canvasRect || !rect) return;

    const left = rect.left - canvasRect.left;
    const top = rect.top - canvasRect.top;
    const aspect =
      rect.width && rect.height ? rect.width / rect.height : 1;

    resizeRef.current = {
      corner,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRect: {
        left,
        top,
        width: rect.width,
        height: rect.height
      },
      aspect,
      canvasRect
    };
    setResizing(true);
  };

  const handleResizeMove = (e) => {
    if (!resizing || !resizeRef.current) return;

    const { corner, startMouseX, startMouseY, startRect, aspect, canvasRect } =
      resizeRef.current;

    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;

    const isLeft = corner.includes('left');
    const isTop = corner.includes('top');

    let width = isLeft ? startRect.width - dx : startRect.width + dx;
    width = Math.max(50, width);
    let height = width / aspect;

    let left = isLeft ? startRect.left + (startRect.width - width) : startRect.left;
    let top = isTop ? startRect.top + (startRect.height - height) : startRect.top;

    // Clamp inside canvas
    if (left < 0) {
      const diff = -left;
      left = 0;
      width = Math.max(50, width - diff);
      height = width / aspect;
      if (isLeft) {
        left = 0;
      }
      if (isTop) {
        top = startRect.top + (startRect.height - height);
      }
    }

    if (top < 0) {
      const diff = -top;
      top = 0;
      height = Math.max(50, height - diff);
      width = height * aspect;
      if (isLeft) {
        left = startRect.left + (startRect.width - width);
      }
    }

    if (left + width > canvasRect.width) {
      width = canvasRect.width - left;
      width = Math.max(50, width);
      height = width / aspect;
    }

    if (top + height > canvasRect.height) {
      height = canvasRect.height - top;
      height = Math.max(50, height);
      width = height * aspect;
      if (isLeft) {
        left = startRect.left + (startRect.width - width);
      }
    }

    onUpdate(layer.id, {
      width,
      height,
      x: left,
      y: top
    });
  };

  const handleResizeEnd = () => {
    setResizing(false);
    resizeRef.current = null;
  };

  React.useEffect(() => {
    if (resizing) {
      const handleMove = (e) => handleResizeMove(e);
      const handleEnd = () => {
        handleResizeEnd();
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
      };
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
      };
    }
  }, [resizing, handleResizeMove]);

  // Use a nonce-protected style element for dynamic positioning (CSP-compliant)
  // We'll inject CSS rules into a style element with nonce
  React.useEffect(() => {
    const styleId = `layer-style-${layer.id}`;
    let styleEl = document.getElementById(styleId);
    
    if (!styleEl) {
      // Get nonce from the root element's data attribute (set by EJS template)
      const rootEl = document.getElementById('binder-editor-root');
      const nonce = rootEl?.getAttribute('data-csp-nonce') || 
                    document.querySelector('style[nonce]')?.getAttribute('nonce') || '';
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      if (nonce) styleEl.setAttribute('nonce', nonce);
      document.head.appendChild(styleEl);
    }
    
    // Inject CSS rule for this layer
    const selector = `[data-layer-id="${layer.id}"]`;
    const bgColor = layer.type === 'photo' ? '#f0f0f0' : (layer.backgroundColor || '#fff');
    styleEl.textContent = `
      ${selector} {
        left: ${layer.x}px !important;
        top: ${layer.y}px !important;
        width: ${layer.width}px !important;
        height: ${layer.height}px !important;
        transform: rotate(${layer.rotation}deg) !important;
        z-index: ${layer.zIndex || 0} !important;
        background-color: ${bgColor} !important;
      }
    `;
    
    return () => {
      // Cleanup: remove style element when component unmounts
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    };
  }, [layer.x, layer.y, layer.width, layer.height, layer.rotation, layer.zIndex, layer.type, layer.backgroundColor, layer.id]);

  // Fetch signed URL for photo if storageKey exists
  // Only fetch once per storageKey change (not on imageUrl/imageLoading changes)
  useEffect(() => {
    // Reset fetch attempt when storageKey changes
    if (layer.storageKey !== fetchAttemptedRef.current?.storageKey) {
      fetchAttemptedRef.current = { storageKey: layer.storageKey, attempted: false };
      // When storageKey changes, fall back to any src we already have in the layout
      setImageUrl(layer.src || null);
      setImageLoading(false);
    }

    // Only fetch if we haven't attempted yet and have required data
    if (
      layer.type === 'photo' && 
      layer.storageKey && 
      binderId && 
      !fetchAttemptedRef.current.attempted
    ) {
      fetchAttemptedRef.current.attempted = true;
      setImageLoading(true);
      getPhotoViewUrl(binderId, layer.storageKey)
        .then(url => {
          if (url) {
            // Prefer fresh signed URL from backend; fall back to any baked-in src
            setImageUrl(url || layer.src || null);
          } else {
            // If no URL returned, keep any existing src but mark as attempted
            setImageUrl(prev => prev || layer.src || null);
            fetchAttemptedRef.current.attempted = true;
          }
        })
        .catch(err => {
          console.error('[BinderEditor] Failed to load photo URL:', err);
          // Mark as attempted on error so we don't retry infinitely
          fetchAttemptedRef.current.attempted = true;
        })
        .finally(() => {
          setImageLoading(false);
        });
    }
  }, [layer.type, layer.storageKey, binderId, layer.src]); // keep src in sync when layout changes

  return (
    <div
      className={`binder-editor-layer ${selected ? 'selected' : ''} ${layer.type === 'photo' ? 'layer-type-photo' : 'layer-type-other'}`}
      data-layer-id={layer.id}
      onMouseDown={handleMouseDown}
    >
      {layer.type === 'photo' && (
        <div className="layer-photo-container">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Binder photo"
              className="layer-photo-image"
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onError={() => {
                console.warn('[BinderEditor] Image failed to load:', imageUrl);
                // Don't set imageUrl to null here - that would trigger the effect again
                // Just log the error and let the placeholder show
              }}
            />
          ) : imageLoading ? (
            <div className="layer-photo-loading">
              <span>Loading...</span>
            </div>
          ) : (
            <div className="layer-photo-placeholder">
              <span>Photo</span>
              {layer.storageKey && (
                <span className="photo-id" title={layer.storageKey}>
                  {layer.storageKey.split('/').pop() || 'No image'}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      
      {layer.type === 'text' && layer.text && (
        <div className="layer-text">{layer.text}</div>
      )}
      
      {selected && (
        <>
          {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
            <div
              key={pos}
              className={`layer-resize-handle layer-resize-${pos}`}
              onMouseDown={(e) => handleResizeStart(e, pos)}
              role="presentation"
            />
          ))}
        </>
      )}
    </div>
  );
}

export default Layer;