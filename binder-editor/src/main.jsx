// File: binder-editor/src/main.jsx
// Description: Entry point for React binder editor
// Purpose: Mount React app into EJS page and initialize client-side runtime inputs.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ModalProvider } from './ModalProvider';
import { setCsrfToken } from './api';
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
      <React.StrictMode>
        <ModalProvider>
          <App binderId={binderId} csrfToken={csrfToken} />
        </ModalProvider>
      </React.StrictMode>
    );
  }
}