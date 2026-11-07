/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { ViewHeading } from './ViewHeading';

describe('ViewHeading', () => {
  test("names the view as an h2 (the header's h1 is the app's name), with what it's for under it", () => {
    render(<ViewHeading title="Review stats" description="How each reviewer reviews." />);
    expect(screen.getByRole('heading', { level: 2, name: 'Review stats' })).toBeInTheDocument();
    expect(screen.getByText('How each reviewer reviews.')).toBeInTheDocument();
  });
});
