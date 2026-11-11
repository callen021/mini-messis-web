import { type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

/** 24×24 stroke icons, paths taken from the legacy app. Decorative by default (aria-hidden). */
const Svg = ({ children, ...rest }: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
    {children}
  </svg>
);

export const FieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 4v16M3 9h3v6H3M21 9h-3v6h3" />
    <circle cx="12" cy="12" r="2.4" />
  </Svg>
);
export const LineupIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h3M10 6h10M4 12h3M10 12h10M4 18h3M10 18h10" />
  </Svg>
);
export const TeamIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5a3 3 0 0 1 0 6M17.5 14.5a5.5 5.5 0 0 1 4 5.5" />
  </Svg>
);
export const GamesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <path d="M9 15l2 2 4-4" />
  </Svg>
);
export const StatsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const ChevronUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 15l6-6 6 6" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
/** Team board: a speech bubble. */
export const MessageIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5h16v10H9l-5 4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </Svg>
);
/** The parent home tab (their child). */
export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7z" />
  </Svg>
);
/** Turn-right arrow in a diamond: the Directions link on schedule rows and detail pages. */
export const DirectionsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z" />
    <path d="M9.5 15.5v-3.5h5M12.5 9.5l2.5 2.5-2.5 2.5" />
  </Svg>
);
export const ExportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Svg>
);
export const ImportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15V3M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Svg>
);
export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19h16M6 15l4-5 4 3 4-6" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Svg>
);
