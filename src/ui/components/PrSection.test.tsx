/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import type { PrEntry } from '../types/pr-data.ts';
import { PrSection, type PrSectionData } from './PrSection';

const entry = (number: string, data: Partial<NonNullable<PrEntry['data']>> = {}): PrEntry => ({
  prNumber: number,
  repo: 'owner/repo',
  section: 'open',
  data: { number, title: `PR ${number}`, ...data },
});

const renderSection = (section: Partial<PrSectionData> = {}, isOpen = true, onToggleSection = jest.fn()) => {
  render(
    <PrSection
      section={{ key: 'open', title: 'Open PRs', prs: [entry('1')], ...section }}
      isOpen={isOpen}
      onToggleSection={onToggleSection}
      repo="owner/repo"
      expandedInsights={{}}
      onToggleInsights={jest.fn()}
    />,
  );
  return { onToggleSection };
};

describe('PrSection', () => {
  test('is a <details> named by its title, and so is its table', () => {
    renderSection();
    const group = screen.getByRole('group', { name: 'Open PRs' });
    expect(group.tagName).toBe('DETAILS');
    expect(group).toHaveAttribute('data-pr-section', 'open');
    expect(screen.getByRole('table', { name: 'Open PRs' })).toBeInTheDocument();
  });

  test('the header shows the title and the total count', () => {
    renderSection({ prs: [entry('1')], totalCount: 3 });
    expect(document.querySelector('.pr-section-title')).toHaveTextContent('Open PRs');
    expect(document.querySelector('.pr-section-count')).toHaveTextContent('3');
  });

  test('the count falls back to the rendered rows', () => {
    renderSection({ prs: [entry('1'), entry('2')] });
    expect(document.querySelector('.pr-section-count')).toHaveTextContent('2');
  });

  test('is open or closed as told', () => {
    renderSection({}, false);
    expect(screen.getByRole('group', { name: 'Open PRs' })).not.toHaveAttribute('open');
  });

  test('a collapsed section summarises attention, failing checks, conflicts and unread changes', () => {
    renderSection(
      {
        prs: [
          entry('1', { checkState: 'FAIL', status: 'CHANGED' }),
          entry('2', { mergeState: 'NO' }),
          entry('3', { checkState: 'FAIL' }),
        ],
        attentionCount: 2,
      },
      false,
    );
    const summary = document.querySelector('.pr-section-summary') as HTMLElement;
    expect(summary).toHaveTextContent('2 need attention');
    expect(summary).toHaveTextContent('2 with failing checks');
    expect(summary).toHaveTextContent('1 with conflicts');
    expect(summary).toHaveTextContent('1 changed since your last ack');
  });

  test('leaves out zero counts, and an open section shows no summary', () => {
    renderSection({ prs: [entry('1', { checkState: 'FAIL' })], attentionCount: 0 }, false);
    expect(document.querySelector('.pr-section-summary')).toHaveTextContent('1 with failing checks');
    expect(document.querySelector('.pr-section-summary')).not.toHaveTextContent('attention');
  });

  test('an open section shows no summary', () => {
    renderSection({ prs: [entry('1', { checkState: 'FAIL' })], attentionCount: 1 }, true);
    expect(document.querySelector('.pr-section-summary')).not.toBeInTheDocument();
  });

  test('marks the Needs Attention count when it has PRs', () => {
    renderSection({ key: 'needs-attention', title: 'Needs Attention' });
    expect(document.querySelector('.pr-section-count')).toHaveAttribute('data-tone', 'attention');
  });

  test('says so when there are no PRs, instead of an empty table', () => {
    renderSection({ prs: [] });
    expect(screen.getByText('No PRs in this section.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
