// Export's field catalog as nested lists (Tools › Export): the dotted
// paths getFieldCatalog gives ("data.reviews", "notesByPrNumber.stories")
// grouped by the objects they're in, so a whole group can be chosen at
// once.

export interface FieldTreeField {
  kind: "field";
  path: string;
  // The path's last part ("reviews"); "(as one value)" for a group's own
  // path (see buildFieldTree).
  label: string;
}

export const WHOLE_VALUE_LABEL = "(as one value)";

export interface FieldTreeGroup {
  kind: "group";
  // The object's path ("data"), and how it's shown: its last part, or the
  // parts of a chain of groups with nothing else in them ("a.b").
  path: string;
  label: string;
  // Its fields first, then its groups, each by label.
  children: FieldTreeNode[];
  // Every field in it, however deep.
  fieldPaths: string[];
}

export type FieldTreeNode = FieldTreeField | FieldTreeGroup;

interface DraftGroup {
  fields: string[];
  groups: Map<string, DraftGroup>;
  // The group's own path is a field too (see buildFieldTree).
  isField?: boolean;
}

const byLabel = (left: { label: string }, right: { label: string }) => left.label.localeCompare(right.label);

const toNodes = (draft: DraftGroup, prefix: string): FieldTreeNode[] => {
  const fields: FieldTreeField[] = draft.fields
    .filter((label) => !draft.groups.has(label))
    .map((label) => ({
      kind: "field",
      path: prefix ? `${prefix}.${label}` : label,
      label,
    }));
  const groups: FieldTreeGroup[] = Array.from(draft.groups, ([label, child]) => {
    let path = prefix ? `${prefix}.${label}` : label;
    let shown = label;
    let inner = child;
    // A group holding only one group shows as one row ("a.b").
    while (!inner.isField && inner.fields.length === 0 && inner.groups.size === 1) {
      const [nextLabel, next] = inner.groups.entries().next().value as [string, DraftGroup];
      path = `${path}.${nextLabel}`;
      shown = `${shown}.${nextLabel}`;
      inner = next;
    }
    const own: FieldTreeField[] = inner.isField ? [{ kind: "field", path, label: WHOLE_VALUE_LABEL }] : [];
    const children = [...own, ...toNodes(inner, path)];
    return { kind: "group", path, label: shown, children, fieldPaths: collectFieldPaths(children) };
  });
  return [...fields.sort(byLabel), ...groups.sort(byLabel)];
};

const collectFieldPaths = (nodes: readonly FieldTreeNode[]): string[] =>
  nodes.flatMap((node) => (node.kind === "field" ? [node.path] : node.fieldPaths));

// The paths as nested lists. A path that's a field in one PR and an object
// in another ("notesByPrNumber" when a PR has no notes, and
// "notesByPrNumber.stories") is a group with that field first in it,
// "(as one value)": chosen, it exports the whole object.
export const buildFieldTree = (paths: readonly string[]): FieldTreeNode[] => {
  const root: DraftGroup = { fields: [], groups: new Map() };
  new Set(paths).forEach((path) => {
    const parts = String(path).split(".");
    if (parts.some((part) => !part)) {
      // Not a dotted path we can split ("a..b"): a field of its own.
      if (path) root.fields.push(path);
      return;
    }
    const label = parts.pop() as string;
    let group = root;
    parts.forEach((part) => {
      let next = group.groups.get(part);
      if (!next) {
        next = { fields: [], groups: new Map() };
        group.groups.set(part, next);
      }
      group = next;
    });
    group.fields.push(label);
  });
  // A field that's also a group goes in that group.
  const markGroupFields = (group: DraftGroup) => {
    group.groups.forEach((child, label) => {
      if (group.fields.includes(label)) child.isField = true;
      markGroupFields(child);
    });
  };
  markGroupFields(root);
  return toNodes(root, "");
};
