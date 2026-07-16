// File: binder-editor/src/main.jsx
// Description: Entry point for React binder editor
// Purpose: Mount React app into EJS page and initialize client-side runtime inputs.

import React from 'react';
// I am importing `ReactDOM` from `react-dom/client` here because main.jsx uses it in the steps below.
import ReactDOM from 'react-dom/client';
// I am importing `App` from `./App` here because main.jsx uses it in the steps below.
import App from './App';
// I am importing `ModalProvider` from `./ModalProvider` here because main.jsx uses it in the steps below.
import { ModalProvider } from './ModalProvider';
// I am importing `setCsrfToken` from `./api` here because main.jsx uses it in the steps below.
import { setCsrfToken } from './api';
// I am loading `./tailwind.css` here because its setup work is needed before the rest of main.jsx runs.
import './tailwind.css';

// I am saving `rootEl` here so the nearby steps can reuse the same value without rebuilding it each time.
const rootEl = document.getElementById('binder-editor-root');

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (!rootEl) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  console.error('[BinderEditor] Root element #binder-editor-root not found');
// This alternative runs only when the condition above did not use its first path.
} else {
  // I am saving `binderId` here so the nearby steps can reuse the same value without rebuilding it each time.
  const binderId = (rootEl.getAttribute('data-binder-id') || '').trim();
  // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const csrfToken = (rootEl.getAttribute('data-csrf-token') || '').trim();

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!binderId) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    console.error('[BinderEditor] Missing data-binder-id attribute');
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // Initialize API layer once (single source of truth for CSRF header behavior).
    setCsrfToken(csrfToken);

    // I am saving `root` here so the nearby steps can reuse the same value without rebuilding it each time.
    const root = ReactDOM.createRoot(rootEl);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    root.render(
      // I am keeping this line here because the surrounding main.jsx workflow expects this value or operation before it continues.
      // I am opening the `React.StrictMode` React component here. It does not need any attributes at this point.
      <React.StrictMode>
        {/* I am keeping this line here because the surrounding main.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `ModalProvider` React component here. It does not need any attributes at this point. */}
        <ModalProvider>
          {/* I am keeping this line here because the surrounding main.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `App` React component here. The `binderId`, `csrfToken` attributes pass the exact values this element or component uses. */}
          <App binderId={binderId} csrfToken={csrfToken} />
        {/* I am keeping this line here because the surrounding main.jsx workflow expects this value or operation before it continues. */}
        </ModalProvider>
      {/* I am keeping this line here because the surrounding main.jsx workflow expects this value or operation before it continues. */}
      </React.StrictMode>
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}