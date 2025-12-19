// File: binder-editor/src/MobileMenu.jsx
// Description: Mobile bottom controls for binder editor

import React from 'react';

export default function MobileMenu({
  onAddPhoto,
  onDeletePhoto,
  onTidy,
  onExportPdf,
  onPreviewPdf,
  canDelete = false
}) {
  return (
    <div className="mobile-bottom-controls">
        <button
          className="mobile-bottom-control-btn"
          onClick={onAddPhoto}
          aria-label="Add photo"
        >
          <span className="mobile-bottom-control-btn-icon">+</span>
          <span className="mobile-bottom-control-btn-label">Add</span>
        </button>
        {canDelete && (
          <button
            className="mobile-bottom-control-btn"
            onClick={onDeletePhoto}
            aria-label="Delete photo"
          >
            <span className="mobile-bottom-control-btn-icon">🗑</span>
            <span className="mobile-bottom-control-btn-label">Delete</span>
          </button>
        )}
        <button
          className="mobile-bottom-control-btn"
          onClick={onTidy}
          aria-label="Tidy layout"
        >
          <span className="mobile-bottom-control-btn-icon">⚡</span>
          <span className="mobile-bottom-control-btn-label">Tidy</span>
        </button>
        <button
          className="mobile-bottom-control-btn"
          onClick={onPreviewPdf}
          aria-label="Preview PDF"
        >
          <span className="mobile-bottom-control-btn-icon">👁</span>
          <span className="mobile-bottom-control-btn-label">Preview</span>
        </button>
        <button
          className="mobile-bottom-control-btn"
          onClick={onExportPdf}
          aria-label="Export PDF"
        >
          <span className="mobile-bottom-control-btn-icon">⬇</span>
          <span className="mobile-bottom-control-btn-label">Export</span>
        </button>
    </div>
  );
}

