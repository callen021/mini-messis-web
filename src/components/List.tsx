import { type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

/** Inset grouped list container (iOS "grouped table" card). */
export function Group({
  children,
  className,
  style,
  id,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  return (
    <div className={cn('group', className)} style={style} id={id}>
      {children}
    </div>
  );
}

/** Uppercase section header above a Group. */
export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn('section', className)} id={id}>
      {children}
    </div>
  );
}

/** Small explanatory text below a Group. */
export function Footer({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p className={cn('footer', className)} style={style}>
      {children}
    </p>
  );
}

export interface RowProps {
  /** Main text. */
  label?: ReactNode;
  /** Secondary line under the label. */
  detail?: ReactNode;
  /** Right-aligned muted value. */
  value?: ReactNode;
  /** Leading 30px icon tile; pass `iconColor` for its background. An emoji string renders as text. */
  icon?: ReactNode;
  iconColor?: string;
  /** Trailing control (Switch, Segmented, Stepper, …). */
  children?: ReactNode;
  chevron?: boolean;
  /** Tint-colored action row. */
  link?: boolean;
  destructive?: boolean;
  /** Render as a button. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Render as a router link. */
  to?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

/**
 * One line in a Group. Renders a <button> when `onClick` is given, a <Link> when `to` is given,
 * otherwise a <div>. Dividers between rows are drawn by CSS.
 */
export function Row({
  label,
  detail,
  value,
  icon,
  iconColor,
  children,
  chevron,
  link,
  destructive,
  onClick,
  to,
  disabled,
  className,
  style,
  'aria-label': ariaLabel,
}: RowProps) {
  const cls = cn('row', link && 'link', destructive && 'destructive', className);
  const isEmoji = typeof icon === 'string';
  const content = (
    <>
      {icon !== undefined && (
        <span
          className={cn('icon', isEmoji && 'emoji')}
          style={iconColor ? { background: iconColor } : undefined}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      {(label !== undefined || detail !== undefined) && (
        <span className="lbl">
          {label}
          {detail !== undefined && <small>{detail}</small>}
        </span>
      )}
      {value !== undefined && <span className="val">{value}</span>}
      {children}
      {chevron && <span className="chev" aria-hidden="true" />}
    </>
  );
  if (to !== undefined) {
    return (
      <Link to={to} className={cls} style={style} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {content}
    </div>
  );
}
