/** @jest-environment jsdom */

import { useEffect, useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NameForm, SavedItemsBar } from './SavedItems';

// A native Esc listener on an element around the form, as the Settings
// drawer has (useFocusTrap).
function NativeEscapeContainer({ onEscape, children }: { onEscape: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    element?.addEventListener('keydown', handleKeyDown);
    return () => element?.removeEventListener('keydown', handleKeyDown);
  }, [onEscape]);
  return <div ref={ref}>{children}</div>;
}

describe('NameForm', () => {
  test("Esc cancels, and goes no further: a native listener around it (the Settings drawer's) doesn't get it", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    const onDrawerEscape = jest.fn();
    render(
      <NativeEscapeContainer onEscape={onDrawerEscape}>
        <NameForm label="Name for the new profile" noun="profile" isFree={() => true} onSave={jest.fn()} onCancel={onCancel} />
      </NativeEscapeContainer>,
    );
    expect(screen.getByRole('textbox', { name: 'Name for the new profile' })).toHaveFocus();
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Profile name');

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDrawerEscape).not.toHaveBeenCalled();
  });

  test('a name another has is said, and Save is off for it', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    render(<NameForm label="Name" noun="view" isFree={(name) => name !== 'Taken'} onSave={onSave} onCancel={jest.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Taken');
    expect(screen.getByText('Another view has that name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('SavedItemsBar', () => {
  const items = [{ id: 'v1', name: 'Mine' }];
  const renderBar = (canSave: boolean) => (
    <SavedItemsBar
      items={items}
      activeId={canSave ? '' : 'v1'}
      modifiedId=""
      saveFailed={false}
      label="Saved views"
      noun="view"
      describe={() => ''}
      onApply={jest.fn()}
      canSave={canSave}
      onSave={() => 'v2'}
      onUpdate={jest.fn()}
    />
  );

  test("the name form closes for good once there's nothing to save, rather than open again (taking focus) when there is", async () => {
    const user = userEvent.setup();
    const { rerender } = render(renderBar(true));
    await user.click(screen.getByRole('button', { name: 'Save as view' }));
    expect(screen.getByRole('textbox', { name: 'Name for the new view' })).toHaveFocus();

    // A view applied meanwhile: nothing to save.
    rerender(renderBar(false));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // A filter changed after: something to save again, and only the button
    // says so.
    rerender(renderBar(true));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as view' })).toBeInTheDocument();
  });
});
