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
    <div className="binder-editor-toolbar">
      <div className="toolbar-section">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onAutoLayout}
          disabled={saving}
        >
          Auto Layout
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