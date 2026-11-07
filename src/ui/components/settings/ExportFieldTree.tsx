import { useId, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { FieldTreeGroup, FieldTreeNode } from '../../helpers/export-field-tree.helpers.ts';

export type FieldSource = 'data' | 'user-state';

export const fieldId = (source: FieldSource, path: string) => `${source}:${path}`;

const sourceTag = (source: FieldSource) => (source === 'user-state' ? 'USER' : 'DATA');

interface ExportFieldTreeProps {
  source: FieldSource;
  nodes: readonly FieldTreeNode[];
  isSelected: (path: string) => boolean;
  onToggle: (path: string) => void;
  // Chooses (or unchooses) every one of these.
  onSetMany: (paths: readonly string[], checked: boolean) => void;
}

/**
 * One source's fields (export-field-tree.helpers.ts) as nested lists: each
 * group (an object in the PR's data or user state) folded until opened,
 * with a checkbox for all of its fields - ticked when every one is chosen,
 * part-ticked when some are - and how many of them are chosen. A field's
 * name is its source and whole path ("DATA data.title"); it shows its last
 * part under its group (the source is the list's heading).
 */
export function ExportFieldTree({ source, nodes, isSelected, onToggle, onSetMany }: ExportFieldTreeProps) {
  const [openPaths, setOpenPaths] = useState<ReadonlySet<string>>(new Set());
  const idPrefix = useId();
  const toggleOpen = (path: string) =>
    setOpenPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });

  const renderField = (path: string, label: string) => (
    <label className="export-field-option" key={`field:${path}`}>
      <input
        type="checkbox"
        aria-label={`${sourceTag(source)} ${path}`}
        checked={isSelected(path)}
        onChange={() => onToggle(path)}
        data-export-field-id={fieldId(source, path)}
        data-export-source={source}
        data-export-path={path}
      />
      <span>{label}</span>
    </label>
  );

  const renderGroup = (group: FieldTreeGroup) => {
    const chosen = group.fieldPaths.filter(isSelected).length;
    const total = group.fieldPaths.length;
    const open = openPaths.has(group.path);
    const itemsId = `${idPrefix}-${group.path}`;
    return (
      <div className="export-field-group" key={`group:${group.path}`}>
        <div className="export-field-group-header">
          <input
            type="checkbox"
            aria-label={`All of ${group.path}, ${chosen} of ${total} chosen`}
            checked={chosen === total}
            ref={(element) => {
              if (element) element.indeterminate = chosen > 0 && chosen < total;
            }}
            onChange={() => onSetMany(group.fieldPaths, chosen < total)}
          />
          {/* The name opens the group, not the checkbox: unticking a whole
              group is only ever the checkbox. */}
          <button
            type="button"
            className="export-field-group-toggle"
            aria-expanded={open}
            aria-controls={open ? itemsId : undefined}
            aria-label={`Fields in ${group.path}`}
            onClick={() => toggleOpen(group.path)}
          >
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
            <span className="export-field-group-label">{group.label}</span>
            <span className="export-field-group-count">
              {chosen} of {total}
            </span>
          </button>
        </div>
        {open && (
          <div id={itemsId} className="export-field-tree-items">
            {group.children.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  const renderNode = (node: FieldTreeNode) => (node.kind === 'field' ? renderField(node.path, node.label) : renderGroup(node));

  return <>{nodes.map(renderNode)}</>;
}
