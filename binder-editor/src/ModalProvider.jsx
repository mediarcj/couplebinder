// File: binder-editor/src/ModalProvider.jsx
// Description: Simple global modal provider for the binder editor

import React, {
  createContext,
  useContext,
  useState,
  useCallback
} from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);

  const openModal = useCallback((options) => {
    setModal({
      title: options.title || '',
      body: options.body || '',
      confirmLabel: options.confirmLabel || 'OK',
      cancelLabel: options.cancelLabel || 'Cancel',
      onConfirm: options.onConfirm || null,
      onCancel: options.onCancel || null
    });
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const handleConfirm = async () => {
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

      {modal && (
        <div className="cb-modal-backdrop">
          <div
            className="cb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cb-modal-title"
          >
            {modal.title && (
              <h2 id="cb-modal-title" className="cb-modal-title">
                {modal.title}
              </h2>
            )}

            {modal.body && (
              <p className="cb-modal-body">
                {modal.body}
              </p>
            )}

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
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return ctx;
}