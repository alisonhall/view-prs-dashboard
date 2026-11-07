import { WHOLE_VALUE_LABEL, buildFieldTree, type FieldTreeGroup } from './export-field-tree.helpers.ts';

describe('buildFieldTree', () => {
  test('groups paths by their objects: fields first, then groups, each by name; a group knows every field in it', () => {
    const tree = buildFieldTree(['repo', 'data.title', 'prNumber', 'data.reviews', 'data.checks.state', 'data.checks.url']);
    expect(tree.map((node) => [node.kind, node.label])).toEqual([
      ['field', 'prNumber'],
      ['field', 'repo'],
      ['group', 'data'],
    ]);
    const data = tree[2] as FieldTreeGroup;
    expect(data.path).toBe('data');
    expect(data.children.map((node) => [node.kind, node.path])).toEqual([
      ['field', 'data.reviews'],
      ['field', 'data.title'],
      ['group', 'data.checks'],
    ]);
    expect(data.fieldPaths.sort()).toEqual(['data.checks.state', 'data.checks.url', 'data.reviews', 'data.title']);
  });

  test('a group holding only one group shows as one row', () => {
    const [group] = buildFieldTree(['ackByRepo.owner.at', 'ackByRepo.owner.by']) as FieldTreeGroup[];
    expect(group).toMatchObject({ kind: 'group', path: 'ackByRepo.owner', label: 'ackByRepo.owner' });
    expect(group?.children.map((node) => node.label)).toEqual(['at', 'by']);
  });

  test("a path that's a field in one PR and an object in another is a group with that field first in it", () => {
    const tree = buildFieldTree(['data.x', 'data.x.y', 'data.z', 'data.x', 'notes', 'notes.only.deep']);
    const [data, notes] = tree as FieldTreeGroup[];
    expect(data?.children.map((node) => [node.kind, node.path])).toEqual([
      ['field', 'data.z'],
      ['group', 'data.x'],
    ]);
    const x = data?.children[1] as FieldTreeGroup;
    expect(x.children.map((node) => [node.kind, node.path, node.label])).toEqual([
      ['field', 'data.x', WHOLE_VALUE_LABEL],
      ['field', 'data.x.y', 'y'],
    ]);
    expect(x.fieldPaths).toEqual(['data.x', 'data.x.y']);
    // Its own field keeps it from folding into the group below it.
    expect(notes).toMatchObject({ path: 'notes', label: 'notes' });
    expect(notes?.children.map((node) => [node.kind, node.label])).toEqual([
      ['field', WHOLE_VALUE_LABEL],
      ['group', 'only'],
    ]);
  });

  test("one that can't be split is a field of its own", () => {
    expect(buildFieldTree(['odd..path'])).toEqual([{ kind: 'field', path: 'odd..path', label: 'odd..path' }]);
  });

  test('none for no paths', () => {
    expect(buildFieldTree([])).toEqual([]);
  });
});
