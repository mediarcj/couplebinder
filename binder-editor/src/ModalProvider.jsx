// File: binder-editor/src/ModalProvider.jsx
// Description: Simple global modal provider for the binder editor
// Now supports:
//  - confirm modals (existing behavior)
//  - pdf preview modals (new behavior) so PDF preview uses the same modal system

import React, { createContext, useContext, useState, useCallback } from 'react';
import PdfPreviewModal from './PdfPreviewModal';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);

  const closeModal = useCallback(() => {
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
    const kind = options?.kind || 'confirm';

    if (kind === 'pdf') {
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
    <ModalContext.Provider value={value}>
      {children}

      {/* Confirm modal (existing) */}
      {modal?.kind === 'confirm' && (
        <div className="cb-modal-backdrop" onMouseDown={(e) => {
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
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  return ctx;
}