// 16px line icons for the app shell, drawn on a 16x16 grid.

const paths = {
  home: <path d="M2.5 7 8 2.5 13.5 7v6a1 1 0 0 1-1 1H10V10H6v4H3.5a1 1 0 0 1-1-1Z" />,
  customers: (
    <>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 13.75c.6-2.5 2.7-4 5.25-4s4.65 1.5 5.25 4" />
    </>
  ),
  jobs: (
    <>
      <rect x="2" y="5" width="12" height="8.5" rx="1.5" />
      <path d="M5.75 5V3.75a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1V5M2 9h12" />
    </>
  ),
  pricebook: (
    <>
      <path d="M8 1.75 13.75 5v6L8 14.25 2.25 11V5Z" />
      <path d="M2.25 5 8 8.25 13.75 5M8 8.25v6" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M8 5v3.25l2 1.25" />
    </>
  ),
  crm: (
    <>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M1.75 13c.45-2 2.15-3.25 4.25-3.25S9.8 11 10.25 13" />
      <path d="M10.5 3.5a2.25 2.25 0 0 1 0 4.25M11.75 9.9c1.3.45 2.2 1.55 2.5 3.1" />
    </>
  ),
  funnels: <path d="M2.25 3h11.5L9.5 8.5v4.25l-3 1.5V8.5Z" />,
  marketing: (
    <>
      <path d="M2.5 6.5v3h2.25L10 12.5v-9L4.75 6.5Z" />
      <path d="M12.25 6a2.5 2.5 0 0 1 0 4M5 9.5l.75 3.75" />
    </>
  ),
  automations: <path d="M9 1.75 3.25 9h4.25L7 14.25 12.75 7H8.5Z" />,
  accounting: (
    <>
      <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
      <path d="M5.25 5h5.5M5.25 8h1.5M9.25 8h1.5M5.25 11h1.5M9.25 11h1.5" />
    </>
  ),
  invoices: (
    <>
      <path d="M3.5 1.75h9v12.5l-2.25-1.25L8 14.25 5.75 13 3.5 14.25Z" />
      <path d="M6 5.25h4M6 8h4" />
    </>
  ),
  tax: (
    <>
      <path d="m3.5 12.5 9-9" />
      <circle cx="4.75" cy="4.75" r="1.5" />
      <circle cx="11.25" cy="11.25" r="1.5" />
    </>
  ),
  stage: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  company: (
    <>
      <path d="M2.75 14V3.25a1 1 0 0 1 1-1h5.5a1 1 0 0 1 1 1V14M10.25 6.5h2a1 1 0 0 1 1 1V14M1.75 14h12.5" />
      <path d="M5.25 5h2M5.25 8h2M5.25 11h2" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="m2.5 4.5 5.5 4 5.5-4" />
    </>
  ),
  phone: <path d="M5.5 2.5h-2A1 1 0 0 0 2.5 3.6C2.9 9.2 6.8 13.1 12.4 13.5a1 1 0 0 0 1.1-1v-2l-2.75-1.25-1.25 1.5a7 7 0 0 1-4.25-4.25l1.5-1.25Z" />,
  pin: (
    <>
      <path d="M8 14.25s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0c0 3.5 4.5 7.5 4.5 7.5Z" />
      <circle cx="8" cy="6.75" r="1.6" />
    </>
  ),
  source: <path d="M2.5 8h8M7.5 4.75 10.75 8 7.5 11.25M13.5 2.75v10.5" />,
  dollar: <path d="M8 1.75v12.5M11 4.5H6.75a2 2 0 0 0 0 4h2.5a2 2 0 0 1 0 4H4.75" />,
  calendar: (
    <>
      <rect x="2.25" y="3" width="11.5" height="10.75" rx="1.5" />
      <path d="M2.25 6.5h11.5M5.5 1.75v2.5M10.5 1.75v2.5" />
    </>
  ),
  chat: <path d="M2.5 3.5h11v7.25H6.5L3.5 13.5v-2.75h-1Z" />,
  note: (
    <>
      <path d="M3 2.25h7.25L13 5v8.75H3Z" />
      <path d="M5.5 7.5h5M5.5 10.25h3.5" />
    </>
  ),
  tag: (
    <>
      <path d="M2.25 2.25h5.5l6 6-5.5 5.5-6-6Z" />
      <circle cx="5.25" cy="5.25" r="1" />
    </>
  ),
  check: <path d="m3.25 8.25 3 3 6.5-6.5" />,
  activity: <path d="M1.75 8h2.5l2-4.5 3.5 9 2-4.5h2.5" />,
  arrowRight: <path d="M3 8h10M9 4l4 4-4 4" />,
  chevron: <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.25 3.25" />
    </>
  ),
  menu: <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />,
  close: <path d="m3.75 3.75 8.5 8.5M12.25 3.75l-8.5 8.5" />,
  plus: <path d="M8 3v10M3 8h10" />,
  trash: <path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4 4.25l.6 8.6a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.6" />,
  sparkle: <path d="M7 2.25 8.25 6 12 7.25 8.25 8.5 7 12.25 5.75 8.5 2 7.25 5.75 6ZM12.25 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5Z" />,
  send: <path d="M2.5 8 13.5 2.5 10.5 13.5 7.75 8.75ZM7.75 8.75 13.5 2.5" />,
  copy: (
    <>
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.25" />
      <path d="M10.75 5.25v-2a1 1 0 0 0-1-1h-6.5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h2" />
    </>
  ),
  plug: <path d="M6 1.75v3M10 1.75v3M4.25 4.75h7.5V7.5a3.75 3.75 0 0 1-7.5 0ZM8 11.25v3" />,
  route: (
    <>
      <circle cx="4" cy="12" r="1.75" />
      <circle cx="12" cy="4" r="1.75" />
      <path d="M5.75 12h3.5a2.25 2.25 0 0 0 0-4.5h-2.5a2.25 2.25 0 0 1 0-4.5h3.5" />
    </>
  ),
  users: (
    <>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M1.75 13.25c.5-2.1 2.2-3.35 4.25-3.35s3.75 1.25 4.25 3.35M10.5 3.4a2.25 2.25 0 0 1 0 4.2M12 9.9c1.2.45 2 1.6 2.25 3.35" />
    </>
  ),
  fleet: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  station: (
    <>
      <rect x="3.5" y="3.5" width="9" height="9" rx="1.25" />
      <rect x="6" y="6" width="4" height="4" rx=".5" />
      <path d="M6 1.75v1.75M10 1.75v1.75M6 12.5v1.75M10 12.5v1.75M1.75 6h1.75M1.75 10h1.75M12.5 6h1.75M12.5 10h1.75" />
    </>
  ),
  drift: <path d="M1.75 11.5c2-.5 3-4.5 5-4.5s2.25 2.5 4 2.5 2.25-4.75 3.5-6.25M10.5 3.25h2.75V6" />,
  investigation: (
    <>
      <path d="M9.5 13.75H3.25a1 1 0 0 1-1-1V3.25a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1V6" />
      <circle cx="10.5" cy="10" r="2.25" />
      <path d="m12.25 11.75 1.75 1.75M4.75 5h4.5M4.75 7.75h2.5" />
    </>
  ),
  approval: (
    <>
      <path d="M8 1.75 13.25 3.75v4c0 3-2.25 5.25-5.25 6.5-3-1.25-5.25-3.5-5.25-6.5v-4Z" />
      <path d="m5.75 8 1.6 1.6 3-3.1" />
    </>
  ),
  agent: (
    <>
      <rect x="2.75" y="5" width="10.5" height="8" rx="2" />
      <path d="M8 2.25V5M6 8.75v.5M10 8.75v.5M6.25 11h3.5M1.25 8.5v2M14.75 8.5v2" />
    </>
  ),
  audit: <path d="M5.75 4h7.5M5.75 8h7.5M5.75 12h7.5M2.5 4h.5M2.5 8h.5M2.5 12h.5" />,
  bringup: (
    <>
      <path d="M9.25 2.25c2.6.2 4.3 1.9 4.5 4.5L9.5 11 5 6.5Z" />
      <path d="M5 6.5 2.75 7l-1 2.25L4.5 9.5M9.5 11l-.5 2.25-2.25 1L6.5 11.5M4.25 11.75l-1.5 1.5" />
    </>
  ),
  analytics: <path d="M2.25 13.75h11.5M4.25 11.25V8M7.25 11.25V4.5M10.25 11.25V6.5M13.25 11.25V2.75" />,
  bell: <path d="M4 11.25V7a4 4 0 0 1 8 0v4.25l1.25 1.25H2.75ZM6.5 13.75a1.5 1.5 0 0 0 3 0" />,
  settings: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.05 1.05M4.65 11.35 3.6 12.4M12.4 12.4l-1.05-1.05M4.65 4.65 3.6 3.6" />
    </>
  ),
  handoff: <path d="M2.5 5.25h9.25L9.5 3M13.5 10.75H4.25L6.5 13" />,
  link: <path d="M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2-2a2.75 2.75 0 0 0-3.9-3.9l-.75.75M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2 2a2.75 2.75 0 0 0 3.9 3.9l.75-.75" />,
  undo: <path d="M4.5 6.5h5.75a3.25 3.25 0 0 1 0 6.5H7M6.75 3.75 4 6.5l2.75 2.75" />,
  upload: <path d="M8 10.5V2.75M4.75 6 8 2.75 11.25 6M2.75 10.5v2a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1v-2" />,
  key: (
    <>
      <circle cx="5.25" cy="10.75" r="2.75" />
      <path d="m7.25 8.75 6-6M11.25 4.75l1.5 1.5M9.75 6.25l1.25 1.25" />
    </>
  ),
  thumbUp: <path d="M5 7.25 7.5 2.5a1.5 1.5 0 0 1 1.5 1.75l-.5 2.5h3.75a1.25 1.25 0 0 1 1.2 1.6l-1.4 4.75a1.25 1.25 0 0 1-1.2.9H5ZM2.25 7.25H5V14H2.25Z" />,
  thumbDown: <path d="M11 8.75 8.5 13.5A1.5 1.5 0 0 1 7 11.75l.5-2.5H3.75a1.25 1.25 0 0 1-1.2-1.6L3.95 2.9A1.25 1.25 0 0 1 5.15 2H11ZM13.75 8.75H11V2h2.75Z" />,
  play: <path d="M4.5 2.75v10.5l8.5-5.25Z" />,
  warning: <path d="M8 2.25 14.25 13.25H1.75ZM8 6.5v3M8 11.25v.25" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      {paths[name]}
    </svg>
  );
}
