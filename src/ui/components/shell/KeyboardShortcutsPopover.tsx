import { useEffect, useId } from 'react';
import { IconButton } from '../ui/Button';
import { KEYBOARD_SHORTCUTS } from '../../helpers/keyboard-shortcuts.helpers.ts';
import { useHeaderPopover } from './useHeaderPopover';

// Typing there, ? is a question mark.
const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

/**
 * The app header's `Shortcuts`: a popover listing the keyboard shortcuts by
 * where they work (KEYBOARD_SHORTCUTS), like the table's Legend
 * (useHeaderPopover). `?` shows or hides it from anywhere but a field or
 * a modal; opened that way, Esc puts the focus back where you were.
 */
export function KeyboardShortcutsPopover() {
  const titleId = useId();
  const panelId = useId();
  const { isOpen, open, close, buttonRef, panelRef, panelStyle } = useHeaderPopover();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (isEditable(event.target)) return;
      // Not over an open modal (Settings, the PR JSON dialog, the pane as a
      // drawer): the list would open behind it, taking the focus out.
      // Settings stays mounted, hidden, while closed.
      const modals = Array.from(document.querySelectorAll('[aria-modal="true"]'));
      if (modals.some((modal) => !modal.closest('[hidden]'))) return;
      event.preventDefault();
      if (isOpen) close(true);
      else open(document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="app-header-link app-header-link-button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-keyshortcuts="?"
        onClick={() => (isOpen ? close(false) : open())}
      >
        Shortcuts
      </button>
      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          className="activity-popover pr-legend-popover"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={panelStyle}
        >
          <div className="activity-popover-header">
            <h2 id={titleId} className="activity-popover-title">
              Keyboard shortcuts
            </h2>
            <IconButton icon="close" label="Close shortcuts" tooltipPlacement="bottom" onClick={() => close(true)} />
          </div>
          <div className="activity-popover-content pr-legend-content">
            {KEYBOARD_SHORTCUTS.map((group) => (
              <section key={group.where} className="pr-legend-group" aria-label={group.where}>
                <h3 className="settings-heading">{group.where}</h3>
                <dl className="pr-legend-list">
                  {group.shortcuts.map((shortcut) => (
                    <div key={shortcut.action} className="pr-legend-entry">
                      <dt className="pr-legend-mark shortcuts-keys">
                        {shortcut.keys.map((key, index) => (
                          <span key={key}>
                            {index > 0 && <span className="shortcuts-or"> or </span>}
                            <kbd>{key}</kbd>
                          </span>
                        ))}
                      </dt>
                      <dd>{shortcut.action}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
