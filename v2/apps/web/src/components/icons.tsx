/* Line icons in the Zoho idiom — 1.6px stroke, round caps, currentColor. */

const P = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function Icon({ name, size = 18, className = '' }: {
  name: keyof typeof PATHS; size?: number; className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...P} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

const PATHS = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></>,
  leads: <><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M17 8h5M19.5 5.5v5" /></>,
  quote: <><path d="M6 2.8h8.5L19 7.3V21H6z" /><path d="M14 3v5h5" /><path d="M9 12h6M9 15.5h6" /></>,
  contract: <><path d="M12 2.8 20 6v6c0 5-3.4 8.3-8 9.2C7.4 20.3 4 17 4 12V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></>,
  calendar: <><rect x="3.5" y="4.5" width="17" height="16.5" rx="2" /><path d="M3.5 9.5h17M8 2.8v3.4M16 2.8v3.4" /></>,
  board: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /><path d="M12 13h6M12 16.5h4" /></>,
  customers: <><circle cx="12" cy="7.6" r="3.6" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  team: <><circle cx="8.5" cy="8" r="3.2" /><circle cx="16.5" cy="9.5" r="2.6" /><path d="M2.8 19.5a5.7 5.7 0 0 1 11.4 0M13.4 19.5a5.2 5.2 0 0 1 8 -4.1" /></>,
  service: <><path d="M14.5 6.5a4.5 4.5 0 0 1-6 4.24L4 15.24V20h4.76l4.5-4.5A4.5 4.5 0 1 0 14.5 6.5z" transform="rotate(90 12 12)" /></>,
  branch: <><path d="M4 21V8l8-5 8 5v13" /><path d="M4 21h16M9.5 21v-5h5v5" /><path d="M9 11h.01M15 11h.01" /></>,
  inventory: <><path d="m12 2.8 8.5 4.4v9.6L12 21.2l-8.5-4.4V7.2z" /><path d="M3.5 7.2 12 11.6l8.5-4.4M12 11.6v9.6" /></>,
  invoice: <><path d="M5 3h14v18l-2.3-1.5L14.4 21l-2.4-1.5L9.6 21l-2.3-1.5L5 21z" /><path d="M9 8h6M9 12h6" /></>,
  report: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8.5 16v-5M13 16V7.5M17.5 16v-3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.36.95A7 7 0 0 0 14.07 5l-.36-2.5h-4l-.36 2.5a7 7 0 0 0-2.43 1.4l-2.36-.95-2 3.46 2 1.55a7 7 0 0 0 0 2.8l-2 1.55 2 3.46 2.36-.95a7 7 0 0 0 2.43 1.4l.36 2.5h4l.36-2.5a7 7 0 0 0 2.43-1.4l2.36.95 2-3.46-2-1.55A7 7 0 0 0 19 12z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.5-4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: <><path d="M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7-2.5 7h17s-2.5-1-2.5-7" /><path d="M10 19.5a2.2 2.2 0 0 0 4 0" /></>,
  chevDown: <path d="m6 9 6 6 6-6" />,
  chevRight: <path d="m9 6 6 6-6 6" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 8 5-5 5 5M12 3v12" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
} as const;

export type IconName = keyof typeof PATHS;
