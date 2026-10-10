// same outline style as the app icons (20x20, 1.5 stroke)
const PATHS = {
  chain: <><rect x="2.5" y="7.5" width="7" height="5" rx="2.5" /><rect x="10.5" y="7.5" width="7" height="5" rx="2.5" /></>,
  table: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14M8 4v12" /></>,
  matrix: <><path d="M6 3.5H4v13h2M14 3.5h2v13h-2" /><path d="M7.5 7h.01M10 7h.01M12.5 7h.01M7.5 10h.01M10 10h.01M12.5 10h.01M7.5 13h.01M10 13h.01M12.5 13h.01" strokeWidth="2" /></>,
  target: <><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="3" /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" /></>,
  code: <path d="M7 6 3 10l4 4M13 6l4 4-4 4M11 4.5 9 15.5" />,
  shield: <><path d="M10 2.5 16 5v5c0 3.6-2.5 6.3-6 7.5-3.5-1.2-6-3.9-6-7.5V5z" /><path d="m7.2 10 2 2 3.6-4" /></>,
  jacobian: <path d="M8 4h5M10.5 4v8a3.5 3.5 0 0 1-7 0" />,
  export: <><path d="M10 12V3M6.5 6.5 10 3l3.5 3.5" /><path d="M4 11v5.5h12V11" /></>,
  download: <><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" /><path d="M4 13v3.5h12V13" /></>,
  sun: <><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></>,
  moon: <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" />,
  globe: <><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z" /></>,
  menu: <path d="M3 5.5h14M3 10h14M3 14.5h14" />,
  close: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  check: <path d="M4 10.5 8 14.5 16 5.5" />,
  play: <path d="M6 4l10 6-10 6z" />,
  rotate: <><path d="M16 10a6 6 0 1 1-2-4.47" /><path d="M14.5 2.5v3.5H11" /></>,
  windows: <path d="M3 4.5 9 3.6v5.9H3zM10.2 3.4 17 2.4v7.1h-6.8zM3 10.6h6v5.8l-6-.9zM10.2 10.6H17v7l-6.8-1z" fill="currentColor" stroke="none" />,
  apple: <path d="M13.3 10.6c0-1.6 1.3-2.4 1.4-2.5-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.8 1.7-1.2 2.1-.3 5.2.9 6.9.6.8 1.2 1.7 2.1 1.7.8 0 1.2-.5 2.2-.5s1.3.5 2.2.5c.9 0 1.5-.8 2-1.6.6-.9.9-1.8.9-1.9 0 0-1.8-.7-1.8-3zM11.6 5.6c.5-.6.8-1.4.7-2.2-.7 0-1.5.5-2 1.1-.4.5-.8 1.3-.7 2.1.8.1 1.5-.4 2-1z" fill="currentColor" stroke="none" />,
  github: <path d="M10 2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.4c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.7-3.6 3.9.3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 10 2z" fill="currentColor" stroke="none" />,
  arrow: <path d="M4 10h12M11 5l5 5-5 5" />,
  keyboard: <><rect x="2.5" y="5" width="15" height="10" rx="2" /><path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M5.5 11h.01M14.5 11h.01M8 11.5h4" strokeWidth="1.8" /></>,
};

export default function Icon({ name, size = 20 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] || null}
    </svg>
  );
}
