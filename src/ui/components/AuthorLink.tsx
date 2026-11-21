import type { ReactNode } from 'react';
import { openAuthor } from '../state/useOpenAuthor';

/**
 * A person, as a button that opens them on the Authors view (openAuthor):
 * the detail pane's PR author, Review stats' reviewers and the Authors
 * view's "Reviewed most by". `children` is how they're shown
 * (ActorIdentity, or an avatar and name), and so the button's name; what
 * it does is its description and hover title.
 */
export function AuthorLink({
  login,
  fallbackName,
  className,
  title,
  children,
}: {
  login: string | null | undefined;
  fallbackName?: string;
  className?: string;
  // On hover; "Open on Authors" when not given.
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={['author-link', className].filter(Boolean).join(' ')}
      title={title || 'Open on Authors'}
      aria-description="Opens them on the Authors view"
      onClick={(event) => openAuthor(login, fallbackName, event.currentTarget)}
    >
      {children}
    </button>
  );
}
