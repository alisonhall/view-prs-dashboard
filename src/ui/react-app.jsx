/**
 * React App Entry Point for view-prs
 *
 * Phase 1: Hybrid React Table Migration
 * - Mounts React only for PR table rendering
 * - Keeps vanilla JS for filters, controls, and other tabs
 * - Provides bridge between vanilla JS and React
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrTableApp } from './components/PrTableApp';

/**
 * Mount React app for PR table
 *
 * @param {HTMLElement} containerElement - DOM element to mount React into
 * @param {Object} props - Initial props for PrTableApp
 * @param {Object} props.initialPayload - Initial PR data payload
 * @param {string} props.selectedRepo - Currently selected repository
 * @param {Function} props.onCheckboxChange - Callback for checkbox changes
 * @param {Function} props.onAckAction - Callback for Ack button clicks
 * @returns {Object} React root instance (for unmounting if needed)
 */
export function mountReactPrTable(containerElement, props) {
  if (!containerElement) {
    console.error('[React Migration] Cannot mount: container element not found');
    return null;
  }

  console.log('[React Migration] Mounting React PR table...');

  const root = ReactDOM.createRoot(containerElement);

  // Store props reference for updates
  let currentProps = { ...props };

  // Create update function
  const updateTable = (newPayload, newSelectedRepo) => {
    console.log('[React Migration] Updating React table with new data...');
    currentProps = {
      ...currentProps,
      initialPayload: newPayload,
      selectedRepo: newSelectedRepo || currentProps.selectedRepo,
    };
    root.render(<PrTableApp {...currentProps} />);
  };

  // Expose update function globally
  if (typeof window !== 'undefined') {
    window.updateReactPrTable = updateTable;
  }

  // Render the actual PrTableApp component
  root.render(<PrTableApp {...currentProps} />);

  console.log('[React Migration] React PR table mounted successfully');
  return root;
}

/**
 * Expose mounting function globally for vanilla JS to call
 * This allows the existing index.page.js to mount the React app
 */
if (typeof window !== 'undefined') {
  window.mountReactPrTable = mountReactPrTable;
  console.log('[React Migration] mountReactPrTable() exposed globally');

  // react-app.jsx is loaded as an ES module, which the browser always defers
  // until after classic scripts (including index.page.js) have run. If the
  // initial PR data fetch in index.page.js resolves before this module graph
  // finishes loading, its first renderPrData() call falls back to vanilla
  // rendering since window.mountReactPrTable isn't defined yet. Announce
  // readiness so index.page.js can retry once React is actually available.
  window.dispatchEvent(new CustomEvent('viewprs:react-ready'));
}
