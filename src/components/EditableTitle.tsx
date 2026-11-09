/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role -- the editable large title is the legacy design: a heading that is also the rename field */
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

export interface EditableTitleProps {
  value: string;
  /** Called on blur / Enter with the trimmed, whitespace-collapsed text (may be empty). */
  onSave: (next: string) => void;
  editable: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

/**
 * The large page title that doubles as an inline text field (legacy "tap to rename your team").
 * Uncontrolled while focused so React re-renders never move the caret.
 */
export function EditableTitle({
  value,
  onSave,
  editable,
  placeholder = 'Team name',
  maxLength = 40,
  className,
}: EditableTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const next = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    if (next !== value) onSave(next);
    else el.textContent = value;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLHeadingElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.currentTarget.textContent = value;
      e.currentTarget.blur();
    }
  };

  if (!editable) {
    return <h1 className={cn('large', className)}>{value}</h1>;
  }
  return (
    <h1
      ref={ref}
      className={cn('large', 'editable', className)}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label="Team name"
      aria-multiline="false"
      tabIndex={0}
      data-placeholder={placeholder}
      title="Tap to rename your team"
      onBlur={commit}
      onKeyDown={onKeyDown}
    >
      {value}
    </h1>
  );
}
