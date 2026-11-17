import { useEffect } from 'react';

/**
 * While dirty, the browser asks before the page is reloaded or closed -
 * edits not yet saved would be lost. (Closing Settings keeps them: a
 * section stays mounted once opened.)
 */
export const useWarnBeforeLeaving = (dirty: boolean) => {
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers want returnValue set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
};
