import { useRuleField } from '../../state/useRuleField';

/**
 * A Settings checkbox bound to a FilterStateContext key (the Script
 * options' toggles and the Needs Attention rules). Its label wraps it. A
 * Needs Attention rule edits the repo's own rules when Settings › Rules is
 * on a repo that has them (useRuleField); anything else, the plain value.
 */
export interface ContextFilterCheckboxProps {
  id: string;
  name: string;
  filterStateKey: string;
  // The id of what describes it (its hint).
  describedBy?: string;
}

export function ContextFilterCheckbox({ id, name, filterStateKey, describedBy }: ContextFilterCheckboxProps) {
  const { value, setValue } = useRuleField(filterStateKey);
  return (
    <input
      type="checkbox"
      id={id}
      name={name}
      aria-describedby={describedBy}
      checked={Boolean(value)}
      onChange={(event) => setValue(event.target.checked)}
    />
  );
}
