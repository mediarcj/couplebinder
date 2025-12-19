// File: binder-editor/src/PageList.jsx
// Description: Page list sidebar component
// Purpose: Show pages and allow selection, add/remove pages

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useModal } from './ModalProvider';

import {
  DndContext,
  PointerSensor,
  MouseSensor,
  TouchSensor,  
  useSensor,
  useSensors,
  closestCenter
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

function SortablePageTab({
  page,
  idx,
  isActive,
  sectionLabels,
  onSelectPage
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: page.id
    // Allow default animations for smooth transitions
  });

  // Keep vertical-only, but let dnd-kit handle transforms normally
  const safeTransform =
    transform && typeof transform === 'object' ? { ...transform, x: 0 } : transform;

  const style = {
    transform: CSS.Transform.toString(safeTransform),
    transition: isDragging ? undefined : transition
  };

  // Track if we just finished dragging to prevent click handler
  const justDraggedRef = useRef(false);

  // Reset flag when drag ends
  useEffect(() => {
    if (!isDragging && justDraggedRef.current) {
      // Clear flag after a short delay to allow click handler to check it
      const timer = setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
    if (isDragging) {
      justDraggedRef.current = true;
    }
  }, [isDragging]);

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      type="button"
      className={`page-tab ${isActive ? 'page-tab-active' : 'page-tab-inactive'} ${
        isDragging ? 'page-tab-dragging' : ''
      }`}
      onClick={(e) => {
        // Prevent click if we just finished dragging
        if (justDraggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onSelectPage(idx);
      }}
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
}

function PageList({
  pages,
  selectedPageIndex,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onReorderPages,
  sectionLabels = {},
  mobileOverlayOpen = false,
  onCloseMobileOverlay
}) {
  const { openModal } = useModal();

  const hasPages = Array.isArray(pages) && pages.length > 0;
  const selectedPage =
    hasPages &&
    selectedPageIndex >= 0 &&
    selectedPageIndex < pages.length
      ? pages[selectedPageIndex]
      : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 } // small drag threshold = nicer UX
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const itemIds = useMemo(
    () => (hasPages ? pages.map((p) => p.id) : []),
    [hasPages, pages]
  );

  function handleDeleteClick() {
    if (!hasPages || selectedPageIndex == null) return;

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
        await onDeletePage?.(selectedPageIndex);
      }
    });
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOverlayOpen && (
        <div
          className="mobile-page-list-overlay"
          onClick={onCloseMobileOverlay}
          aria-hidden="true"
        />
      )}

      <aside className={`binder-editor-page-list bg-white ${mobileOverlayOpen ? 'mobile-overlay-open' : ''}`}>
        <div className="page-list-header">
          <div className="page-list-actions">
            {/* Mobile close button - appears first on mobile */}
            <button
              type="button"
              className="mobile-page-list-close-btn"
              onClick={onCloseMobileOverlay}
              title="Close pages"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            <div className="page-list-actions-group">
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
        </div>

      <div className="page-tabs-container">
        {hasPages ? (
          <div className="page-tabs-dnd-wrapper">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={(e) => {
                const activeId = e.active?.id;
                const overId = e.over?.id;
                if (!activeId || !overId) return;
                if (activeId === overId) return;

                const fromIndex = pages.findIndex((p) => p?.id === activeId);
                const toIndex = pages.findIndex((p) => p?.id === overId);
                if (fromIndex < 0 || toIndex < 0) return;

                onReorderPages?.(fromIndex, toIndex);
              }}
            >
              <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                {pages.map((page, idx) => {
                  const isActive = idx === selectedPageIndex;
                  return (
                    <SortablePageTab
                      key={page.id || idx}
                      page={page}
                      idx={idx}
                      isActive={isActive}
                      sectionLabels={sectionLabels}
                      onSelectPage={onSelectPage}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
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
    </>
  );
}

export default PageList;