/** @jest-environment jsdom */

import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabPanel, Tabs, type TabItem } from './Tabs';

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity', badge: '41' },
  { id: 'conversations', label: 'Conversations', badge: '6 open', badgeTone: 'attention' },
  { id: 'notes', label: 'Notes' },
];

function Harness({ initial = 'overview' }: { initial?: string }) {
  const [selected, setSelected] = useState(initial);
  return (
    <>
      <Tabs label="PR #412 details" idPrefix="pr-412" tabs={TABS} selectedId={selected} onSelect={setSelected} />
      <TabPanel idPrefix="pr-412" tabId={selected}>
        Content for {selected}
      </TabPanel>
    </>
  );
}

describe('Tabs', () => {
  test('renders a named tab list with badges, and labels the panel by the selected tab', () => {
    render(<Harness initial="activity" />);

    expect(screen.getByRole('tablist', { name: 'PR #412 details' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activity 41', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Conversations 6 open', selected: false })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel', { name: 'Activity 41' })).toHaveTextContent('Content for activity');
  });

  test('only the selected tab points at a panel, since only its panel exists', () => {
    render(<Harness initial="activity" />);

    const selected = screen.getByRole('tab', { name: 'Activity 41' });
    expect(selected).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id);
    screen
      .getAllByRole('tab', { selected: false })
      .forEach((tab) => expect(tab).not.toHaveAttribute('aria-controls'));
  });

  test('only the selected tab is in the Tab order', () => {
    render(<Harness />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Notes' })).toHaveAttribute('tabindex', '-1');
  });

  test('selects on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('tab', { name: 'Notes' }));
    expect(screen.getByRole('tab', { name: 'Notes', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content for notes');
  });

  test('arrow keys, Home and End move focus and selection, wrapping at the ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Notes', selected: true })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Notes', selected: true })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toHaveFocus();
  });
});
