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
        <div className="page-list-actions">
          <button
            type="button"
            className="page-tab-add-btn"
            onClick={onAddPage}
            title="Add new page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {hasPages && selectedPageIndex != null && (
            <button
              type="button"
              className="page-tab-delete-btn"
              onClick={handleDeleteClick}
              title="Delete selected page"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="page-tabs-container">
        {hasPages ? (
          pages.map((page, idx) => {
            const isActive = idx === selectedPageIndex;
            return (
              <button
                key={idx}
                type="button"
                className={`page-tab ${isActive ? 'page-tab-active' : 'page-tab-inactive'}`}
                onClick={() => onSelectPage(idx)}
                aria-pressed={isActive}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="page-tab-number">{(page.pageIndex ?? idx) + 1}</span>
                {page.sectionKey && (
                  <span className="page-tab-section">
                    {sectionLabels[page.sectionKey] || page.sectionKey}
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <div className="page-tabs-empty">
            <button
              type="button"
              className="page-tab-add-first"
              onClick={onAddPage}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add first page</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export default PageList;