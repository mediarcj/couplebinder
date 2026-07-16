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
  // App passes each handler and busy flag down here so this sidebar can stay focused on
  // presenting the desktop actions instead of owning editor state itself.
  return (
    <aside className="binder-editor-action-sidebar bg-white">
      <div className="action-sidebar-content">
        {/* Upload and delete feed the selected page workflow owned by App. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onAddPhoto}
          disabled={saving}
        >
          ADD PHOTO
        </button>

        {/* Delete forwards to App so the selected photo layer can be removed through the editor's existing state workflow. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onDeleteSelected}
          disabled={saving}
        >
          DELETE PHOTO
        </button>

        {/* Tidy asks App to rearrange the current page without starting a server export. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-secondary"
          onClick={onTidyLayout}
          disabled={saving}
        >
          TIDY
        </button>

        {/* Preview asks App to prepare the PDF modal, and App changes the label while that response is being prepared. */}
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
