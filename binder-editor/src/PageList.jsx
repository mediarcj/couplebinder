// File: binder-editor/src/PageList.jsx
// Description: Page list sidebar component
// Purpose: Show pages and allow selection, add/remove pages

import React, { useMemo, useState, useRef, useEffect } from 'react';
// I am importing `useModal` from `./ModalProvider` here because PageList.jsx uses it in the steps below.
import { useModal } from './ModalProvider';

// I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
import {
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  DndContext,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  PointerSensor,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  MouseSensor,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  TouchSensor,  
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  useSensor,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  useSensors,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  closestCenter
// I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
} from '@dnd-kit/core';
// I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
import {
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  SortableContext,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  useSortable,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  verticalListSortingStrategy
// I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
} from '@dnd-kit/sortable';
// I am importing `CSS` from `@dnd-kit/utilities` here because PageList.jsx uses it in the steps below.
import { CSS } from '@dnd-kit/utilities';
// I am importing `restrictToVerticalAxis` from `@dnd-kit/modifiers` here because PageList.jsx uses it in the steps below.
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

// I am keeping `SortablePageTab` as a named helper so the surrounding workflow can call this step when it needs it.
function SortablePageTab({
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  page,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  idx,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  isActive,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  sectionLabels,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  onSelectPage
// I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
}) {
  // dnd-kit returns the DOM bindings and live transform for this page's stable App ID.
  const {
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    attributes,
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    listeners,
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    setNodeRef,
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    transform,
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    transition,
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    isDragging
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  } = useSortable({
    // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
    id: page.id
    // Allow default animations for smooth transitions
  });

  // Keep vertical-only, but let dnd-kit handle transforms normally
  const safeTransform =
    // Ignore horizontal movement so the tab follows only the vertical page list.
    transform && typeof transform === 'object' ? { ...transform, x: 0 } : transform;

  // I am saving `style` here so the nearby steps can reuse the same value without rebuilding it each time.
  const style = {
    // I am keeping the `transform` field in this object so the receiving code can read that value by its expected name.
    transform: CSS.Transform.toString(safeTransform),
    // I am keeping the `transition` field in this object so the receiving code can read that value by its expected name.
    transition: isDragging ? undefined : transition
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // Pointer release after a drag can also produce a click. Remember the drag briefly so
  // dropping a page does not immediately select it as a second, unintended action.
  const justDraggedRef = useRef(false);

  // Reset flag when drag ends
  useEffect(() => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!isDragging && justDraggedRef.current) {
      // Leave the guard up through the synthetic click that can follow pointer release.
      // Clear flag after a short delay to allow click handler to check it
      const timer = setTimeout(() => {
        // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
        justDraggedRef.current = false;
      // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
      }, 100);
      // This return sends the completed value or response back to the code that called this function.
      return () => clearTimeout(timer);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (isDragging) {
      // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
      justDraggedRef.current = true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  }, [isDragging]);

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    // I am opening the `button` element here. The `ref`, `spread values`, `spread values`, `style`, `type`, `className`, `onClick`, `aria-pressed`, `aria-current` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. The accessibility attributes give assistive technology the label or role already chosen for this control.
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
        // App owns selectedPage, so this tab reports its current array index upward.
        onSelectPage(idx);
      }}
      aria-pressed={isActive}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-tab-number` class name connects this markup to matching rules in App.css. */}
      <span className="page-tab-number">{(page.pageIndex ?? idx) + 1}</span>

      {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
      {page.sectionKey && (
        // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
        // I am opening the `span` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-tab-section` class name connects this markup to matching rules in App.css.
        <span className="page-tab-section">
          {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
          {sectionLabels[page.sectionKey] || page.sectionKey}
        {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
        </span>
      // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
      )}
    {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
    </button>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `PageList` as a named helper so the surrounding workflow can call this step when it needs it.
function PageList({
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  pages,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  selectedPageIndex,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  onSelectPage,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  onAddPage,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  onDeletePage,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  onReorderPages,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  sectionLabels = {},
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  mobileOverlayOpen = false,
  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
  onCloseMobileOverlay
// I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
}) {
  // ModalProvider owns confirmation UI while App owns the actual page deletion callback.
  const { openModal } = useModal();

  // Keep a guarded selected-page reference for labels and delete availability.
  const hasPages = Array.isArray(pages) && pages.length > 0;
  // I am saving `selectedPage` here so the nearby steps can reuse the same value without rebuilding it each time.
  const selectedPage =
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    hasPages &&
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    selectedPageIndex >= 0 &&
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    selectedPageIndex < pages.length
      // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
      ? pages[selectedPageIndex]
      // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
      : null;

  // I am saving `sensors` here so the nearby steps can reuse the same value without rebuilding it each time.
  const sensors = useSensors(
    // The small threshold preserves normal click/tap selection while still making page
    // reorder feel immediate across mouse, touch, and pointer-capable browsers.
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 } // small drag threshold = nicer UX
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }),
    // I am calling this helper here so the current workflow performs this step before it moves on.
    useSensor(MouseSensor, {
      // I am keeping the `activationConstraint` field in this object so the receiving code can read that value by its expected name.
      activationConstraint: { distance: 6 }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }),
    // I am calling this helper here so the current workflow performs this step before it moves on.
    useSensor(TouchSensor, {
      // I am keeping the `activationConstraint` field in this object so the receiving code can read that value by its expected name.
      activationConstraint: { distance: 6 }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    })
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am saving `itemIds` here so the nearby steps can reuse the same value without rebuilding it each time.
  const itemIds = useMemo(
    // SortableContext needs the same stable IDs used by each SortablePageTab.
    () => (hasPages ? pages.map((p) => p.id) : []),
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    [hasPages, pages]
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );

  // I am keeping `handleDeleteClick` as a named helper so the surrounding workflow can call this step when it needs it.
  function handleDeleteClick() {
    // Stop before opening a modal when the current selection is not a real page.
    if (!hasPages || selectedPageIndex == null) return;

    // I am saving `label` here so the nearby steps can reuse the same value without rebuilding it each time.
    const label =
      // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
      selectedPage && typeof selectedPage.pageIndex === 'number'
        // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
        ? `Page ${selectedPage.pageIndex + 1}`
        // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
        : 'this page';

    // I am calling this helper here so the current workflow performs this step before it moves on.
    openModal({
      // App.handleDeletePage performs reference-aware storage cleanup after confirmation.
      title: 'Delete page?',
      // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
      body: `Are you sure you want to delete ${label}? This cannot be undone.`,
      // I am keeping the `confirmLabel` field in this object so the receiving code can read that value by its expected name.
      confirmLabel: 'Delete page',
      // I am keeping the `cancelLabel` field in this object so the receiving code can read that value by its expected name.
      cancelLabel: 'Cancel',
      // I am keeping the `onConfirm` field in this object so the receiving code can read that value by its expected name.
      onConfirm: async () => {
        // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
        await onDeletePage?.(selectedPageIndex);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This return sends the completed value or response back to the code that called this function.
  return (
    // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
    // I am opening the `aside` element here. The `className` attribute passes the exact values this element or component uses.
    <aside className={`binder-editor-page-list bg-white ${mobileOverlayOpen ? 'mobile-overlay-open' : ''}`}>
      {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-list-header` class name connects this markup to matching rules in App.css. */}
      <div className="page-list-header">
        {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
        {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-list-actions` class name connects this markup to matching rules in App.css. */}
        <div className="page-list-actions">
            {/* Mobile close button - appears first on mobile */}
            {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `title` attributes pass the exact values this element or component uses. The confirmed `mobile-page-list-close-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
            <button
              type="button"
              className="mobile-page-list-close-btn"
              onClick={onCloseMobileOverlay}
              title="Close pages"
            >
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              </svg>
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            </button>
            
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-list-actions-group` class name connects this markup to matching rules in App.css. */}
            <div className="page-list-actions-group">
          {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `button` element here. The `type`, `className`, `onClick`, `title` attributes pass the exact values this element or component uses. The confirmed `page-tab-add-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
          <button
            type="button"
            className="page-tab-add-btn"
            onClick={onAddPage}
            title="Add new page"
          >
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            </svg>
          {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
          </button>

          {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
          {hasPages && selectedPageIndex != null && (
            // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
            // I am opening the `button` element here. The `type`, `className`, `onClick`, `title` attributes pass the exact values this element or component uses. The confirmed `page-tab-delete-btn` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here.
            <button
              type="button"
              className="page-tab-delete-btn"
              onClick={handleDeleteClick}
              title="Delete selected page"
            >
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              </svg>
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            </button>
          // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
          )}
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            </div>
        {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
        </div>
      {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
      </div>

      {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
      {/* I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-tabs-container` class name connects this markup to matching rules in App.css. */}
      <div className="page-tabs-container">
        {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
        {hasPages ? (
          // Existing pages enter dnd-kit; an empty binder gets a simpler first-page action.
          // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-tabs-dnd-wrapper` class name connects this markup to matching rules in App.css.
          <div className="page-tabs-dnd-wrapper">
          {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
          {/* I am opening the `DndContext` React component here. The `sensors`, `collisionDetection`, `modifiers`, `onDragEnd` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here. */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
            onDragEnd={(e) => {
              // Stable page IDs are the contract with App; indexes are derived only after
              // dnd-kit tells us which logical pages moved.
              const activeId = e.active?.id;
              const overId = e.over?.id;
              if (!activeId || !overId) return;
              if (activeId === overId) return;

              const fromIndex = pages.findIndex((p) => p?.id === activeId);
              // Convert stable drag IDs back to the indexes App uses for immutable reorder.
              const toIndex = pages.findIndex((p) => p?.id === overId);
              if (fromIndex < 0 || toIndex < 0) return;

              onReorderPages?.(fromIndex, toIndex);
            }}
          >
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `SortableContext` React component here. The `items`, `strategy` attributes pass the exact values this element or component uses. */}
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              {/* I am mapping the collection here so each input item becomes the output shape expected by the next step. */}
              {pages.map((page, idx) => {
                // I am saving `isActive` here so the nearby steps can reuse the same value without rebuilding it each time.
                const isActive = idx === selectedPageIndex;
                // This return sends the completed value or response back to the code that called this function.
                return (
                  // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
                  // I am opening the `SortablePageTab` React component here. The `key`, `page`, `idx`, `isActive`, `sectionLabels`, `onSelectPage` attributes pass the exact values this element or component uses. The event attribute forwards the existing handler instead of creating separate state here.
                  <SortablePageTab
                    key={page.id || idx}
                    page={page}
                    idx={idx}
                    isActive={isActive}
                    sectionLabels={sectionLabels}
                    onSelectPage={onSelectPage}
                  />
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                );
              // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
              })}
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            </SortableContext>
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            </DndContext>
                    {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
                    </div>
        // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
        ) : (
          // I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues.
          // I am opening the `div` element here. The `className` attribute passes the exact values this element or component uses. The confirmed `page-tabs-empty` class name connects this markup to matching rules in App.css.
          <div className="page-tabs-empty">
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            {/* I am opening the `button` element here. The `type`, `className`, `onClick` attributes pass the exact values this element or component uses. The confirmed `page-tab-add-first` class name connects this markup to matching rules in App.css. The event attribute forwards the existing handler instead of creating separate state here. */}
            <button
              type="button"
              className="page-tab-add-first"
              onClick={onAddPage}
            >
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `svg` element here. The `className`, `fill`, `stroke`, `viewBox` attributes pass the exact values this element or component uses. */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
                {/* I am opening the `path` element here. The `strokeLinecap`, `strokeLinejoin`, `strokeWidth`, `d` attributes pass the exact values this element or component uses. */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              </svg>
              {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
              {/* I am opening the `span` element here. It does not need any attributes at this point. */}
              <span>Add first page</span>
            {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
            </button>
          {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
          </div>
        // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
        )}
      {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
      </div>
    {/* I am keeping this line here because the surrounding PageList.jsx workflow expects this value or operation before it continues. */}
    </aside>
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this as the main value from PageList.jsx so the module that imports this file receives the intended entry point.
export default PageList;