import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'tinted' | 'gray';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
}

/** Filled pill button. `primary` is the sport tint; `tinted` is the soft tint; `gray` is neutral. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('btn', variant !== 'primary' && variant, size === 'sm' && 'sm', className)}
      {...rest}
    />
  );
});

/** Horizontal strip of buttons under a title. `fixed` pins it to the bottom like the Field page's bar. */
export function Toolbar({
  children,
  fixed = false,
  className,
}: {
  children: React.ReactNode;
  fixed?: boolean;
  className?: string;
}) {
  return <div className={cn('toolbar', fixed && 'actionbar noprint', className)}>{children}</div>;
}
