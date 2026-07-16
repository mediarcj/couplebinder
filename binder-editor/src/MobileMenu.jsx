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
  // App supplies the same editor actions used by the desktop sidebar, while this component
  // keeps their smaller mobile presentation separate.
  return (
    <div className="mobile-bottom-controls">
        {/* Adding is always shown because it does not depend on a selected layer. */}
        <button
          className="mobile-bottom-control-btn"
          onClick={onAddPhoto}
          aria-label="Add photo"
        >
          <span className="mobile-bottom-control-btn-icon">+</span>
          <span className="mobile-bottom-control-btn-label">Add</span>
        </button>
        {/* Only render delete when App reports a current photo selection. */}
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
        {/* Tidy returns to App and updates only the active page layout. */}
        <button
          className="mobile-bottom-control-btn"
          onClick={onTidy}
          aria-label="Tidy layout"
        >
          <span className="mobile-bottom-control-btn-icon">⚡</span>
          <span className="mobile-bottom-control-btn-label">Tidy</span>
        </button>
        {/* Preview opens the modal flow; export asks the browser to download the same server PDF. */}
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
