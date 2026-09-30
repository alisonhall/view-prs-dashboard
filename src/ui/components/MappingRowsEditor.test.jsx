/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');

const { MappingRowsEditor, entriesToRows } = require('./MappingRowsEditor');

const baseProps = {
  heading: 'Test Mappings',
  addRowLabel: 'Add row',
  saveLabel: 'Save mappings',
  keyPlaceholder: 'Key',
  valuePlaceholder: 'Value',
  keyAriaLabel: 'Key',
  valueAriaLabel: 'Value',
  removeAriaLabel: 'Remove row',
  saveUrl: '/view-prs/test-mappings',
  emptyError: 'At least one mapping is required. Clearing all entries is blocked.',
  duplicatePrefix: 'Duplicate ID detected',
  incompleteError: 'Each non-empty row must include both an ID and a display name',
  savingText: 'Saving mappings...',
  savedNoun: 'mapping',
  saveFailurePrefix: 'Failed to save cache',
  rowClassName: 'test-mapping-row',
};

// Wraps the component so tests can drive real state, matching how
// ActorNamesTab actually uses it (rows/status live in the parent).
function Harness(props) {
  const [rows, setRows] = React.useState(props.initialRows || entriesToRows({}));
  const [status, setStatus] = React.useState(props.initialStatus || { text: '', tone: 'info' });
  return (
    <MappingRowsEditor
      {...baseProps}
      {...props}
      rows={rows}
      setRows={setRows}
      status={status}
      setStatus={setStatus}
    />
  );
}

describe('entriesToRows', () => {
  test('given an empty entries object, when converting, then it returns one blank row', () => {
    const rows = entriesToRows({});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: '', value: '' });
  });

  test('given entries, when converting, then rows are sorted by key and blank/whitespace-only entries are dropped', () => {
    const rows = entriesToRows({ zeta: 'Z', alpha: 'A', blank: '   ' });
    expect(rows.map((row) => row.key)).toEqual(['alpha', 'zeta']);
  });
});

describe('MappingRowsEditor', () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('given the default blank row, when Save is clicked, then the empty-mapping error is shown and no request is sent', async () => {
    global.fetch = jest.fn();
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByText('Save mappings'));

    expect(
      await screen.findByText('At least one mapping is required. Clearing all entries is blocked.'),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given a row with only a key filled in, when Save is clicked, then the incomplete-row error is shown', async () => {
    global.fetch = jest.fn();
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Key'), 'octocat');
    await user.click(screen.getByText('Save mappings'));

    expect(
      await screen.findByText('Each non-empty row must include both an ID and a display name'),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given two rows with the same key, when Save is clicked, then the duplicate error names the key and no request is sent', async () => {
    global.fetch = jest.fn();
    const user = userEvent.setup();
    render(<Harness initialRows={[
      { id: 'r1', key: 'octocat', value: 'The Octocat' },
      { id: 'r2', key: 'octocat', value: 'Dup Name' },
    ]} />);

    await user.click(screen.getByText('Save mappings'));

    expect(await screen.findByText('Duplicate ID detected: octocat')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given disallowSameValue and a row whose key equals its value, when Save is clicked, then the same-value error is shown', async () => {
    global.fetch = jest.fn();
    const user = userEvent.setup();
    render(
      <Harness
        disallowSameValue
        sameValueError="Alias login and canonical login must differ"
        initialRows={[{ id: 'r1', key: 'octocat', value: 'octocat' }]}
      />,
    );

    await user.click(screen.getByText('Save mappings'));

    expect(
      await screen.findByText('Alias login and canonical login must differ: octocat'),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given a valid row, when Save succeeds, then it PUTs the built payload and shows a success message', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, entries: { octocat: 'The Octocat' } }),
    });
    const user = userEvent.setup();
    render(<Harness initialRows={[{ id: 'r1', key: 'octocat', value: 'The Octocat' }]} />);

    await user.click(screen.getByText('Save mappings'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/test-mappings',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ octocat: 'The Octocat' }),
      }),
    );
    expect(await screen.findByText('Saved 1 mapping.')).toBeInTheDocument();
  });

  test('given the server rejects the save, when Save is clicked, then the failure message is shown', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'clears not allowed' }),
    });
    const user = userEvent.setup();
    render(<Harness initialRows={[{ id: 'r1', key: 'octocat', value: 'The Octocat' }]} />);

    await user.click(screen.getByText('Save mappings'));

    expect(await screen.findByText('Failed to save cache: clears not allowed')).toBeInTheDocument();
  });

  test('given a fetch rejection, when Save is clicked, then the failure message includes the thrown error text', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(<Harness initialRows={[{ id: 'r1', key: 'octocat', value: 'The Octocat' }]} />);

    await user.click(screen.getByText('Save mappings'));

    expect(await screen.findByText('Failed to save cache: network down')).toBeInTheDocument();
  });

  test('given a click on Add row, when adding, then a new blank row appears', async () => {
    const user = userEvent.setup();
    render(<Harness initialRows={[{ id: 'r1', key: 'octocat', value: 'The Octocat' }]} />);

    expect(screen.getAllByLabelText('Key')).toHaveLength(1);
    await user.click(screen.getByText('Add row'));
    expect(screen.getAllByLabelText('Key')).toHaveLength(2);
  });

  test('given a click on Remove row, when removing, then that row disappears', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialRows={[
          { id: 'r1', key: 'octocat', value: 'The Octocat' },
          { id: 'r2', key: 'monalisa', value: 'Mona Lisa' },
        ]}
      />,
    );

    expect(screen.getAllByLabelText('Key')).toHaveLength(2);
    await user.click(screen.getAllByText('Remove')[0]);
    expect(screen.getAllByLabelText('Key')).toHaveLength(1);
    expect(screen.getByDisplayValue('monalisa')).toBeInTheDocument();
  });

  test('given a click on Refresh, when clicked, then the onRefresh callback fires', async () => {
    const onRefresh = jest.fn();
    const user = userEvent.setup();
    render(<Harness onRefresh={onRefresh} />);

    await user.click(screen.getByText('Refresh'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
