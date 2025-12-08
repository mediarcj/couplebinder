// File: binder-editor/src/Toolbar.jsx
// Description: Toolbar with Auto Layout + save status
// Purpose: Editor controls + global feedback about autosave

import React from 'react';

function Toolbar({
  onAddPhoto,
  onDeleteSelected,
  onAutoLayout,
  saving,
  isDirty,
  lastSavedAt,
  hasSelection
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
          className="btn btn-secondary shadow-sm toolbar-btn"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
        >
          Delete selected photo
        </button>
        <button
          type="button"
          className="btn btn-secondary shadow-sm toolbar-btn"
          disabled
          title="Save draft is managed by autosave in React editor"
        >
          Save draft
        </button>
        <button
          type="button"
          className="btn btn-primary shadow-sm toolbar-btn"
          disabled
          title="Export PDF handled in legacy flow"
        >
          Export PDF
        </button>
        <button
          type="button"
          className="btn btn-secondary shadow-sm toolbar-btn"
          onClick={onAutoLayout}
          disabled={saving}
        >
          Auto Layout
        </button>
        <button
          type="button"
          className="btn btn-secondary shadow-sm toolbar-btn"
          disabled
          title="Already in React editor"
        >
          New editor (beta)
        </button>
      </div>

      <div className="toolbar-section toolbar-status text-sm text-slate-600">
        <span className="toolbar-status-text font-medium">
          {statusText}
        </span>
      </div>
    </div>
  );
}

export default Toolbar;