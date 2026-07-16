// Description: Entry point for React binder editor
// Purpose: Mount React app into EJS page and initialize client-side runtime inputs.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ModalProvider } from './ModalProvider';
import { setCsrfToken } from './api';
// Tailwind supplies the utility classes used throughout the editor components.
import './tailwind.css';

const rootEl = document.getElementById('binder-editor-root');

if (!rootEl) {
  console.error('[BinderEditor] Root element #binder-editor-root not found');
} else {
  const binderId = (rootEl.getAttribute('data-binder-id') || '').trim();
  const csrfToken = (rootEl.getAttribute('data-csrf-token') || '').trim();

  if (!binderId) {
    console.error('[BinderEditor] Missing data-binder-id attribute');
  } else {
    // Initialize API layer once (single source of truth for CSRF header behavior).
    setCsrfToken(csrfToken);

    const root = ReactDOM.createRoot(rootEl);
    root.render(
      // ModalProvider gives App one shared owner for confirmations and PDF previews.
      <React.StrictMode>
        <ModalProvider>
          <App binderId={binderId} csrfToken={csrfToken} />
        </ModalProvider>
      </React.StrictMode>
    );
  }
}
