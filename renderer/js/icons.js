// Outline icon set (20x20 grid, 1.5 stroke) in the spirit of Spectrum UI icons.
const P = {
  menu: '<path d="M3 5.5h14M3 10h14M3 14.5h14"/>',
  home: '<path d="M3.5 9 10 3.5 16.5 9v7a.5.5 0 0 1-.5.5h-4v-5h-4v5H4a.5.5 0 0 1-.5-.5z"/>',
  robot: '<rect x="4" y="6" width="12" height="9" rx="2"/><path d="M10 3v3M7.5 10h.01M12.5 10h.01M2 10v2M18 10v2"/>',
  undo: '<path d="M7 5 3.5 8.5 7 12"/><path d="M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9"/>',
  redo: '<path d="M13 5l3.5 3.5L13 12"/><path d="M16 8.5H8.5a4.5 4.5 0 0 0 0 9H11"/>',
  theme: '<circle cx="10" cy="10" r="6.5"/><path d="M10 3.5v13a6.5 6.5 0 0 0 0-13z" fill="currentColor"/>',
  save: '<path d="M4 3.5h9.5L16.5 6.5V16a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M6.5 3.5v4h6v-4M6.5 16.5v-5h7v5"/>',
  winMin: '<path d="M5 10h10"/>',
  winMax: '<rect x="5" y="5" width="10" height="10" rx="1"/>',
  winClose: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  close: '<path d="M6 6l8 8M14 6l-8 8"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  trash: '<path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10.5h7.4L14.5 6"/>',
  copy: '<rect x="7" y="7" width="9.5" height="9.5" rx="1.5"/><path d="M13 7V4.5a1 1 0 0 0-1-1H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1H7"/>',
  grip: '<path d="M8 5h.01M12 5h.01M8 10h.01M12 10h.01M8 15h.01M12 15h.01" stroke-width="2.4"/>',
  chain: '<rect x="2.5" y="7.5" width="7" height="5" rx="2.5"/><rect x="10.5" y="7.5" width="7" height="5" rx="2.5"/>',
  props: '<path d="M4 6h7M15 6h1M4 14h1M9 14h7"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="14" r="2"/>',
  sliders: '<path d="M5 3v14M10 3v14M15 3v14"/><rect x="3" y="11" width="4" height="3" rx="1" fill="currentColor"/><rect x="8" y="5" width="4" height="3" rx="1" fill="currentColor"/><rect x="13" y="9" width="4" height="3" rx="1" fill="currentColor"/>',
  target: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="3"/><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3"/>',
  matrix: '<path d="M6 3.5H4v13h2M14 3.5h2v13h-2"/><path d="M7.5 7h.01M10 7h.01M12.5 7h.01M7.5 10h.01M10 10h.01M12.5 10h.01M7.5 13h.01M10 13h.01M12.5 13h.01" stroke-width="2"/>',
  params: '<path d="M10 3.5c-1.8 0-2.4.9-2.7 2.8L6 14c-.3 1.8-.9 2.5-2.5 2.5"/><path d="M5 8.5h4.5"/><path d="M11.5 9l5 6M16.5 9l-5 6"/>',
  code: '<path d="M7 6 3 10l4 4M13 6l4 4-4 4M11 4.5 9 15.5"/>',
  cursor: '<path d="M5 3.5 15 9l-4.5 1.5L8.5 15z"/>',
  move: '<path d="M10 2.5v15M2.5 10h15M10 2.5 8 4.5M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2"/>',
  rotate: '<path d="M16 10a6 6 0 1 1-2-4.47"/><path d="M14.5 2.5v3.5H11"/>',
  frames: '<path d="M5 15V5M5 15h10M5 15l6-4"/>',
  cloud: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="13" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/><circle cx="8" cy="15" r="1" fill="currentColor"/><circle cx="11" cy="10" r="1" fill="currentColor"/>',
  fit: '<path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4"/>',
  cube: '<path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z"/><path d="M3.5 6 10 9.5 16.5 6M10 9.5v8"/>',
  zoomIn: '<circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4M9 6.5v5M6.5 9h5"/>',
  zoomOut: '<circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4M6.5 9h5"/>',
  folder: '<path d="M2.5 5.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z"/>',
  file: '<path d="M5 2.5h6.5l3.5 3.5v11.5H5z"/><path d="M11.5 2.5V6H15"/>',
  export: '<path d="M10 12V3M6.5 6.5 10 3l3.5 3.5"/><path d="M4 11v5.5h12V11"/>',
  play: '<path d="M6 4l10 6-10 6z"/>',
  check: '<path d="M4 10.5 8 14.5 16 5.5"/>',
  warn: '<path d="M10 3 18 17H2z"/><path d="M10 8v4M10 14.5h.01"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.5h.01"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4"/>',
  base: '<path d="M3 16h14M5 16l1.5-4h7L15 16M10 12V4"/>',
  tool: '<path d="M10 3v6M6 9h8M6 9v4l2 3M14 9v4l-2 3"/>',
  chevronDown: '<path d="M5.5 8 10 12.5 14.5 8"/>',
  chevronRight: '<path d="M8 5.5 12.5 10 8 14.5"/>',
  home2: '<path d="M10 4v12M4 10h12"/><circle cx="10" cy="10" r="3"/>',
  dice: '<rect x="3.5" y="3.5" width="13" height="13" rx="2.5"/><path d="M7 7h.01M13 7h.01M10 10h.01M7 13h.01M13 13h.01" stroke-width="2.2"/>',
  link: '<path d="M8.5 11.5l3-3"/><path d="M9 6.5 10.5 5a3 3 0 0 1 4.5 4.5L13.5 11M11 13.5 9.5 15A3 3 0 0 1 5 10.5L6.5 9"/>',
  globe: '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z"/>',
  sparkle: '<path d="M10 2.5 11.6 8.4 17.5 10l-5.9 1.6L10 17.5l-1.6-5.9L2.5 10l5.9-1.6z"/>',
};

