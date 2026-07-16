// File: binder-editor/src/Toolbar.jsx
// Description: Toolbar with Auto Layout + save status
// Purpose: Editor controls + global feedback about autosave

import React from 'react';

// I am keeping `Toolbar` as a named helper so the surrounding workflow can call this step when it needs it.
function Toolbar({
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  onAddPhoto,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  onDeleteSelected,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  onAutoLayout,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  onExportPdf,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  onTidyLayout,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  saving,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  isDirty,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  lastSavedAt,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  hasSelection,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  exporting,
  // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
  canExport
// I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
}) {
  // Turn App's save flags into one short message instead of making the parent format UI text.
  let statusText = '';

  // Give active work priority, followed by unsaved work and the most recent stable state.
  if (saving) {
    // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
    statusText = 'Saving changes…';
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (isDirty) {
    // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
    statusText = 'Unsaved changes';
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (lastSavedAt) {
    // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
    statusText = 'All changes saved';
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
    statusText = 'Ready';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues.
    // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `binder-editor-toolbar`, `workspace-toolbar`, `workspace-toolbar-simple` class names connect this markup to matching rules in App.css.
    <div className="binder-editor-toolbar workspace-toolbar workspace-toolbar-simple">
      {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `toolbar-section`, `toolbar-left` class names connect this markup to matching rules in App.css. */}
      <div className="toolbar-section toolbar-left gap-3">
        {/* These callbacks return to App, where layout state and persistence are coordinated. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick` attributes pass the exact values this element or component uses. The confirmed `btn`, `btn-primary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
        <button
          type="button"
          className="btn btn-primary shadow-sm toolbar-btn"
          onClick={onAddPhoto}
        >
          {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
          Add photos
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        </button>
        {/* Selection comes from the canvas, so deletion stays unavailable until a layer is active. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled`, `title` attributes pass the exact values this element or component uses. The confirmed `btn`, `btn-secondary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="btn btn-secondary toolbar-btn"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          title="Delete selected photo"
        >
          {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
          Delete
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        </button>
        {/* Export is blocked while a save is running because the server renders persisted layout data. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled`, `title` attributes pass the exact values this element or component uses. The confirmed `btn`, `btn-primary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="btn btn-primary toolbar-btn"
          onClick={onExportPdf}
          disabled={exporting || saving || !canExport}
          title={exporting ? 'Exporting...' : (!canExport ? 'Cannot export yet' : 'Export PDF')}
        >
          {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
          {exporting ? 'Exporting…' : 'Export PDF'}
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        </button>
        {/* Auto Layout works across pages, while Tidy only adjusts the current page. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled`, `title` attributes pass the exact values this element or component uses. The confirmed `btn`, `btn-secondary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="btn btn-secondary toolbar-btn"
          onClick={onAutoLayout}
          disabled={saving}
          title="Auto layout all pages"
        >
          {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
          Auto Layout
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        </button>
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled`, `title` attributes pass the exact values this element or component uses. The confirmed `btn`, `btn-secondary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
        <button
          type="button"
          className="btn btn-secondary toolbar-btn"
          onClick={onTidyLayout}
          disabled={saving}
          title="Tidy layout for current page"
        >
          {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
          Tidy
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        </button>
      {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
      </div>

      {/* Keep save feedback visible beside the controls that can create more edits. */}
      {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `toolbar-section`, `toolbar-status` class names connect this markup to matching rules in App.css. */}
      <div className="toolbar-section toolbar-status">
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `toolbar-status-text` class name connects this markup to matching rules in App.css. */}
        <span className="toolbar-status-text">
          {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
          {statusText}
        {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
        </span>
      {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
      </div>
    {/* I am keeping this line here because the surrounding Toolbar.jsx workflow expects this value or operation before it continues. */}
    </div>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this as the main value from Toolbar.jsx so the module that imports this file receives the intended entry point.
export default Toolbar;