/**
 * CopyIconButton - a small icon-only "copy to clipboard" button.
 *
 * The page's IconButton with the `copy` icon (an SVG, `check` once copied),
 * sized for a line of text by `.insight-copy-btn` in styles/insights.css. It
 * adds no text to its surroundings - useful when it sits next to a value that
 * other code/tests locate by exact text.
 *
 * When `html` is provided alongside `text`, this writes a rich clipboard
 * item (`text/plain` + `text/html`) so pasting into a rich-text target
 * (Slack, docs, email) keeps any link/formatting in `html`, while pasting
 * into a plain-text target falls back to `text`. If the browser doesn't
 * support multi-mime clipboard writes (or the write is rejected), it falls
 * back to a plain `writeText(text)` call.
 *
 * @module components/CopyIconButton
 */

import { useState, type MouseEvent } from 'react';
import { IconButton } from './ui/Button';

export interface CopyIconButtonProps {
  text: string | undefined;
  html?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function CopyIconButton({ text, html, label = 'Copy', disabled = false, className = '' }: CopyIconButtonProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const writePlainText = async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    return false;
  };

  const handleCopy = async (event: MouseEvent) => {
    event.stopPropagation();
    if (!text) return;

    let wrote = false;
    try {
      if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
          const item = new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          });
          await navigator.clipboard.write([item]);
          wrote = true;
        } catch (_richError) {
          // Some browsers/contexts restrict multi-mime clipboard writes;
          // fall back to plain text below.
        }
      }
      if (!wrote) {
        wrote = await writePlainText(text);
      }
    } catch (_error) {
      wrote = false;
    }

    setCopyState(wrote ? 'copied' : 'error');
    setTimeout(() => setCopyState('idle'), 1200);
  };

  const title = copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Copy unavailable' : label;

  // The page's icon button (its look, and its label as a tooltip), with the
  // copy icon - a check once copied.
  return (
    <IconButton
      icon={copyState === 'copied' ? 'check' : 'copy'}
      label={title}
      className={`insight-copy-btn${copyState === 'copied' ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleCopy}
      disabled={disabled || !text}
    />
  );
}
