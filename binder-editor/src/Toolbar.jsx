// File: binder-editor/src/Toolbar.jsx
// Description: Toolbar with Auto Layout + save status
// Purpose: Editor controls + global feedback about autosave

import React from 'react';

function Toolbar({ onAutoLayout, saving, isDirty, lastSavedAt }) {
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
    <div className="binder-editor-toolbar sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="toolbar-section gap-3">
        <button
          type="button"
          className="btn btn-primary shadow-sm"
          onClick={onAutoLayout}
          disabled={saving}
        >
          Auto Layout
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