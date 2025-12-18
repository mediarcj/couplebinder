// File: binder-editor/src/ActionSidebar.jsx
// Description: Right sidebar with action buttons
// Purpose: Vertical action panel matching wireframe design

import React from 'react';

function ActionSidebar({
  onAddPhoto,
  onDeleteSelected,
  onPreviewPdf,
  previewing,
  onExportPdf,
  onTidyLayout,
  saving,
  exporting,
  canExport
}) {
  return (
    <aside className="binder-editor-action-sidebar bg-white">
      <div className="action-sidebar-content">
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onAddPhoto}
          disabled={saving}
        >
          ADD PHOTO
        </button>

        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onDeleteSelected}
          disabled={saving}
        >
          DELETE PHOTO
        </button>

        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-secondary"
          onClick={onTidyLayout}
          disabled={saving}
        >
          TIDY
        </button>

        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-secondary"
          onClick={onPreviewPdf}
          disabled={previewing || exporting || saving || !canExport}
        >
          {previewing ? 'PREVIEWING…' : 'PREVIEW PDF'}
        </button>

        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onExportPdf}
          disabled={exporting || saving || !canExport}
        >
          {exporting ? 'EXPORTING…' : 'EXPORT PDF'}
        </button>
      </div>
    </aside>
  );
}

export default ActionSidebar;