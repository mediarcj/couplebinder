// File: binder-editor/src/main.jsx
// Description: Entry point for React binder editor
// Purpose: Mount React app into EJS page

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ModalProvider } from './ModalProvider';

const rootEl = document.getElementById('binder-editor-root');

if (!rootEl) {
  console.error('[BinderEditor] Root element #binder-editor-root not found');
} else {
  const binderId = rootEl.getAttribute('data-binder-id') || '';
  const csrfToken = rootEl.getAttribute('data-csrf-token') || '';

  if (!binderId) {
    console.error('[BinderEditor] Missing data-binder-id attribute');
  } else {
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