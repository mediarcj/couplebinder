// File: binder-editor/src/PageList.jsx
// Description: Page list sidebar component
// Purpose: Show pages and allow selection, add/remove pages

import React from 'react';
import { useModal } from './ModalProvider';

function PageList({
  pages,
  selectedPageIndex,
  onSelectPage,
  onAddPage,
  onDeletePage,
  sectionLabels = {}
}) {
  const { openModal } = useModal();

  const hasPages = Array.isArray(pages) && pages.length > 0;
  const selectedPage =
    hasPages &&
    selectedPageIndex >= 0 &&
    selectedPageIndex < pages.length
      ? pages[selectedPageIndex]
      : null;

  function handleDeleteClick() {
    // Guard: if there are no pages, do nothing (button still visible though)
    if (!hasPages || selectedPageIndex == null) {
      return;
    }

    const label =
      selectedPage && typeof selectedPage.pageIndex === 'number'
        ? `Page ${selectedPage.pageIndex + 1}`
        : 'this page';

    openModal({
      title: 'Delete page?',
      body: `Are you sure you want to delete ${label}? This cannot be undone.`,
      confirmLabel: 'Delete page',
      cancelLabel: 'Cancel',
      onConfirm: async () => {
        onDeletePage(selectedPageIndex);
      }
    });
  }

  return (
    <aside className="binder-editor-page-list bg-white">
      <div className="page-list-header">
        <h3 className="text-slate-900 font-semibold">Pages</h3>

        <div className="page-list-actions">
          <button
            type="button"
            className="btn btn-small page-list-icon-btn shadow-sm"
            onClick={onAddPage}
            title="Add new page"
          >
            +
          </button>

          {/* Always visible; click is safely guarded above */}
          <button
            type="button"
            className="btn btn-small page-list-icon-btn page-list-icon-btn-danger shadow-sm"
            onClick={handleDeleteClick}
            title={hasPages ? 'Delete selected page' : 'No page to delete'}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="page-list-items">
        {hasPages ? (
          pages.map((page, idx) => (
            <button
              key={idx}
              type="button"
              className={`page-thumb ${
                idx === selectedPageIndex ? 'active' : ''
              }`}
              onClick={() => onSelectPage(idx)}
            >
              Page {(page.pageIndex ?? idx) + 1}
              {page.sectionKey && (
                <span className="page-thumb-section">
                  {sectionLabels[page.sectionKey] || page.sectionKey}
                </span>
              )}
              {page.layers && page.layers.length > 0 && (
                <span className="page-thumb-count">
                  {page.layers.length} layers
                </span>
              )}
            </button>
          ))
        ) : (
          <p className="page-list-empty">
            No pages yet. Add a page to start.
          </p>
        )}
      </div>
    </aside>
  );
}

export default PageList;