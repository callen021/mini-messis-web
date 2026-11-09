import { type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/cn';
import { hapticTick } from '@/lib/haptics';
import { GearIcon } from './icons';

export interface TabItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export type TabbarPosition = 'top' | 'bottom';

export interface TabbarProps {
  tabs: readonly TabItem[];
  /** Route for the gear button. Omit to hide it. */
  gearTo?: string | null;
  /** Bottom (default, matches the skills prototype) or top (where the legacy app had it). */
  position?: TabbarPosition;
}

/** Fixed tab bar with a trailing Settings gear. Taps give a haptic tick where supported. */
export function Tabbar({ tabs, gearTo = '/settings', position = 'bottom' }: TabbarProps) {
  return (
    <nav className={cn('tabbar', position === 'top' && 'top')} aria-label="Main">
      <div className="tabs">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => cn('tab', isActive && 'active')}
            onClick={hapticTick}
          >
            {t.icon}
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
      {gearTo && (
        <NavLink
          to={gearTo}
          className={({ isActive }) => cn('gear', isActive && 'active')}
          aria-label="Settings"
          title="Settings"
          onClick={hapticTick}
        >
          <GearIcon />
        </NavLink>
      )}
    </nav>
  );
}
