import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Required: switches have no visible text of their own. */
  label: string;
  /** `lg` 51×31 (settings rows), `md` 44×27 (roster rows), `sm` 40×25 (rotation grid). */
  size?: 'lg' | 'md' | 'sm';
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** iOS toggle. Exposed as role="switch" with aria-checked, like the legacy markup. */
export function Switch({ checked, onChange, label, size = 'lg', disabled, className, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn('toggle', checked && 'on', size !== 'lg' && size, className)}
      onClick={() => onChange(!checked)}
    />
  );
}
