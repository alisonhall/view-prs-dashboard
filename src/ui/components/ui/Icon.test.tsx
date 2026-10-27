/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { Icon, ICON_NAMES } from './Icon';

describe('Icon', () => {
  test('is hidden from assistive tech when it has no label', () => {
    const { container } = render(<Icon name="flag" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  test('is announced as an image with its label', () => {
    render(<Icon name="flag" label="Flagged" />);

    expect(screen.getByRole('img', { name: 'Flagged' })).toBeInTheDocument();
  });

  test('uses the given size and class', () => {
    const { container } = render(<Icon name="check" size={13} className="extra" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('width', '13');
    expect(svg).toHaveAttribute('height', '13');
    expect(svg).toHaveClass('ui-icon', 'extra');
  });

  test('draws something for every icon name', () => {
    ICON_NAMES.forEach((name) => {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('svg')?.childElementCount).toBeGreaterThan(0);
      unmount();
    });
  });
});
