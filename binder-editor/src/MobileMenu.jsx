// File: binder-editor/src/MobileMenu.jsx
// Description: Mobile bottom controls for binder editor

import React from 'react';

// I am exporting this as the main value from MobileMenu.jsx so the module that imports this file receives the intended entry point.
export default function MobileMenu({
  // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
  onAddPhoto,
  // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
  onDeletePhoto,
  // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
  onTidy,
  // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
  onExportPdf,
  // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
  onPreviewPdf,
  // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
  canDelete = false
// I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
}) {
  // App supplies the same editor actions used by the desktop sidebar, while this component
  // keeps their smaller mobile presentation separate.
  return (
    // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
    // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-controls` class name connects this markup to matching rules in App.css.
    <div className="mobile-bottom-controls">
        {/* Adding is always shown because it does not depend on a selected layer. */}
        {/* I am opening the `button` element here. The `className`, `onClick`, `aria-label` attributes pass the exact values this element or component uses. The confirmed `mobile-bottom-control-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
        <button
          className="mobile-bottom-control-btn"
          onClick={onAddPhoto}
          aria-label="Add photo"
        >
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-icon` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-icon">+</span>
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-label` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-label">Add</span>
        {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
        </button>
        {/* Only render delete when App reports a current photo selection. */}
        {canDelete && (
          // I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues.
          // I am opening the `button` element here. The `className`, `onClick`, `aria-label` attributes pass the exact values this element or component uses. The confirmed `mobile-bottom-control-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control.
          <button
            className="mobile-bottom-control-btn"
            onClick={onDeletePhoto}
            aria-label="Delete photo"
          >
            {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-icon` class name connects this markup to matching rules in App.css. */}
            <span className="mobile-bottom-control-btn-icon">🗑</span>
            {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-label` class name connects this markup to matching rules in App.css. */}
            <span className="mobile-bottom-control-btn-label">Delete</span>
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          </button>
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        )}
        {/* Tidy returns to App and updates only the active page layout. */}
        {/* I am opening the `button` element here. The `className`, `onClick`, `aria-label` attributes pass the exact values this element or component uses. The confirmed `mobile-bottom-control-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
        <button
          className="mobile-bottom-control-btn"
          onClick={onTidy}
          aria-label="Tidy layout"
        >
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-icon` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-icon">⚡</span>
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-label` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-label">Tidy</span>
        {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
        </button>
        {/* Preview opens the modal flow; export asks the browser to download the same server PDF. */}
        {/* I am opening the `button` element here. The `className`, `onClick`, `aria-label` attributes pass the exact values this element or component uses. The confirmed `mobile-bottom-control-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
        <button
          className="mobile-bottom-control-btn"
          onClick={onPreviewPdf}
          aria-label="Preview PDF"
        >
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-icon` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-icon">👁</span>
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-label` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-label">Preview</span>
        {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
        </button>
        {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `button` element here. The `className`, `onClick`, `aria-label` attributes pass the exact values this element or component uses. The confirmed `mobile-bottom-control-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
        <button
          className="mobile-bottom-control-btn"
          onClick={onExportPdf}
          aria-label="Export PDF"
        >
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-icon` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-icon">⬇</span>
          {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `mobile-bottom-control-btn-label` class name connects this markup to matching rules in App.css. */}
          <span className="mobile-bottom-control-btn-label">Export</span>
        {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
        </button>
    {/* I am keeping this line here because the surrounding MobileMenu.jsx workflow expects this value or operation before it continues. */}
    </div>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}
