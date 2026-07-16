// File: binder-editor/src/ActionSidebar.jsx
// Description: Right sidebar with action buttons
// Purpose: Vertical action panel matching wireframe design

import React from 'react';

// I am keeping `ActionSidebar` as a named helper so the surrounding workflow can call this step when it needs it.
function ActionSidebar({
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  onAddPhoto,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  onDeleteSelected,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  onPreviewPdf,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  previewing,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  onExportPdf,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  onTidyLayout,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  saving,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  exporting,
  // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
  canExport
// I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
}) {
  // App passes each handler and busy flag down here so this sidebar can stay focused on
  // presenting the desktop actions instead of owning editor state itself.
  return (
    // I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues.
    // I am opening the `aside` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `binder-editor-action-sidebar` class name connects this markup to matching rules in App.css.
    <aside className="binder-editor-action-sidebar bg-white">
      {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `action-sidebar-content` class name connects this markup to matching rules in App.css. */}
      <div className="action-sidebar-content">
        {/* Upload and delete feed the selected page workflow owned by App. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled` attributes pass the exact values this element or component uses. The confirmed `action-sidebar-btn`, `action-sidebar-btn-primary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onAddPhoto}
          disabled={saving}
        >
          {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
          ADD PHOTO
        {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
        </button>

        {/* Delete forwards to App so the selected photo layer can be removed through the editor's existing state workflow. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled` attributes pass the exact values this element or component uses. The confirmed `action-sidebar-btn`, `action-sidebar-btn-primary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onDeleteSelected}
          disabled={saving}
        >
          {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
          DELETE PHOTO
        {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
        </button>

        {/* Tidy asks App to rearrange the current page without starting a server export. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled` attributes pass the exact values this element or component uses. The confirmed `action-sidebar-btn`, `action-sidebar-btn-secondary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-secondary"
          onClick={onTidyLayout}
          disabled={saving}
        >
          {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
          TIDY
        {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
        </button>

        {/* Preview asks App to prepare the PDF modal, and App changes the label while that response is being prepared. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled` attributes pass the exact values this element or component uses. The confirmed `action-sidebar-btn`, `action-sidebar-btn-secondary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-secondary"
          onClick={onPreviewPdf}
          disabled={previewing || exporting || saving || !canExport}
        >
          {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
          {previewing ? 'PREVIEWING…' : 'PREVIEW PDF'}
        {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
        </button>

        {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled` attributes pass the exact values this element or component uses. The confirmed `action-sidebar-btn`, `action-sidebar-btn-primary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="action-sidebar-btn action-sidebar-btn-primary"
          onClick={onExportPdf}
          disabled={exporting || saving || !canExport}
        >
          {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
          {exporting ? 'EXPORTING…' : 'EXPORT PDF'}
        {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
        </button>
      {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
      </div>
    {/* I am keeping this line here because the surrounding ActionSidebar.jsx workflow expects this value or operation before it continues. */}
    </aside>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this as the main value from ActionSidebar.jsx so the module that imports this file receives the intended entry point.
export default ActionSidebar;
