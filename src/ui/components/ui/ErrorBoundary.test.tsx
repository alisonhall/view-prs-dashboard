/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { ErrorNotice } from '../shell/ErrorNotice';
import { ErrorBoundary } from './ErrorBoundary';

function Broken({ thrown }: { thrown: unknown }): never {
  throw thrown;
}

const fallback = (error: Error) => <p role="alert">Failed: {error.message}</p>;

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; the tests check what's shown instead.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.mocked(console.error).mockRestore();
  });

  test('renders its children while they render', () => {
    render(<ErrorBoundary fallback={fallback}>Fine</ErrorBoundary>);
    expect(screen.getByText('Fine')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('shows the fallback, with the error, when a child throws; its siblings outside carry on', () => {
    render(
      <>
        <ErrorBoundary fallback={fallback}>
          <Broken thrown={new Error('bad row')} />
        </ErrorBoundary>
        <p>Outside</p>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed: bad row');
    expect(screen.getByText('Outside')).toBeInTheDocument();
  });

  test('a thrown non-Error still gets a message', () => {
    render(
      <ErrorBoundary fallback={fallback}>
        <Broken thrown="chunk failed" />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed: chunk failed');
  });
});

describe('ErrorNotice', () => {
  // (jsdom's window.location can't be replaced, so Reload's click isn't
  // followed here.)
  test('says what couldn’t be shown and why, with a Reload button', () => {
    render(<ErrorNotice title="This view couldn't be shown." error={new Error('bad row')} />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent("This view couldn't be shown.");
    expect(notice).toHaveTextContent('bad row');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});
