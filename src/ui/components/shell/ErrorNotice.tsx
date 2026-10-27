import { Button } from '../ui/Button';

/**
 * What an ErrorBoundary shows: what couldn't be shown, the error's
 * message, and Reload. Reads no Context, so it works above the Providers
 * too (react-app.tsx's boundary).
 */
export interface ErrorNoticeProps {
  title: string;
  error: Error;
}

export function ErrorNotice({ title, error }: ErrorNoticeProps) {
  return (
    <div className="app-error" role="alert">
      <p className="app-error-title">{title}</p>
      {error.message && <p className="app-error-detail">{error.message}</p>}
      <Button icon="refresh" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}
