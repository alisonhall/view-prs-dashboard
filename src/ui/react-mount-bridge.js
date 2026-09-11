/**
 * React Mount Bridge
 * 
 * This module provides the bridge between vanilla JS and React for the PR table.
 * It exposes functions that vanilla JS can call to mount/update the React app.
 * 
 * Phase 1: Hybrid React Table Migration
 * - React handles PR table rendering
 * - Vanilla JS manages filters, controls, and other tabs
 * - Communication via callbacks and updateReactPrTable()
 */

(function (global) {
  'use strict';

  // Store React root instance for updates
  let reactRootInstance = null;
  let currentUpdateCallback = null;

  /**
   * Mount React PR table
   * Called by vanilla JS when ready to switch to React rendering
   * 
   * @param {HTMLElement} container - DOM element to mount into (pr-sections)
   * @param {Object} initialData - Initial data to render
   * @param {Object} initialData.payload - PR data payload
   * @param {string} initialData.selectedRepo - Currently selected repository
   * @param {string[]} [initialData.visiblePrNumbers] - PR numbers that pass
   *   the active local filters (scope/PR-number/label/author/assigned/
   *   approver); null/undefined means "no filter, show everything"
   * @param {Function} callbacks - Callback functions for React → vanilla JS
   * @param {Function} callbacks.onCheckboxChange - Handle checkbox changes
   * @param {Function} callbacks.onAckAction - Handle Ack button clicks
   * @returns {boolean} True if mounted successfully
   */
  function mountReactTable(container, initialData, callbacks) {
    if (!container) {
      console.error('[ReactBridge] Cannot mount: no container element');
      return false;
    }

    if (!global.mountReactPrTable || typeof global.mountReactPrTable !== 'function') {
      console.error('[ReactBridge] mountReactPrTable not available - is react-app.jsx loaded?');
      return false;
    }

    console.log('[ReactBridge] Mounting React PR table...');

    try {
      // Clear vanilla JS content
      container.innerHTML = '';

      // Mount React
      reactRootInstance = global.mountReactPrTable(container, {
        initialPayload: initialData.payload || {},
        selectedRepo: initialData.selectedRepo || '',
        visiblePrNumbers: initialData.visiblePrNumbers || null,
        onCheckboxChange: callbacks.onCheckboxChange || (() => {}),
        onAckAction: callbacks.onAckAction || (() => {}),
      });

      // Store update callback if provided
      if (global.updateReactPrTable && typeof global.updateReactPrTable === 'function') {
        currentUpdateCallback = global.updateReactPrTable;
      }

      console.log('[ReactBridge] React PR table mounted successfully');
      return true;
    } catch (error) {
      console.error('[ReactBridge] Error mounting React:', error);
      return false;
    }
  }

  /**
   * Update React PR table with new data
   * Called by vanilla JS when data changes (polling, filter changes, etc.)
   * 
   * @param {Object} payload - New PR data payload
   * @param {string} selectedRepo - Currently selected repository
   * @param {string[]} [visiblePrNumbers] - PR numbers that pass the active
   *   local filters; null/undefined means "no filter, show everything"
   */
  function updateReactTable(payload, selectedRepo, visiblePrNumbers) {
    if (!currentUpdateCallback) {
      console.warn('[ReactBridge] Cannot update: React not mounted or update callback unavailable');
      return;
    }

    try {
      currentUpdateCallback(payload, selectedRepo, visiblePrNumbers);
    } catch (error) {
      console.error('[ReactBridge] Error updating React:', error);
    }
  }

  /**
   * Unmount React PR table
   * Called when switching away from React or cleaning up
   */
  function unmountReactTable() {
    if (reactRootInstance && reactRootInstance.unmount) {
      console.log('[ReactBridge] Unmounting React PR table...');
      try {
        reactRootInstance.unmount();
        reactRootInstance = null;
        currentUpdateCallback = null;
        console.log('[ReactBridge] React PR table unmounted');
      } catch (error) {
        console.error('[ReactBridge] Error unmounting React:', error);
      }
    }
  }

  /**
   * Check if React table is mounted
   * @returns {boolean} True if React is currently mounted
   */
  function isReactMounted() {
    return reactRootInstance !== null;
  }

  // Expose bridge API globally
  global.ReactMountBridge = {
    mount: mountReactTable,
    update: updateReactTable,
    unmount: unmountReactTable,
    isMounted: isReactMounted,
  };

  console.log('[ReactBridge] Bridge initialized and exposed as window.ReactMountBridge');

})(typeof window !== 'undefined' ? window : globalThis);
