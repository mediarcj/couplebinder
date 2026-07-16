// Description: Simple global modal provider for the binder editor
// Now supports:
//  - confirm modals (existing behavior)
//  - pdf preview modals (new behavior) so PDF preview uses the same modal system

import React, { createContext, useContext, useState, useCallback } from 'react';
import PdfPreviewModal from './PdfPreviewModal';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  // Null means no overlay; otherwise this object contains either confirm or PDF fields.
  const [modal, setModal] = useState(null);

  const closeModal = useCallback(() => {
    // Clear through the functional setter so cleanup receives the exact modal being closed.
    setModal((prev) => {
      // Cleanup hook for PDFs (revoke blob URLs, etc.)
      if (prev?.kind === 'pdf' && typeof prev?.onClose === 'function') {
        try {
          prev.onClose();
        } catch {}
      }
      return null;
    });
  }, []);

  const openModal = useCallback((options) => {
    // A single modal owner prevents stacked dialogs. Replacing a PDF also runs its blob
    // cleanup before the next dialog takes over.
    // If replacing an existing PDF modal, run its cleanup first
    setModal((prev) => {
      if (prev?.kind === 'pdf' && typeof prev?.onClose === 'function') {
        try {
          prev.onClose();
        } catch {}
      }
      return prev;
    });

    // Default to confirm modal (backward compatible)
    // Existing callers can omit kind and still receive the original confirmation behavior.
    const kind = options?.kind || 'confirm';

    if (kind === 'pdf') {
      // App supplies a blob URL and cleanup callback created during its preview flow.
      setModal({
        kind: 'pdf',
        title: options?.title || 'PDF Preview',
        subtitle: options?.subtitle || '',
        pdfUrl: options?.pdfUrl || null,
        onClose: options?.onClose || null
      });
      return;
    }

    setModal({
      // Normalize optional values once so the renderer below can stay simple.
      kind: 'confirm',
      title: options?.title || '',
      body: options?.body || '',
      confirmLabel: options?.confirmLabel || 'OK',
      cancelLabel:
        options?.cancelLabel !== undefined ? options.cancelLabel : 'Cancel',
      onConfirm: options?.onConfirm || null,
      onCancel: options?.onCancel || null
    });
  }, []);

  const handleConfirm = async () => {
    // Keep the dialog open while an async action runs, but always close it afterward so
    // callback failures cannot strand the backdrop on screen.
    if (modal?.kind !== 'confirm') return;

    if (modal?.onConfirm) {
      try {
        await modal.onConfirm();
      } finally {
        closeModal();
      }
    } else {
      closeModal();
    }
  };

  const handleCancel = async () => {
    // Match confirm cleanup semantics so async cancellation cannot leave the dialog open.
    if (modal?.kind !== 'confirm') return;

    if (modal?.onCancel) {
      try {
        await modal.onCancel();
      } finally {
        closeModal();
      }
    } else {
      closeModal();
    }
  };

  const value = { openModal, closeModal };

  return (
    // Children call useModal while this provider alone renders the active overlay.
    <ModalContext.Provider value={value}>
      {children}

      {/* Confirm modal (existing) */}
      {modal?.kind === 'confirm' && (
        <div className="cb-modal-backdrop" onMouseDown={(e) => {
          // Only a direct backdrop click cancels; clicks inside the dialog stay local.
          if (e.target === e.currentTarget) handleCancel();
        }}>
          <div
            className="cb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cb-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {modal.title && (
              <h2 id="cb-modal-title" className="cb-modal-title">
                {modal.title}
              </h2>
            )}

            {modal.body && <p className="cb-modal-body">{modal.body}</p>}

            <div className="cb-modal-actions">
              {modal.cancelLabel && (
                <button
                  type="button"
                  className="cb-modal-btn cb-modal-btn-secondary"
                  onClick={handleCancel}
                >
                  {modal.cancelLabel}
                </button>
              )}

              <button
                type="button"
                className="cb-modal-btn cb-modal-btn-primary"
                onClick={handleConfirm}
              >
                {modal.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF preview modal (new) */}
      {modal?.kind === 'pdf' && (
        // PdfPreviewModal handles Escape/backdrop UI and returns close through this provider.
        <PdfPreviewModal
          open
          title={modal.title}
          subtitle={modal.subtitle}
          pdfUrl={modal.pdfUrl}
          onClose={closeModal}
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  // Fail near the calling component if a future editor mount forgets ModalProvider.
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  return ctx;
}