// Colourful palette glyphs (rendered inside coloured tiles).
const G = {
  revolute: '<circle cx="10" cy="10" r="5.5"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><path d="M15.5 10a5.5 5.5 0 0 1-2 4.2"/><path d="m14.2 15.6-.7-1.4 1.5-.4"/>',
  prismatic: '<rect x="3" y="7.5" width="9" height="5" rx="1"/><path d="M12 10h5M15 8l2 2-2 2"/>',
  fixed: '<path d="M4 15 16 5"/><circle cx="4" cy="15" r="2" fill="currentColor"/><circle cx="16" cy="5" r="2" fill="currentColor"/>',
  matrix: P.matrix,
  arm: '<path d="M4 16.5h6M7 16.5V12l3-6 5 2"/><circle cx="7" cy="12" r="1.3" fill="currentColor"/><circle cx="10" cy="6" r="1.3" fill="currentColor"/><path d="M15 8l1.5 2.5M15 8l2-1"/>',
  leg: '<path d="M5 4.5h10"/><path d="M8 4.5 11 10l-3 5.5h3"/><circle cx="11" cy="10" r="1.3" fill="currentColor"/><circle cx="8" cy="4.5" r="1.3" fill="currentColor"/>',
  planar: '<circle cx="4.5" cy="14.5" r="1.3" fill="currentColor"/><path d="M4.5 14.5 11 9l5 3"/><circle cx="11" cy="9" r="1.3" fill="currentColor"/>',
  scara: '<path d="M5 17V5h7l3 3v6"/><path d="M15 14v3"/><circle cx="5" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="5" r="1.3" fill="currentColor"/>',
  blank: P.plus,
  ik: P.target,
  jacobian: '<path d="M8 4h5M10.5 4v8a3.5 3.5 0 0 1-7 0"/>',
  workspace: P.cloud,
};

function svg(body) {
  return `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function icon(name) {
  return svg(P[name] || G[name] || P.info);
}

export function glyph(name) {
  return svg(G[name] || P[name] || P.info);
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstChild) el.innerHTML = icon(el.dataset.icon);
  });
}
