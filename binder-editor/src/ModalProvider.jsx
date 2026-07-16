// File: binder-editor/src/ModalProvider.jsx
// Description: Simple global modal provider for the binder editor
// Now supports:
//  - confirm modals (existing behavior)
//  - pdf preview modals (new behavior) so PDF preview uses the same modal system

import React, { createContext, useContext, useState, useCallback } from 'react';
// I am importing `PdfPreviewModal` from `./PdfPreviewModal` here because ModalProvider.jsx uses it in the steps below.
import PdfPreviewModal from './PdfPreviewModal';

// I am saving `ModalContext` here so the nearby steps can reuse the same value without rebuilding it each time.
const ModalContext = createContext(null);

// I am keeping `ModalProvider` as a named helper so the surrounding workflow can call this step when it needs it.
export function ModalProvider({ children }) {
  // Null means no overlay; otherwise this object contains either confirm or PDF fields.
  const [modal, setModal] = useState(null);

  // I am saving `closeModal` here so the nearby steps can reuse the same value without rebuilding it each time.
  const closeModal = useCallback(() => {
    // Clear through the functional setter so cleanup receives the exact modal being closed.
    setModal((prev) => {
      // Cleanup hook for PDFs (revoke blob URLs, etc.)
      if (prev?.kind === 'pdf' && typeof prev?.onClose === 'function') {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          prev.onClose();
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch {}
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return null;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `openModal` here so the nearby steps can reuse the same value without rebuilding it each time.
  const openModal = useCallback((options) => {
    // A single modal owner prevents stacked dialogs. Replacing a PDF also runs its blob
    // cleanup before the next dialog takes over.
    // If replacing an existing PDF modal, run its cleanup first
    setModal((prev) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (prev?.kind === 'pdf' && typeof prev?.onClose === 'function') {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          prev.onClose();
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch {}
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return prev;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // Default to confirm modal (backward compatible)
    // Existing callers can omit kind and still receive the original confirmation behavior.
    const kind = options?.kind || 'confirm';

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (kind === 'pdf') {
      // App supplies a blob URL and cleanup callback created during its preview flow.
      setModal({
        // I am keeping the `kind` field in this object so the receiving code can read that value by its expected name.
        kind: 'pdf',
        // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
        title: options?.title || 'PDF Preview',
        // I am keeping the `subtitle` field in this object so the receiving code can read that value by its expected name.
        subtitle: options?.subtitle || '',
        // I am keeping the `pdfUrl` field in this object so the receiving code can read that value by its expected name.
        pdfUrl: options?.pdfUrl || null,
        // I am keeping the `onClose` field in this object so the receiving code can read that value by its expected name.
        onClose: options?.onClose || null
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setModal({
      // Normalize optional values once so the renderer below can stay simple.
      kind: 'confirm',
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: options?.title || '',
      // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
      body: options?.body || '',
      // I am keeping the `confirmLabel` field in this object so the receiving code can read that value by its expected name.
      confirmLabel: options?.confirmLabel || 'OK',
      // I am keeping the `cancelLabel` field in this object so the receiving code can read that value by its expected name.
      cancelLabel:
        // I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues.
        options?.cancelLabel !== undefined ? options.cancelLabel : 'Cancel',
      // I am keeping the `onConfirm` field in this object so the receiving code can read that value by its expected name.
      onConfirm: options?.onConfirm || null,
      // I am keeping the `onCancel` field in this object so the receiving code can read that value by its expected name.
      onCancel: options?.onCancel || null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues.
  }, []);

  // I am saving `handleConfirm` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleConfirm = async () => {
    // Keep the dialog open while an async action runs, but always close it afterward so
    // callback failures cannot strand the backdrop on screen.
    if (modal?.kind !== 'confirm') return;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (modal?.onConfirm) {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await modal.onConfirm();
      // This final block runs after success or failure so the shared cleanup still happens in either outcome.
      } finally {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        closeModal();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      closeModal();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `handleCancel` here so the nearby steps can reuse the same value without rebuilding it each time.
  const handleCancel = async () => {
    // Match confirm cleanup semantics so async cancellation cannot leave the dialog open.
    if (modal?.kind !== 'confirm') return;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (modal?.onCancel) {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await modal.onCancel();
      // This final block runs after success or failure so the shared cleanup still happens in either outcome.
      } finally {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        closeModal();
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      closeModal();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `value` here so the nearby steps can reuse the same value without rebuilding it each time.
  const value = { openModal, closeModal };

  // This return sends the completed value or response back to the code that called this function.
  return (
    // Children call useModal while this provider alone renders the active overlay.
    // I am opening the `ModalContext.Provider` React component here. The `value` attribute passes the exact values this element or component uses.
    <ModalContext.Provider value={value}>
      {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
      {children}

      {/* Confirm modal (existing) */}
      {modal?.kind === 'confirm' && (
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        // I am opening the `div` element here. The `className`, `onMouseDown` attributes pass the exact values this element or component uses. The confirmed `cb-modal-backdrop` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here.
        <div className="cb-modal-backdrop" onMouseDown={(e) => {
          // Only a direct backdrop click cancels; clicks inside the dialog stay local.
          if (e.target === e.currentTarget) handleCancel();
        }}>
          {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `div` element here. The `className`, `role`, `aria-modal`, `aria-labelledby`, `onMouseDown` attributes pass the exact values this element or component uses. The confirmed `cb-modal` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control. */}
          <div
            className="cb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cb-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
            {modal.title && (
              // I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues.
              // I am opening the `h2` element here. The `id`, `className` attributes pass the exact values this element or component uses. The confirmed `cb-modal-title` class name connects this markup to matching rules in App.css.
              <h2 id="cb-modal-title" className="cb-modal-title">
                {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
                {modal.title}
              {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
              </h2>
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            )}

            {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
            {modal.body && <p className="cb-modal-body">{modal.body}</p>}

            {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `cb-modal-actions` class name connects this markup to matching rules in App.css. */}
            <div className="cb-modal-actions">
              {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
              {modal.cancelLabel && (
                // I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues.
                // I am opening the `button` element here. The `type`, `className`, `onClick` attributes pass the exact values this element or component uses. The confirmed `cb-modal-btn`, `cb-modal-btn-secondary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here.
                <button
                  type="button"
                  className="cb-modal-btn cb-modal-btn-secondary"
                  onClick={handleCancel}
                >
                  {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
                  {modal.cancelLabel}
                {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
                </button>
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              )}

              {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `button` element here. The `type`, `className`, `onClick` attributes pass the exact values this element or component uses. The confirmed `cb-modal-btn`, `cb-modal-btn-primary` class names connect this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
              <button
                type="button"
                className="cb-modal-btn cb-modal-btn-primary"
                onClick={handleConfirm}
              >
                {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
                {modal.confirmLabel || 'OK'}
              {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
              </button>
            {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
            </div>
          {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
          </div>
        {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
        </div>
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      )}

      {/* PDF preview modal (new) */}
      {modal?.kind === 'pdf' && (
        // PdfPreviewModal handles Escape/backdrop UI and returns close through this provider.
        // I am opening the `PdfPreviewModal` React component here. The `open`, `title`, `subtitle`, `pdfUrl`, `onClose` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here.
        <PdfPreviewModal
          open
          title={modal.title}
          subtitle={modal.subtitle}
          pdfUrl={modal.pdfUrl}
          onClose={closeModal}
        />
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      )}
    {/* I am keeping this line here because the surrounding ModalProvider.jsx workflow expects this value or operation before it continues. */}
    </ModalContext.Provider>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `useModal` as a named helper so the surrounding workflow can call this step when it needs it.
export function useModal() {
  // Fail near the calling component if a future editor mount forgets ModalProvider.
  const ctx = useContext(ModalContext);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  // This return sends the completed value or response back to the code that called this function.
  return ctx;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}