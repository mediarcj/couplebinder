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
  // Turn App's save flags into one short message instead of making the parent format UI text.
  let statusText = '';

  // Give active work priority, followed by unsaved work and the most recent stable state.
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
        {/* These callbacks return to App, where layout state and persistence are coordinated. */}
        <button
          type="button"
          className="btn btn-primary shadow-sm toolbar-btn"
          onClick={onAddPhoto}
        >
          Add photos
        </button>
        {/* Selection comes from the canvas, so deletion stays unavailable until a layer is active. */}
        <button
          type="button"
          className="btn btn-secondary toolbar-btn"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          title="Delete selected photo"
        >
          Delete
        </button>
        {/* Export is blocked while a save is running because the server renders persisted layout data. */}
        <button
          type="button"
          className="btn btn-primary toolbar-btn"
          onClick={onExportPdf}
          disabled={exporting || saving || !canExport}
          title={exporting ? 'Exporting...' : (!canExport ? 'Cannot export yet' : 'Export PDF')}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
        {/* Auto Layout works across pages, while Tidy only adjusts the current page. */}
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

      {/* Keep save feedback visible beside the controls that can create more edits. */}
      <div className="toolbar-section toolbar-status">
        <span className="toolbar-status-text">
          {statusText}
        </span>
      </div>
    </div>
  );
}

export default Toolbar;