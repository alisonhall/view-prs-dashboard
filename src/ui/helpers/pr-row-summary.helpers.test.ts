import { describeStatusLine, getSummaryThreads, toPlainLine } from './pr-row-summary.helpers.ts';

describe('toPlainLine', () => {
  test('given HTML in a comment, when flattening, then tags go, images read [image], and entities are decoded', () => {
    expect(
      toPlainLine(
        'See <img alt="image" src="https://github.com/user-attachments/assets/1" /><br>and<details><summary>Logs</summary>x &amp; y &lt;3</details><!-- hidden -->',
      ),
    ).toBe('See [image] and Logs x & y <3');
  });

  test('given an image-only comment, when flattening, then it is not blank', () => {
    expect(toPlainLine('![screenshot](https://x/1.png)')).toBe('[image]');
  });

  test('given comparisons, when flattening, then they are not mistaken for tags', () => {
    expect(toPlainLine('if x < 3 and y > 2')).toBe('if x < 3 and y > 2');
  });

  test('given identifiers and lone symbols, when flattening, then their underscores and asterisks stay', () => {
    expect(toPlainLine('Rename `user_id` in config_loader.ts, and 2 * 3 = 6')).toBe(
      'Rename user_id in config_loader.ts, and 2 * 3 = 6',
    );
  });

  test('given paired emphasis, when flattening, then the markers go and the text stays', () => {
    expect(toPlainLine('**bold**, __also__, *it*, _this_ and ~~gone~~')).toBe('bold, also, it, this and gone');
  });
});

describe('describeStatusLine', () => {
  test('given checks, mergeability, approvals and viewed files, when describing, then they read as one line', () => {
    expect(
      describeStatusLine({
        checkState: 'FAIL',
        mergeState: 'NO',
        approvalCount: '1',
        viewedFilesCount: '3',
        changedFilesCount: '4',
      }),
    ).toBe('Checks failing · Has conflicts · 1 approval · 3 of 4 files viewed');
  });

  test('given every file viewed and passing checks, when describing, then it says so', () => {
    expect(
      describeStatusLine({ checkState: 'PASS', mergeState: 'YES', approvalCount: 2, viewedFilesCount: 5, changedFilesCount: 5 }),
    ).toBe('Checks pass · No conflicts · 2 approvals · All files viewed');
  });

  test('given the states only in the title markers, when describing, then the markers are read', () => {
    expect(describeStatusLine({ titleDisplay: '[CHK:RUN][MRG:UNK] Fix' })).toBe(
      'Checks running · Mergeability unknown · 0 approvals',
    );
  });

  test('given no checks, mergeability or changed files, when describing, then only the approvals are listed', () => {
    expect(describeStatusLine({})).toBe('0 approvals');
  });
});

describe('getSummaryThreads', () => {
  const thread = (id: string, comments: object[], extra: object = {}) => ({ id, isResolved: false, comments, ...extra });

  test('given open and resolved threads, when listing, then only open ones count, most recently active first', () => {
    const { threads, openCount } = getSummaryThreads({
      reviewThreads: [
        thread('old', [{ createdAt: '2026-01-01T00:00:00Z', path: 'src/a.ts', line: 3, body: 'old one' }]),
        thread('done', [{ createdAt: '2026-01-09T00:00:00Z', body: 'resolved' }], { isResolved: true }),
        thread('new', [{ createdAt: '2026-01-05T00:00:00Z', path: 'src/b.ts', line: 9, body: 'new one' }]),
        thread('mid', [{ createdAt: '2026-01-03T00:00:00Z', body: 'middle' }]),
      ],
    });

    expect(openCount).toBe(3);
    expect(threads.map((item) => item.text)).toEqual(['new one', 'middle']);
  });

  test('given a thread with replies, when listing, then it shows its file and line, and the latest reply', () => {
    const { threads } = getSummaryThreads({
      reviewThreads: [
        thread('t', [
          { createdAt: '2026-01-02T00:00:00Z', authorLogin: 'bob', authorName: 'Bob', body: 'Done, thanks', url: '' },
          {
            createdAt: '2026-01-01T00:00:00Z',
            authorLogin: 'alice',
            body: 'Why?',
            path: 'src/ui/components/PrRow.tsx',
            line: null,
            originalLine: 42,
            url: 'https://github.com/o/r/pull/1#discussion_r1',
          },
        ]),
      ],
    });

    expect(threads[0]).toEqual({
      file: 'PrRow.tsx',
      path: 'src/ui/components/PrRow.tsx',
      line: 42,
      authorLogin: 'bob',
      authorName: 'Bob',
      text: 'Done, thanks',
      latestAt: '2026-01-02T00:00:00Z',
      url: 'https://github.com/o/r/pull/1#discussion_r1',
    });
  });

  test('given markdown in the latest comment, when listing, then it is one plain line', () => {
    const { threads } = getSummaryThreads({
      reviewThreads: [
        thread('t', [
          {
            createdAt: '2026-01-01T00:00:00Z',
            body: '> quoted\n\n**Please** use `toCount` [here](https://x).\n```ts\ncode()\n```\n- done',
          },
        ]),
      ],
    });

    expect(threads[0]?.text).toBe('quoted Please use toCount here. done');
  });

  test('given a thread with no comments, when listing, then it still counts, with empty details', () => {
    const { threads, openCount } = getSummaryThreads({ reviewThreads: [thread('t', [])] });

    expect(openCount).toBe(1);
    expect(threads[0]).toMatchObject({ file: '', line: null, text: '', url: '' });
  });

  test('given a limit, when listing, then at most that many are returned', () => {
    const reviewThreads = ['a', 'b', 'c'].map((id) => thread(id, [{ createdAt: '2026-01-01T00:00:00Z', body: id }]));

    expect(getSummaryThreads({ reviewThreads }, 1).threads.map((item) => item.text)).toEqual(['a']);
    expect(getSummaryThreads({ reviewThreads }).threads.map((item) => item.text)).toEqual(['a', 'b']);
  });

  test('given no review threads, when listing, then there are none', () => {
    expect(getSummaryThreads({})).toEqual({ threads: [], openCount: 0 });
  });
});
