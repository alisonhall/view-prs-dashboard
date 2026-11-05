/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import type { PrEntry } from '../types/pr-data.ts';
import { useHeldSectionOrder } from './useHeldSectionOrder';

const row = (number: string): PrEntry => ({ prNumber: number, repo: 'acme/api', data: { number } });
const section = (key: string, numbers: string[]) => ({ key, prs: numbers.map(row) });
const shown = (sections: { prs: PrEntry[] }[]) => sections.map((each) => each.prs.map((entry) => entry.data?.number));

type Props = { sections: ReturnType<typeof section>[]; hold: Set<string>; sort?: string };
const setup = (initial: Props) =>
  renderHook(({ sections, hold, sort = 'updated' }: Props) => useHeldSectionOrder(sections, hold, () => sort, 'acme/api'), {
    initialProps: initial,
  });

describe('useHeldSectionOrder', () => {
  test('not held: each section in its sort, as it changes', () => {
    const { result, rerender } = setup({ sections: [section('open', ['1', '2'])], hold: new Set() });
    rerender({ sections: [section('open', ['2', '1'])], hold: new Set() });
    expect(shown(result.current.sections)).toEqual([['2', '1']]);
    expect(result.current.orderChangedKeys.size).toBe(0);
  });

  test('held: a re-sort keeps the rows where they were and says the order changed, only for that section', () => {
    const hold = new Set(['open']);
    const { result, rerender } = setup({ sections: [section('open', ['1', '2']), section('draft', ['5', '6'])], hold });
    rerender({ sections: [section('open', ['3', '2', '1']), section('draft', ['6', '5'])], hold });
    // 3 is new: where the sort puts it, above 2.
    expect(shown(result.current.sections)).toEqual([['1', '3', '2'], ['6', '5']]);
    expect([...result.current.orderChangedKeys]).toEqual(['open']);
  });

  test('a new row in its sorted place is no change of order', () => {
    const hold = new Set(['open']);
    const { result, rerender } = setup({ sections: [section('open', ['2', '1'])], hold });
    rerender({ sections: [section('open', ['3', '2', '1'])], hold });
    expect(shown(result.current.sections)).toEqual([['3', '2', '1']]);
    expect(result.current.orderChangedKeys.size).toBe(0);
  });

  test('"Re-sort" applies the sort and holds that order; leaving the section applies it too', () => {
    const hold = new Set(['open']);
    const { result, rerender } = setup({ sections: [section('open', ['1', '2'])], hold });
    rerender({ sections: [section('open', ['2', '1'])], hold });
    expect(shown(result.current.sections)).toEqual([['1', '2']]);

    act(() => result.current.resortSection('open'));
    expect(shown(result.current.sections)).toEqual([['2', '1']]);
    expect(result.current.orderChangedKeys.size).toBe(0);

    rerender({ sections: [section('open', ['1', '2'])], hold });
    expect(shown(result.current.sections)).toEqual([['2', '1']]);
    rerender({ sections: [section('open', ['1', '2'])], hold: new Set() });
    expect(shown(result.current.sections)).toEqual([['1', '2']]);
  });

  test('held while you work in the section; leaving it applies the sort, re-rendering only when the order changed', () => {
    let renders = 0;
    const none = new Set<string>();
    const { result, rerender } = renderHook(
      ({ sections }: { sections: ReturnType<typeof section>[] }) => {
        renders += 1;
        return useHeldSectionOrder(sections, none, () => 'updated', 'acme/api');
      },
      { initialProps: { sections: [section('open', ['1', '2'])] } },
    );

    // Coming and going with nothing changed: no render at all.
    act(() => result.current.setSectionInteracting('open', true));
    act(() => result.current.setSectionInteracting('open', false));
    expect(renders).toBe(1);

    act(() => result.current.setSectionInteracting('open', true));
    rerender({ sections: [section('open', ['2', '1'])] });
    expect(shown(result.current.sections)).toEqual([['1', '2']]);
    expect([...result.current.orderChangedKeys]).toEqual(['open']);

    act(() => result.current.setSectionInteracting('open', false));
    expect(shown(result.current.sections)).toEqual([['2', '1']]);
    expect(result.current.orderChangedKeys.size).toBe(0);
  });

  test('choosing another sort applies at once, even while held', () => {
    const hold = new Set(['open']);
    const { result, rerender } = setup({ sections: [section('open', ['1', '2'])], hold });
    rerender({ sections: [section('open', ['2', '1'])], hold, sort: 'number' });
    expect(shown(result.current.sections)).toEqual([['2', '1']]);
  });
});
