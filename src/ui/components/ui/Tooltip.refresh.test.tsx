/** @jest-environment jsdom */

import { render } from '@testing-library/react';
import { refreshTooltips } from './tooltip-controller';
import { Tooltip } from './Tooltip';

// The real controller, with refreshTooltips counted.
jest.mock('./tooltip-controller', () => {
  const actual = jest.requireActual('./tooltip-controller');
  return { ...actual, refreshTooltips: jest.fn(actual.refreshTooltips) };
});

const tooltips = (count: number, content = 'Size: 120 lines') =>
  Array.from({ length: count }, (_, index) => (
    <Tooltip key={index} content={content}>
      <button type="button">{index}</button>
    </Tooltip>
  ));

beforeEach(() => {
  jest.mocked(refreshTooltips).mockClear();
});

// A table mounting hundreds of them used to make one refresh (and, with a
// bubble open, one re-measure) each.
test('mounting tooltips doesn’t refresh the shared bubble', () => {
  render(<>{tooltips(50)}</>);
  expect(refreshTooltips).not.toHaveBeenCalled();
});

test('a tooltip whose text changes refreshes it', () => {
  const { rerender } = render(<>{tooltips(1)}</>);
  rerender(<>{tooltips(1, 'Copied!')}</>);
  expect(refreshTooltips).toHaveBeenCalledTimes(1);
});
