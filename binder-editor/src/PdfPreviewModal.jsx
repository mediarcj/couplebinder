// File: binder-editor/src/PdfPreviewModal.jsx
// Description: Viewport-height modal that embeds a PDF blob URL for preview
// Goal: Use the full available browser height and let the iframe fill it.

import React, { useEffect, useMemo } from 'react';

// I am keeping `PdfPreviewModal` as a named helper so the surrounding workflow can call this step when it needs it.
function PdfPreviewModal({ open, pdfUrl, title = 'PDF Preview', subtitle = '', onClose }) {
  // Keep viewer URL derivation separate so future PDF fragment options have one home.
  const viewerUrl = useMemo(() => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!pdfUrl) return null;

    // Keep it simple. If you want a default zoom, you can append #zoom=page-width.
    // return `${pdfUrl}#zoom=page-width`;
    return pdfUrl;
  // I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues.
  }, [pdfUrl]);

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  useEffect(() => {
    // Treat Escape handling and scroll locking as one modal lifecycle. Cleanup restores
    // the page exactly when the preview closes or the component unmounts.
    if (!open) return;

    // I am saving `onKeyDown` here so the nearby steps can reuse the same value without rebuilding it each time.
    const onKeyDown = (e) => {
      // Return through ModalProvider so App's blob URL cleanup runs as well.
      if (e.key === 'Escape') onClose?.();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    document.addEventListener('keydown', onKeyDown);

    // lock background scroll
    const prevOverflow = document.body.style.overflow;
    // I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues.
    document.body.style.overflow = 'hidden';

    // This return sends the completed value or response back to the code that called this function.
    return () => {
      // I am removing the matching browser listener here so this code does not leave an extra handler behind after cleanup.
      document.removeEventListener('keydown', onKeyDown);
      // I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues.
      document.body.style.overflow = prevOverflow;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues.
  }, [open, onClose]);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!open) return null;

  // This return sends the completed value or response back to the code that called this function.
  return (
    // Backdrop clicks close, while the modal container stops the same mouse event inside.
    // I am opening the `div` element here. The `className`, `role`, `aria-modal`, `aria-label`, `onMouseDown` attributes pass the exact values this element or component uses. The confirmed `cb-preview-backdrop` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control.
    <div
      className="cb-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="PDF Preview"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className`, `onMouseDown` attributes pass the exact values this element or component uses. The confirmed `cb-preview-modal` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
      <div className="cb-preview-modal" onMouseDown={(e) => e.stopPropagation()}>
        {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-header` class name connects this markup to matching rules in App.css. */}
        <div className="cb-preview-header">
          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-title` class name connects this markup to matching rules in App.css. */}
          <div className="cb-preview-title">
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            {title}
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            {subtitle ? <span className="cb-preview-subtitle">{subtitle}</span> : null}
          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          </div>

          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-actions` class name connects this markup to matching rules in App.css. */}
          <div className="cb-preview-actions">
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `disabled` attributes pass the exact values this element or component uses. The confirmed `cb-preview-action-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The disabled expression keeps the existing busy or readiness guard on this control. */}
            <button
              type="button"
              className="cb-preview-action-btn"
              onClick={() => {
                // Use the same in-memory PDF URL without granting the opener a window reference.
                if (!pdfUrl) return;
                window.open(pdfUrl, '_blank', 'noopener,noreferrer');
              }}
              disabled={!pdfUrl}
            >
              {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
              Open in new tab
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            </button>

            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `aria-label`, `title` attributes pass the exact values this element or component uses. The confirmed `cb-preview-close` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
            <button
              type="button"
              className="cb-preview-close"
              onClick={onClose}
              aria-label="Close preview"
              title="Close (Esc)"
            >
              {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
              ×
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            </button>
          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          </div>
        {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
        </div>

        {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-body` class name connects this markup to matching rules in App.css. */}
        <div className="cb-preview-body">
          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-paper` class name connects this markup to matching rules in App.css. */}
          <div className="cb-preview-paper">
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-paper-inner` class name connects this markup to matching rules in App.css. */}
            <div className="cb-preview-paper-inner">
              {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
              {viewerUrl ? (
                // The browser's built-in PDF viewer owns scrolling and page controls inside this frame.
                // I am opening the `iframe` element here. The `className`, `src`, `title` attributes pass the exact values this element or component uses. The confirmed `cb-preview-iframe` class name connects this markup to matching rules in App.css.
                <iframe 
                  className="cb-preview-iframe" 
                  src={viewerUrl} 
                  title="PDF Preview"
                />
              // I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues.
              ) : (
                // I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues.
                // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-empty` class name connects this markup to matching rules in App.css.
                <div className="cb-preview-empty">No PDF available.</div>
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              )}
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            </div>
          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          </div>

          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-preview-footnote` class name connects this markup to matching rules in App.css. */}
          <div className="cb-preview-footnote">
            {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
            The preview now fills your browser height. Scroll inside the PDF as needed.
          {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
          </div>
        {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
        </div>
      {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
      </div>
    {/* I am keeping this line here because the surrounding PdfPreviewModal.jsx workflow expects this value or operation before it continues. */}
    </div>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this as the main value from PdfPreviewModal.jsx so the module that imports this file receives the intended entry point.
export default PdfPreviewModal;