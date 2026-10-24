import type { ReactNode } from 'react';

/**
 * Stroke icons for the redesigned UI (UI_REDESIGN_PLAN.md), drawn on a
 * 24x24 grid and coloured by `currentColor`. Without a `label` the icon is
 * decorative (aria-hidden) and whatever it sits in must carry the name;
 * with one it's announced as an image.
 */
const ICON_SHAPES = {
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  approve: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </>
  ),
  braces: (
    <>
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  checksFail: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  checksPass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  checksPending: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  checksSkipped: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 18.4 12.8-12.8" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  commit: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M3 12h6" />
      <path d="M15 12h6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  externalLink: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  fileViewed: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />,
  flag: <path d="M5 21V4h12l-2.5 4.5L17 13H5" />,
  merge: (
    <>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </>
  ),
  mergeConflict: (
    <>
      <circle cx="6" cy="6" r="3" />
      <path d="M6 9v12" />
      <path d="m14 14 6 6" />
      <path d="m20 14-6 6" />
      <path d="M9 6h4a3 3 0 0 1 3 3v2" />
    </>
  ),
  mergeUnknown: (
    <>
      <circle cx="6" cy="6" r="3" />
      <path d="M6 9v12" />
      <path d="M14.5 12.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.2" />
      <path d="M17 20h.01" />
    </>
  ),
  more: (
    <>
      <path d="M5 12h.01" />
      <path d="M12 12h.01" />
      <path d="M19 12h.01" />
    </>
  ),
  note: (
    <>
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z" />
      <path d="M15 3v6h6" />
      <path d="M7 13h6" />
      <path d="M7 17h8" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  pencil: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  pr: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <path d="M6 9v12" />
    </>
  ),
  prClosed: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M6 9v12" />
      <path d="m21 3-6 6" />
      <path d="m15 3 6 6" />
      <path d="M18 11.5V15" />
    </>
  ),
  prDraft: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M18 6h.01" />
      <path d="M18 11h.01" />
      <path d="M6 9v12" />
    </>
  ),
  pulse: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1 14h6" />
      <path d="M9 8h6" />
      <path d="M17 16h6" />
    </>
  ),
  tag: (
    <>
      <path d="M12 2H2v10l9.3 9.3a1 1 0 0 0 1.4 0l6.6-6.6a1 1 0 0 0 0-1.4z" />
      <path d="M7 7h.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
      <path d="M22 21v-1a5 5 0 0 0-3-4.6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICON_SHAPES;

export const ICON_NAMES = Object.keys(ICON_SHAPES) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  // Announced name; omit when the surrounding control already has one.
  label?: string;
  className?: string;
}

export function Icon({ name, size = 16, label, className }: IconProps) {
  const labelled = Boolean(label);
  return (
    <svg
      className={['ui-icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      focusable="false"
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {ICON_SHAPES[name]}
    </svg>
  );
}
