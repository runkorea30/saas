// Lightweight line icons (16px default). Stroke inherits currentColor.
const Ico = ({ d, size = 16, fill = "none", stroke = "currentColor", sw = 1.6, children, vb = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={vb} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {children || <path d={d} />}
  </svg>
);

const I = {
  search:      (p) => <Ico {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Ico>,
  bell:        (p) => <Ico {...p}><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></Ico>,
  chev:        (p) => <Ico {...p}><path d="m6 9 6 6 6-6"/></Ico>,
  chevR:       (p) => <Ico {...p}><path d="m9 6 6 6-6 6"/></Ico>,
  arrowUp:     (p) => <Ico {...p}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></Ico>,
  arrowDown:   (p) => <Ico {...p}><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></Ico>,
  arrowRight:  (p) => <Ico {...p}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></Ico>,
  plus:        (p) => <Ico {...p}><path d="M12 5v14M5 12h14"/></Ico>,
  grid:        (p) => <Ico {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Ico>,
  cart:        (p) => <Ico {...p}><path d="M3 4h2l2.5 12h11L21 8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/></Ico>,
  box:         (p) => <Ico {...p}><path d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5v-9Z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/></Ico>,
  truck:       (p) => <Ico {...p}><path d="M3 6h12v10H3z"/><path d="M15 9h4l2 3v4h-6"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></Ico>,
  users:       (p) => <Ico {...p}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19c0-2.5-1.8-4.5-4-4.5"/></Ico>,
  doc:         (p) => <Ico {...p}><path d="M7 3h8l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/></Ico>,
  coin:        (p) => <Ico {...p}><circle cx="12" cy="12" r="8"/><path d="M9 10c0-1 1-2 3-2s3 1 3 2-1 1.5-3 2-3 1-3 2 1 2 3 2 3-1 3-2"/><path d="M12 6v2M12 16v2"/></Ico>,
  receipt:     (p) => <Ico {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></Ico>,
  bank:        (p) => <Ico {...p}><path d="M3 10 12 4l9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8"/><path d="M3 20h18"/></Ico>,
  chart:       (p) => <Ico {...p}><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 5-6"/></Ico>,
  cog:         (p) => <Ico {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></Ico>,
  home:        (p) => <Ico {...p}><path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></Ico>,
  clock:       (p) => <Ico {...p}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></Ico>,
  warn:        (p) => <Ico {...p}><path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 18h0"/></Ico>,
  check:       (p) => <Ico {...p}><path d="m5 13 4 4 10-10"/></Ico>,
  x:           (p) => <Ico {...p}><path d="M6 6l12 12M6 18 18 6"/></Ico>,
  sun:         (p) => <Ico {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></Ico>,
  moon:        (p) => <Ico {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></Ico>,
  filter:      (p) => <Ico {...p}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></Ico>,
  download:    (p) => <Ico {...p}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></Ico>,
  sparkles:    (p) => <Ico {...p}><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><path d="m6.3 6.3 2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8"/></Ico>,
  refresh:     (p) => <Ico {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></Ico>,
  dots:        (p) => <Ico {...p}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></Ico>,
  menu:        (p) => <Ico {...p}><path d="M4 6h16M4 12h16M4 18h16"/></Ico>,
  cmd:         (p) => <Ico {...p}><path d="M9 6a3 3 0 1 0-3 3h3zM15 6a3 3 0 1 1 3 3h-3zM9 18a3 3 0 1 1-3-3h3zM15 18a3 3 0 1 0 3-3h-3z"/><path d="M9 9h6v6H9z"/></Ico>,
};

window.I = I;
