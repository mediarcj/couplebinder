// File: binder-editor/src/Toolbar.jsx
// Description: Toolbar with Auto Layout + save status
// Purpose: Editor controls + global feedback about autosave

import React from 'react';

function Toolbar({
  onAddPhoto,
  onDeleteSelected,
  onAutoLayout,
  onExportPdf,
  onTidyLayout,
  saving,
  isDirty,
  lastSavedAt,
  hasSelection,
  exporting,
  canExport
}) {
  let statusText = '';

  if (saving) {
    statusText = 'Saving changes…';
  } else if (isDirty) {
    statusText = 'Unsaved changes';
  } else if (lastSavedAt) {
    statusText = 'All changes saved';
  } else {
    statusText = 'Ready';
  }

  return (
    <div className="binder-editor-toolbar workspace-toolbar workspace-toolbar-simple">
      <div className="toolbar-section toolbar-left gap-3">
        <button
          type="button"
          className="btn btn-primary shadow-sm toolbar-btn"
          onClick={onAddPhoto}
        >
          Add photos
        </button>
        <button
          type="button"
          className="btn btn-secondary toolbar-btn"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          title="Delete selected photo"
        >
          Delete
        </button>
        <button
          type="button"
          className="btn btn-primary toolbar-btn"
          onClick={onExportPdf}
          disabled={exporting || saving || !canExport}
          title={exporting ? 'Exporting...' : (!canExport ? 'Cannot export yet' : 'Export PDF')}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          type="button"
          className="btn btn-secondary toolbar-btn"
          onClick={onAutoLayout}
          disabled={saving}
          title="Auto layout all pages"
        >
          Auto Layout
        </button>
        <button
          type="button"
          className="btn btn-secondary toolbar-btn"
          onClick={onTidyLayout}
          disabled={saving}
          title="Tidy layout for current page"
        >
          Tidy
        </button>
      </div>

      <div className="toolbar-section toolbar-status">
        <span className="toolbar-status-text">
          {statusText}
        </span>
      </div>
    </div>
  );
}

export default Toolbar;