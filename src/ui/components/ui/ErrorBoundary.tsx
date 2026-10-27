import { Component, type ReactNode } from 'react';

/**
 * Shows `fallback` in place of its children when rendering them throws,
 * or a lazy part's code fails to load - so one failure doesn't unmount
 * the whole page. React still logs the error to the console.
 */
export interface ErrorBoundaryProps {
  fallback: (error: Error) => ReactNode;
  children?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
