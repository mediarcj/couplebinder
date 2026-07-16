// Description: Viewport-height modal that embeds a PDF blob URL for preview
// Goal: Use the full available browser height and let the iframe fill it.

import React, { useEffect, useMemo } from 'react';

function PdfPreviewModal({ open, pdfUrl, title = 'PDF Preview', subtitle = '', onClose }) {
  // Keep viewer URL derivation separate so future PDF fragment options have one home.
  const viewerUrl = useMemo(() => {
    if (!pdfUrl) return null;

    // Keep it simple. If you want a default zoom, you can append #zoom=page-width.
    // return `${pdfUrl}#zoom=page-width`;
    return pdfUrl;
  }, [pdfUrl]);

  useEffect(() => {
    // Treat Escape handling and scroll locking as one modal lifecycle. Cleanup restores
    // the page exactly when the preview closes or the component unmounts.
    if (!open) return;

    const onKeyDown = (e) => {
      // Return through ModalProvider so App's blob URL cleanup runs as well.
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);

    // lock background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // Backdrop clicks close, while the modal container stops the same mouse event inside.
    <div
      className="cb-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="PDF Preview"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="cb-preview-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cb-preview-header">
          <div className="cb-preview-title">
            {title}
            {subtitle ? <span className="cb-preview-subtitle">{subtitle}</span> : null}
          </div>

          <div className="cb-preview-actions">
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
              Open in new tab
            </button>

            <button
              type="button"
              className="cb-preview-close"
              onClick={onClose}
              aria-label="Close preview"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        <div className="cb-preview-body">
          <div className="cb-preview-paper">
            <div className="cb-preview-paper-inner">
              {viewerUrl ? (
                // The browser's built-in PDF viewer owns scrolling and page controls inside this frame.
                <iframe 
                  className="cb-preview-iframe" 
                  src={viewerUrl} 
                  title="PDF Preview"
                />
              ) : (
                <div className="cb-preview-empty">No PDF available.</div>
              )}
            </div>
          </div>

          <div className="cb-preview-footnote">
            The preview now fills your browser height. Scroll inside the PDF as needed.
          </div>
        </div>
      </div>
    </div>
  );
}

export default PdfPreviewModal;