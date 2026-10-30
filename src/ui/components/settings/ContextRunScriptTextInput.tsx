import { useFilterState } from '../../state/FilterStateContext';
import { NON_CREDENTIAL_INPUT_PROPS } from '../../helpers/form-parsing.helpers.ts';

/**
 * A Settings text or number field bound to a FilterStateContext key (the
 * PR numbers to run, and the Script options). Numbers can't go below 1.
 * The non-credential props keep password managers from treating it as a
 * login field.
 */
export interface ContextRunScriptTextInputProps {
  id: string;
  name: string;
  type?: 'text' | 'number';
  placeholder?: string;
  filterStateKey: string;
}

export function ContextRunScriptTextInput({ id, name, type = 'text', placeholder = '', filterStateKey }: ContextRunScriptTextInputProps) {
  const { values, setValue } = useFilterState();
  return (
    <input
      type={type}
      id={id}
      name={name}
      placeholder={placeholder}
      {...(type === 'number' ? { min: 1 } : {})}
      {...NON_CREDENTIAL_INPUT_PROPS}
      value={String(values[filterStateKey] ?? '')}
      onChange={(event) => setValue(filterStateKey, event.target.value)}
    />
  );
}
