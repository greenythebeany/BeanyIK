import * as M from './core/mat.js';
import {
  makeJoint, makeRobot, prepare, dhToElems, fk, jacobian, manipulability, jointGeometry,
  sampleWorkspace, toDisplay, fromDisplay, isActive,
} from './core/robot.js';
import { solveIK, solveAnalytic, ANALYTIC_TEMPLATE } from './core/ik.js';
import { PRESETS, blankRobot } from './core/presets.js';
import { demoFor, hasPathDemo, samplePath } from './core/demos.js';
import { toMatlab, dhTableCSV, dhTableLatex, matrixToText, matrixToMatlab } from './core/export.js';
import { FUNCTION_NAMES } from './core/expr.js';
import { icon, glyph, hydrateIcons } from './icons.js';
import { Viewport } from './viewport.js';
import { t, getLang, setLang, translateStatic } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 3) => (Number.isFinite(v) ? (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d) : 'n/a');
// sym('θ', 2) gives θ₂ in the math font
const sym = (s, sub) => `<span class="mi">${s}</span>${sub !== undefined && sub !== '' ? `<sub>${sub}</sub>` : ''}`;
// pretty print a field like the textbook does, L1*2 becomes L₁·2
const MATH_FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'exp', 'log', 'ln', 'min', 'max', 'deg', 'rad', 'sind', 'cosd', 'hypot', 'sign']);
const mathExpr = (src) => esc(String(src ?? '').trim()).replace(/[A-Za-z_]+\d*|-|\*/g, (m) => {
  if (m === '-') return '−';
  if (m === '*') return '·';
  if (m === 'pi') return 'π';
  if (MATH_FUNCS.has(m)) return m;
  const [, name, digits] = /^([A-Za-z_]+?)(\d*)$/.exec(m);
  return sym(name, digits || undefined);
});
const deg = (v) => `${v}°`;

const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// state
const state = {
  view: 'home',
  robot: null,
  prep: null,
  qById: {},
  selected: null, // joint id | 'base' | 'tool'
  panel: 'chain',
  panelOpen: true,
  filePath: null,
  dirty: false,
  tool: 'select', // select | translate | rotate
  showFrames: true,
  showWorkspace: false,
  camView: 'iso',
  ik: { target: null, live: true, mode: 'full', result: null, analytic: null },
  matrixView: 'total',
  history: { past: [], future: [] },
  camera: null,
};

// open tabs. the active one lives in `state`, the rest are parked in `docs`
const DOC_KEYS = ['robot', 'prep', 'qById', 'selected', 'filePath', 'dirty', 'ik', 'matrixView', 'showWorkspace', 'history', 'camera'];
const docs = [];
let activeDoc = -1;

const PANELS = [
  { id: 'chain', title: 'Kinematic chain', icon: 'chain' },
  { id: 'props', title: 'Properties', icon: 'props' },
  { id: 'joints', title: 'Joint controls', icon: 'sliders' },
  { id: 'ik', title: 'Inverse kinematics', icon: 'target' },
  { id: 'matrices', title: 'Matrices & Jacobian', icon: 'matrix' },
  { id: 'params', title: 'Parameters', icon: 'params' },
  { id: 'code', title: 'Analytic IK solver', icon: 'code' },
];

const PART_TYPES = [
  { kind: 'revolute', name: 'Revolute joint', desc: 'Rotates about its z axis', tile: 'blue', glyph: 'revolute' },
  { kind: 'prismatic', name: 'Prismatic joint', desc: 'Slides along its z axis', tile: 'orange', glyph: 'prismatic' },
  { kind: 'fixed', name: 'Fixed link', desc: 'Rigid offset, no DOF', tile: 'gray', glyph: 'fixed' },
  { kind: 'matrix', name: 'Matrix joint', desc: 'Your own 4×4 transform', tile: 'purple', glyph: 'matrix' },
];

function partToJoint(kind) {
  if (kind === 'matrix') return makeJoint('revolute', { mode: 'matrix' });
  return makeJoint(kind);
}

// helpers
function activeJoints() {
  return state.robot.joints.filter(isActive);
}

function currentQ() {
  return state.prep.activeLinks.map((l) => {
    const v = state.qById[l.joint.id];
    return Number.isFinite(v) ? v : l.home;
  });
}

function setQ(q) {
  state.prep.activeLinks.forEach((l, i) => {
    const [lo, hi] = [l.min, l.max];
    state.qById[l.joint.id] = Math.min(hi, Math.max(lo, q[i]));
  });
}

function jointLabel(j, i) {
  return j.name || `${t(j.type === 'fixed' ? 'Link' : 'Joint')} ${i + 1}`;
}

function errorsFor(id) {
  return Object.entries(state.prep?.errors || {}).filter(([k]) => k.startsWith(`${id}.`));
}

function errorIds() {
  const ids = new Set();
  for (const k of Object.keys(state.prep?.errors || {})) ids.add(k.split('.')[0]);
  return ids;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${kind ? icon(kind === 'ok' ? 'check' : kind === 'err' ? 'warn' : 'info') : ''}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// history / dirty
function snapshot() {
  return JSON.stringify({ robot: state.robot, qById: state.qById });
}

function checkpoint() {
  stopMotion();
  state.history.past.push(snapshot());
  if (state.history.past.length > 200) state.history.past.shift();
  state.history.future = [];
  updateUndoButtons();
}

function restore(snap) {
  const s = JSON.parse(snap);
  state.robot = s.robot;
  state.qById = s.qById;
  if (state.selected && !['base', 'tool'].includes(state.selected) && !state.robot.joints.some((j) => j.id === state.selected)) state.selected = null;
  markDirty();
  refresh({ panel: true });
}

function undo() {
  if (!state.history.past.length) return;
  state.history.future.push(snapshot());
  restore(state.history.past.pop());
  updateUndoButtons();
}

function redo() {
  if (!state.history.future.length) return;
  state.history.past.push(snapshot());
  restore(state.history.future.pop());
  updateUndoButtons();
}

function updateUndoButtons() {
  $('#btn-undo').disabled = !state.history.past.length;
  $('#btn-redo').disabled = !state.history.future.length;
}

function markDirty(d = true) {
  state.dirty = d;
  renderTabs();
  autosave();
}

let autosaveTimer = null;
function saveSessionNow() {
  clearTimeout(autosaveTimer);
  store.set('beanyik_session', {
    docs: docs.map((d, i) => {
      const src = i === activeDoc ? state : d;
      return { robot: src.robot, qById: src.qById, filePath: src.filePath, dirty: src.dirty };
    }),
    active: activeDoc,
    savedAt: Date.now(),
  });
}

function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveSessionNow, 400);
}

// open document
function docField(i, key) {
  return i === activeDoc ? state[key] : docs[i][key];
}

function stashActive() {
  if (activeDoc < 0) return;
  state.camera = viewport.getCamera();
  for (const k of DOC_KEYS) docs[activeDoc][k] = state[k];
}

function loadDoc(i) {
  for (const k of DOC_KEYS) state[k] = docs[i][k];
  activeDoc = i;
}

function switchToDoc(i, { stash = true } = {}) {
  if (i < 0 || i >= docs.length) return;
  if (i !== activeDoc) stopMotion();
  if (i !== activeDoc) {
    if (stash) stashActive();
    loadDoc(i);
    viewport.setWorkspace(null);
    showView('doc');
    refresh({ panel: true });
    syncTargetGizmo();
    if (state.camera) viewport.setCamera(state.camera);
    else requestAnimationFrame(() => viewport.frame(state.camView));
  } else {
    showView('doc');
  }
  renderQuickRail();
  updateUndoButtons();
  autosave();
}

function openRobot(robot, { filePath = null, qById = null, dirty = false } = {}) {
  const r = makeRobot(robot);
  r.joints = r.joints.map((j) => ({ ...makeJoint(j.type), ...j, dh: { ...makeJoint(j.type).dh, ...j.dh } }));
  const prep = prepare(r);
  docs.push({
    robot: r,
    prep,
    qById: qById || {},
    selected: null,
    filePath,
    dirty,
    ik: { target: null, live: true, mode: prep.dof >= 6 ? 'full' : 'position', result: null, analytic: null },
    matrixView: 'total',
    showWorkspace: false,
    history: { past: [], future: [] },
    camera: null,
  });
  stashActive();
  loadDoc(docs.length - 1);
  if (!qById) setQ(state.prep.home);
  viewport.setWorkspace(null);
  showView('doc');
  refresh({ panel: true });
  resetTargetToEE();
  syncTargetGizmo();
  requestAnimationFrame(() => viewport.frame(state.camView));
  renderQuickRail();
  updateUndoButtons();
  autosave();
}

// own confirm box, the native one breaks input focus in electron
function confirmDialog(message, { okLabel = t('Close tab'), cancelLabel = t('Cancel'), danger = true } = {}) {
  return new Promise((resolve) => {
    const el = $('#confirm');
    el.innerHTML = `
      <div class="modal-card confirm-card" role="alertdialog" aria-modal="true">
        <div class="confirm-body">${icon('warn')}<p>${esc(message)}</p></div>
        <div class="row" style="justify-content:flex-end;gap:8px;margin-top:18px">
          <button class="btn" data-confirm="0" style="flex:0">${cancelLabel}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm="1" style="flex:0">${okLabel}</button>
        </div>
      </div>`;
    el.hidden = false;
    const done = (v) => {
      el.hidden = true;
      el.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onClick = (e) => {
      if (e.target === el) return done(false);
      const b = e.target.closest('[data-confirm]');
      if (b) done(b.dataset.confirm === '1');
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); }
      if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); done(true); }
    };
    el.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    el.querySelector('[data-confirm="1"]').focus();
  });
}

async function closeDoc(i = activeDoc) {
  if (i < 0 || i >= docs.length) return;
  if (docField(i, 'dirty')) {
    const docRef = docs[i];
    const ok = await confirmDialog(t('“{name}” has unsaved changes. Close it anyway?', { name: docField(i, 'robot').name }));
    if (!ok) return;
    i = docs.indexOf(docRef); // tabs may have moved while the dialog was open
    if (i < 0) return;
  }
  if (i !== activeDoc) {
    docs.splice(i, 1);
    if (i < activeDoc) activeDoc--;
    renderTabs();
    autosave();
    return;
  }
  docs.splice(i, 1);
  activeDoc = -1;
  viewport.setWorkspace(null);
  if (docs.length) switchToDoc(Math.min(i, docs.length - 1), { stash: false });
  else {
    state.robot = null;
    showView('home');
    autosave();
  }
}

// Ctrl+1 is home, Ctrl+2 the first robot and so on
function goToTab(n) {
  if (n <= 0) return showView('home');
  if (docs.length) switchToDoc(Math.min(n, docs.length) - 1);
}

function cycleTabs(dir) {
  const count = docs.length + 1;
  const cur = state.view === 'home' ? 0 : activeDoc + 1;
  goToTab((cur + dir + count) % count);
}

function renderTabs() {
  const host = $('#tabs');
  const tabs = docs.map((d, i) => {
    const name = docField(i, 'robot')?.name || t('Untitled robot');
    const active = state.view === 'doc' && i === activeDoc;
    return `<button class="tab doc-tab ${active ? 'active' : ''} ${docField(i, 'dirty') ? 'dirty' : ''}" data-doc="${i}" title="${esc(name)}${i < 7 ? ` (Ctrl+${i + 2})` : ''}">
      ${icon('robot')}<span class="tab-title">${esc(name)}</span><span class="dirty-dot"></span>
      <span class="tab-close" data-close="${i}" title="${t('Close tab')} (Ctrl+W)">${icon('close')}</span>
    </button>`;
  }).join('');
  host.innerHTML = `<button class="tab ${state.view === 'home' ? 'active' : ''}" data-home-tab title="${t('Home')} (Ctrl+1)">${icon('home')}<span>${t('Home')}</span></button>${tabs}
    <button class="tab-new" data-new-tab title="${t('New tab')} (Ctrl+T)">${icon('plus')}</button>`;
  document.title = state.robot ? `${state.robot.name} | BeanyIK` : 'BeanyIK';
}

function showView(view) {
  if (view === 'doc' && activeDoc < 0) view = 'home';
  state.view = view;
  $('#home').hidden = view !== 'home';
  $('#workspace').hidden = view !== 'doc';
  renderTabs();
  if (view === 'home') renderHome();
}

function restoreSession() {
  const s = store.get('beanyik_session', null);
  const list = s?.docs || (s?.robot ? [s] : []);
  list.forEach((d) => openRobot(d.robot, { filePath: d.filePath, qById: d.qById, dirty: !!d.dirty }));
  if (list.length) switchToDoc(Math.max(0, Math.min(s.active ?? 0, docs.length - 1)));
}

// refresh
function refresh({ panel = false, scene = true } = {}) {
  state.prep = prepare(state.robot);
  renderTabs();
  if (scene) { updateScene(); snapTargetToEE(); scheduleWorkspace(); }
  renderRail();
  if (panel) renderPanel();
  else updateFieldErrors();
}

let lastFK = null;
function updateScene() {
  const q = currentQ();
  const res = fk(state.prep, q);
  lastFK = { q, ...res };
  viewport.showFrames = state.showFrames;
  viewport.update({
    frames: res.frames,
    ee: res.ee,
    geometry: jointGeometry(state.prep, q, res),
    selectedId: state.selected,
    errorIds: errorIds(),
    size: state.prep.size,
  });
  renderHud();
  if (state.panel === 'matrices' && state.panelOpen) renderMatricesBody();
  if (state.panel === 'joints' && state.panelOpen) syncJointSliders();
  if (state.panel === 'ik' && state.panelOpen) renderIKStatus();
}

function renderHud() {
  const T = lastFK.ee;
  const { roll, pitch, yaw } = M.toRPY(T);
  let manip = '';
  if (state.prep.dof) {
    const J = jacobian(state.prep, lastFK.q, T);
    const rows = state.prep.dof >= 6 ? 6 : 3;
    const m = manipulability(J, rows);
    const singular = m.sv[m.sv.length - 1] < 1e-3;
    manip = singular ? `<span class="badge warn">${t('near singular')}</span>` : `<span class="badge info">w = ${m.w.toExponential(2)}</span>`;
  }
  $('#hud').innerHTML = `
    <div class="hud-title">${t('End effector')} ${manip}</div>
    <div class="hud-math">
      <div><span class="mi">p</span> = (${fmt(T[0][3])}, ${fmt(T[1][3])}, ${fmt(T[2][3])}) m</div>
      <div><span class="mi">φ</span>, <span class="mi">θ</span>, <span class="mi">ψ</span> = (${fmt(roll / M.DEG, 1)}°, ${fmt(pitch / M.DEG, 1)}°, ${fmt(yaw / M.DEG, 1)}°)</div>
    </div>`;
  const conv = state.robot.convention === 'modified' ? t('Modified DH') : t('Standard DH');
  $('#fig-caption').innerHTML = `<b>${t('Fig.')} ${activeDoc + 1}</b> ${esc(state.robot.name)} · ${state.prep.dof} DOF · ${conv}`;
}

// editing
function getJoint(id) {
  return state.robot.joints.find((j) => j.id === id);
}

function insertJoint(kind, index = state.robot.joints.length) {
  checkpoint();
  const j = partToJoint(kind);
  const n = state.robot.joints.length;
  index = Math.max(0, Math.min(n, index));
  state.robot.joints.splice(index, 0, j);
  state.qById[j.id] = 0;
  state.selected = j.id;
  markDirty();
  refresh({ panel: true });
  fitIfOutOfView();
  if (state.panel !== 'chain' && state.panel !== 'props') openPanel('props');
  toast(t('Added {what}', { what: t(PART_TYPES.find((p) => p.kind === kind)?.name || 'Joint').toLowerCase() }), 'info');
}

function moveJoint(id, toIndex) {
  const arr = state.robot.joints;
  const from = arr.findIndex((j) => j.id === id);
  if (from < 0) return;
  if (toIndex > from) toIndex--;
  if (toIndex === from) return;
  checkpoint();
  const [j] = arr.splice(from, 1);
  arr.splice(toIndex, 0, j);
  markDirty();
  refresh({ panel: true });
  fitIfOutOfView();
}

function deleteJoint(id) {
  const i = state.robot.joints.findIndex((j) => j.id === id);
  if (i < 0) return;
  checkpoint();
  state.robot.joints.splice(i, 1);
  delete state.qById[id];
  if (state.selected === id) state.selected = null;
  markDirty();
  refresh({ panel: true });
  fitIfOutOfView();
}

function duplicateJoint(id) {
  const i = state.robot.joints.findIndex((j) => j.id === id);
  if (i < 0) return;
  checkpoint();
  const copy = JSON.parse(JSON.stringify(state.robot.joints[i]));
  copy.id = makeJoint().id;
  copy.name = copy.name ? `${copy.name} copy` : '';
  state.robot.joints.splice(i + 1, 0, copy);
  state.qById[copy.id] = state.qById[id] ?? 0;
  state.selected = copy.id;
  markDirty();
  refresh({ panel: true });
  fitIfOutOfView();
}

function fitIfOutOfView() {
  requestAnimationFrame(() => { if (!viewport.robotInView()) viewport.frame(state.camView); });
}

function select(id) {
  state.selected = id;
  updateScene();
  if (id && state.panel === 'chain') renderPanel();
  else if (id) openPanel('props');
  else if (state.panel === 'props') renderPanel();
}

// data-bind paths look like robot.name, joint:<id>.dh.theta, param:<i>.value, base.x
function bindTarget(path) {
  const [head, ...rest] = path.split('.');
  let obj;
  if (head.startsWith('joint:')) obj = getJoint(head.slice(6));
  else if (head.startsWith('param:')) obj = state.robot.params[Number(head.slice(6))];
  else if (head === 'robot') obj = state.robot;
  else obj = state.robot[head];
  for (let i = 0; i < rest.length - 1; i++) obj = obj?.[rest[i]];
  return { obj, key: rest[rest.length - 1] };
}

function onBoundInput(el) {
  const { obj, key } = bindTarget(el.dataset.bind);
  if (!obj) return;
  obj[key] = el.value;
  markDirty();
  refresh();
}

function updateFieldErrors() {
  const errs = state.prep.errors;
  $$('[data-err]').forEach((el) => {
    const msg = errs[el.dataset.err] || '';
    el.textContent = msg;
    const input = el.previousElementSibling;
    if (input?.classList.contains('input')) input.classList.toggle('invalid', !!msg);
  });
  $$('[data-errkey]').forEach((el) => el.classList.toggle('invalid', !!errs[el.dataset.errkey]));
  $$('[data-paramval]').forEach((el) => {
    const v = state.prep.scope[el.dataset.paramval];
    el.textContent = Number.isFinite(v) ? `= ${+v.toFixed(5)}` : '';
  });
}

// panels
function openPanel(id) {
  state.panel = id;
  state.panelOpen = true;
  store.set('beanyik_panel', id);
  $('#side-panel').classList.remove('collapsed');
  renderRail();
  renderPanel();
  syncTargetGizmo();
}

function renderRail() {
  const errCount = Object.keys(state.prep?.errors || {}).length;
  $('#right-rail').innerHTML = PANELS.map((p) => `
    <button class="rail-btn ${state.panelOpen && state.panel === p.id ? 'on' : ''}" data-panel="${p.id}" data-tip="${t(p.title)}">
      ${icon(p.icon)}${p.id === 'chain' && errCount ? `<span class="count">${errCount}</span>` : ''}
    </button>`).join('');
}

function renderPanel() {
  const p = PANELS.find((x) => x.id === state.panel);
  $('#side-title').textContent = t(p.title);
  const body = $('#side-body');
  const scroll = body.scrollTop;
  const renderers = { chain: renderChain, props: renderProps, joints: renderJoints, ik: renderIK, matrices: renderMatrices, params: renderParams, code: renderCode };
  body.innerHTML = renderers[state.panel]();
  hydrateIcons(body);
  body.scrollTop = scroll;
  updateFieldErrors();
  if (state.panel === 'joints') syncJointSliders();
  if (state.panel === 'matrices') renderMatricesBody();
  if (state.panel === 'ik') renderIKStatus();
}

// which q this joint drives (1 based), null for fixed links
function qIndexOf(j) {
  if (!isActive(j)) return null;
  return state.robot.joints.filter(isActive).indexOf(j) + 1;
}

function dhCells(j) {
  const k = qIndexOf(j);
  const zero = (v) => /^\s*-?0*(\.0*)?\s*$/.test(String(v ?? '0'));
  const plus = (q, off, unit = '') => (zero(off) ? q : `${q} ${String(off).trim().startsWith('-') ? '−' : '+'} ${mathExpr(String(off).trim().replace(/^-/, ''))}${unit}`);
  const qv = k ? sym('q', k) : '';
  return {
    theta: j.type === 'revolute' ? plus(qv, j.dh.theta, '°') : deg(mathExpr(j.dh.theta)),
    d: j.type === 'prismatic' ? plus(qv, j.dh.d) : mathExpr(j.dh.d),
    a: mathExpr(j.dh.a),
    alpha: deg(mathExpr(j.dh.alpha)),
  };
}

function dhSummary(j) {
  if (j.mode === 'matrix') return t('custom 4×4 transform');
  if (j.mode === 'elem') return elemProductHTML(j);
  const c = dhCells(j);
  const i = state.robot.joints.indexOf(j) + 1;
  return `${sym('θ', i)} = ${c.theta}, ${sym('d', i)} = ${c.d}, ${sym('a', i)} = ${c.a}, ${sym('α', i)} = ${c.alpha}`;
}

// DH table for the chain panel
function dhTableHTML() {
  const r = state.robot;
  if (!r.joints.length) return '';
  const mod = r.convention === 'modified';
  const sa = mod ? 'i−1' : 'i';
  const rows = r.joints.map((j, idx) => {
    if (j.mode === 'matrix') return `<tr><td>${idx + 1}</td><td colspan="4" class="muted">${t('custom 4×4 transform')}</td></tr>`;
    if (j.mode === 'elem') return `<tr><td>${idx + 1}</td><td colspan="4" class="elem-cell">${elemProductHTML(j)}</td></tr>`;
    const c = dhCells(j);
    return mod
      ? `<tr><td>${idx + 1}</td><td>${c.alpha}</td><td>${c.a}</td><td>${c.theta}</td><td>${c.d}</td></tr>`
      : `<tr><td>${idx + 1}</td><td>${c.theta}</td><td>${c.d}</td><td>${c.a}</td><td>${c.alpha}</td></tr>`;
  }).join('');
  const head = mod
    ? `<th>${sym('i')}</th><th>${sym('α', sa)}</th><th>${sym('a', sa)}</th><th>${sym('θ', 'i')}</th><th>${sym('d', 'i')}</th>`
    : `<th>${sym('i')}</th><th>${sym('θ', 'i')}</th><th>${sym('d', 'i')}</th><th>${sym('a', 'i')}</th><th>${sym('α', 'i')}</th>`;
  return `<table class="dh-table"><caption>${t('Table')} 1. ${t(mod ? 'Modified DH' : 'Standard DH')} ${t('parameters')}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function tileFor(j) {
  if (j.mode === 'matrix') return ['purple', 'matrix'];
  return { revolute: ['blue', 'revolute'], prismatic: ['orange', 'prismatic'], fixed: ['gray', 'fixed'] }[j.type];
}

function renderChain() {
  const r = state.robot;
  const nodes = r.joints.map((j, i) => {
    const [tile, g] = tileFor(j);
    const hasErr = errorsFor(j.id).length > 0;
    return `
      <div class="chain-gap" data-gap="${i}"></div>
      <div class="chain-node ${state.selected === j.id ? 'selected' : ''} ${hasErr ? 'has-error' : ''}" data-node="${j.id}" draggable="true">
        <span class="grip">${icon('grip')}</span>
        <span class="tile sm ${tile}">${glyph(g)}</span>
        <div class="node-text">
          <div class="node-name">${esc(jointLabel(j, i))} <span class="node-idx">#${i + 1}</span>${hasErr ? `<span class="badge err">${icon('warn')}${t('error')}</span>` : ''}</div>
          <div class="node-sub">${dhSummary(j)}</div>
        </div>
        <div class="node-actions">
          <button class="icon-btn small" data-act="dup" data-id="${j.id}" title="${t('Duplicate')}">${icon('copy')}</button>
          <button class="icon-btn small danger" data-act="del" data-id="${j.id}" title="${t('Delete')}">${icon('trash')}</button>
        </div>
      </div>`;
  }).join('');
  const special = (id, name, sub, ic) => `
    <div class="chain-node ${state.selected === id ? 'selected' : ''} ${errorsFor(id).length ? 'has-error' : ''}" data-node="${id}">
      <span class="grip" style="visibility:hidden">${icon('grip')}</span>
      <span class="tile sm ${id === 'base' ? 'indigo' : 'red'}">${icon(ic)}</span>
      <div class="node-text"><div class="node-name">${name}</div><div class="node-sub">${esc(sub)}</div></div>
    </div>`;
  const poseSub = (p) => `xyz(${p.x}, ${p.y}, ${p.z})  rpy(${p.roll}°, ${p.pitch}°, ${p.yaw}°)`;
  return `
    <div class="section">
      <div class="field"><label>${t('Robot name')}</label><input class="input" data-bind="robot.name" value="${esc(r.name)}"></div>
    </div>
    <div class="section">
      <div class="section-title">${t('DH convention')}</div>
      <div class="segmented" data-seg="convention">
        <button class="${r.convention === 'standard' ? 'on' : ''}" data-val="standard">${t('Standard (distal)')}</button>
        <button class="${r.convention === 'modified' ? 'on' : ''}" data-val="modified">${t('Modified (Craig)')}</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">${t('Links & joints')} <span class="grow"></span><span class="badge info">${t('{n} DOF', { n: state.prep.dof })}</span></div>
      <div class="chain" id="chain">
        ${special('base', t('Base'), poseSub(r.base), 'base')}
        ${r.joints.length ? nodes + `<div class="chain-gap" data-gap="${r.joints.length}"></div>` : `<div class="chain-gap"></div><div class="chain-empty" data-gap="0">${t('Drag a <b>Revolute</b>, <b>Prismatic</b>, <b>Fixed</b> or <b>Matrix</b> part here from <b>All tools</b>, or click one to append it.')}</div><div class="chain-gap"></div>`}
        ${special('tool', t('Tool / end effector'), poseSub(r.tool), 'tool')}
      </div>
    </div>
    <p class="hint">${t('Drag parts from the left to insert them anywhere in the chain. Drag the grip to reorder. Click a link in the 3D view to select it.')}</p>
    ${r.joints.length ? `<div class="divider"></div><div class="section">${dhTableHTML()}</div>` : ''}`;
}

function poseFields(key) {
  const p = state.robot[key];
  const f = (k, label, unit) => `<div class="field"><label class="label">${label}<span class="unit">${unit}</span></label><input class="input mono" data-bind="${key}.${k}" value="${esc(p[k])}"><div class="field-error" data-err="${key}.${k}"></div></div>`;
  return `
    <div class="grid3">${f('x', 'x', 'm')}${f('y', 'y', 'm')}${f('z', 'z', 'm')}</div>
    <div class="grid3" style="margin-top:10px">${f('roll', t('Roll (x)'), 'deg')}${f('pitch', t('Pitch (y)'), 'deg')}${f('yaw', t('Yaw (z)'), 'deg')}</div>`;
}

// where the twist that tilts joint j's axis lives. standard DH: the previous
// link's alpha (joint i turns about z of the frame before it), first joint:
// the base roll. modified DH: the joint's own alpha(i-1)
function axisTwistRef(j) {
  const i = state.robot.joints.indexOf(j);
  if (state.robot.convention === 'modified') return { obj: j.dh, key: 'alpha', where: 'own' };
  if (i === 0) return { obj: state.robot.base, key: 'roll', where: 'base' };
  const prev = state.robot.joints[i - 1];
  if (prev.mode === 'matrix') return null;
  return { obj: prev.dh, key: 'alpha', where: 'prev' };
}

const QUICK_ANGLES = ['0', '90', '-90', '180'];
const sameAngle = (a, b) => {
  const x = parseFloat(a), y = parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs((((x - y) % 360) + 540) % 360 - 180) < 1e-6;
};

function quickAngleButtons(act, current, id) {
  return `<div class="segmented quick-angles">${QUICK_ANGLES.map((v) => `<button class="${sameAngle(current, v) ? 'on' : ''}" data-act="${act}" data-v="${v}" data-id="${id}">${v.replace('-', '−')}°</button>`).join('')}</div>`;
}

function jointAxisControls(j) {
  if (!isActive(j) || j.mode !== 'dh') return '';
  const ref = axisTwistRef(j);
  const axisHint = !ref ? t('The previous link is a custom matrix, so tilt the axis inside that matrix.')
    : ref.where === 'base' ? t('First joint, so this turns the robot base.')
    : ref.where === 'prev' ? t('Sets α of the previous link, that is what tilts this joint in standard DH.')
    : t('Sets this joint’s α (i−1), the twist in front of it in modified DH.');
  return `
    <div class="section-title" style="margin-top:14px">${t(j.type === 'revolute' ? 'Rotation axis' : 'Slide axis')}</div>
    ${ref ? quickAngleButtons('axis-tilt', ref.obj[ref.key], j.id) : ''}
    <p class="hint">${axisHint}</p>
    <div class="section-title" style="margin-top:10px">${t(j.type === 'revolute' ? 'Zero direction of the link' : 'Link direction')}</div>
    ${quickAngleButtons('theta-quick', j.dh.theta, j.id)}
    <p class="hint">${t('Turns the link around this joint’s axis (θ offset).')}</p>`;
}

// elementary matrices drawn like the lecture notes: symbolic entries, the
// axis that stays put (rotations) or the moving cell (translations) highlighted
const ELEM_OPS = ['Rx', 'Ry', 'Rz', 'Tx', 'Ty', 'Tz'];
const opLabel = (op) => `${sym(op[0])}<sub>${op[1]}</sub>`;

function symMatrixHTML(op, arg) {
  const c = `cos ${arg}`, s = `sin ${arg}`, ms = `−sin ${arg}`;
  const cells = {
    Rx: [['1', '0', '0', '0'], ['0', c, ms, '0'], ['0', s, c, '0'], ['0', '0', '0', '1']],
    Ry: [[c, '0', s, '0'], ['0', '1', '0', '0'], [ms, '0', c, '0'], ['0', '0', '0', '1']],
    Rz: [[c, ms, '0', '0'], [s, c, '0', '0'], ['0', '0', '1', '0'], ['0', '0', '0', '1']],
    Tx: [['1', '0', '0', arg], ['0', '1', '0', '0'], ['0', '0', '1', '0'], ['0', '0', '0', '1']],
    Ty: [['1', '0', '0', '0'], ['0', '1', '0', arg], ['0', '0', '1', '0'], ['0', '0', '0', '1']],
    Tz: [['1', '0', '0', '0'], ['0', '1', '0', '0'], ['0', '0', '1', arg], ['0', '0', '0', '1']],
  }[op];
  const axis = { Rx: 0, Ry: 1, Rz: 2 }[op];
  const tRow = { Tx: 0, Ty: 1, Tz: 2 }[op];
  const hl = (r, k) => (axis !== undefined ? (r === axis || k === axis) && r < 3 && k < 3 : r === tRow && k === 3);
  return `<div class="sym-matrix">${cells.flatMap((row, r) => row.map((v, k) => `<span class="${hl(r, k) ? 'hl' : ''}">${v}</span>`)).join('')}</div>`;
}

function elemArg(j, e) {
  // show the value the way it's typed, q gets the joint's index, plain angles get a degree sign
  const k = qIndexOf(j);
  const html = mathExpr(e.v).replace(/<span class="mi">q<\/span>/g, k ? sym('q', k) : sym('q'));
  return e.op[0] === 'R' && /^\s*-?[\d.]+\s*$/.test(e.v) ? `${html}°` : html;
}

function elemProductHTML(j) {
  const i = state.robot.joints.indexOf(j) + 1;
  const parts = (j.elems || []).map((e) => `${opLabel(e.op)}(${elemArg(j, e)})`);
  return `<span class="mi">A</span><sub>${i}</sub> = ${parts.join(' · ') || '<span class="mi">I</span>'}`;
}

function elemEditor(j) {
  const rows = (j.elems || []).map((e, k) => `
    <div class="elem-row">
      <div class="elem-head">
        <span class="elem-op">${opLabel(e.op)}</span>
        <input class="input mono" data-bind="joint:${j.id}.elems.${k}.v" value="${esc(e.v)}" spellcheck="false" placeholder="${e.op[0] === 'R' ? 'deg' : 'm'}">
        <span class="unit">${e.op[0] === 'R' ? 'deg' : 'm'}</span>
        <button class="icon-btn small" data-act="elem-up" data-id="${j.id}" data-k="${k}" title="${t('Move up')}" ${k === 0 ? 'disabled' : ''}>${icon('chevronDown').replace('<svg', '<svg style="transform:rotate(180deg)"')}</button>
        <button class="icon-btn small" data-act="elem-down" data-id="${j.id}" data-k="${k}" title="${t('Move down')}" ${k === j.elems.length - 1 ? 'disabled' : ''}>${icon('chevronDown')}</button>
        <button class="icon-btn small danger" data-act="elem-del" data-id="${j.id}" data-k="${k}" title="${t('Remove')}">${icon('trash')}</button>
      </div>
      <div class="field-error" data-err="${j.id}.e${k}"></div>
      ${symMatrixHTML(e.op, elemArg(j, e))}
    </div>`).join('');
  return `
    <div class="section-title">${t('Elementary transforms, multiplied left to right')}</div>
    <div class="elem-product">${elemProductHTML(j)}</div>
    <div class="elem-list">${rows || `<div class="empty-note">${t('No transforms yet. Add one below.')}</div>`}</div>
    <div class="elem-add">${ELEM_OPS.map((op) => `<button class="btn btn-sm" data-act="elem-add" data-op="${op}" data-id="${j.id}">${icon('plus')}${opLabel(op)}</button>`).join('')}</div>
    <div class="field-error" data-err="${j.id}.elems"></div>
    <p class="hint">${t('Rotations in degrees, translations in metres. Use <code>q</code> for the joint variable (degrees for revolute, metres for prismatic) and your parameters like <code>L1</code>.')}</p>`;
}

function elementaryReferenceHTML() {
  const card = (op, arg) => `<div class="elem-ref"><div class="matrix-caption"><span class="eq">${opLabel(op)}(${arg}) =</span></div>${symMatrixHTML(op, arg)}</div>`;
  return `
    <div class="section-title">${t('Rotation about the x, y and z axis')}</div>
    <div class="elem-ref-grid">${['Rx', 'Ry', 'Rz'].map((op) => card(op, sym('φ'))).join('')}</div>
    <div class="section-title" style="margin-top:16px">${t('Translation along the x, y and z axis')}</div>
    <div class="elem-ref-grid">${['Tx', 'Ty', 'Tz'].map((op) => card(op, sym('d'))).join('')}</div>
    <p class="hint">${t('Standard DH is the product')} ${opLabel('Rz')}(${sym('θ')}) · ${opLabel('Tz')}(${sym('d')}) · ${opLabel('Tx')}(${sym('a')}) · ${opLabel('Rx')}(${sym('α')}). ${t('Use “Elementary transforms” on a joint to build your own.')}</p>`;
}

function renderProps() {
  const sel = state.selected;
  if (!sel) {
    return `<div class="notice info">${icon('info')}<div>${t('Select a link in the chain or in the 3D view to edit it. Fields accept expressions: numbers, your parameters (<code>L1</code>), <code>pi</code>, <code>sqrt()</code>, <code>atan2()</code>…')}</div></div>`;
  }
  if (sel === 'base' || sel === 'tool') {
    return `
      <div class="section">
        <div class="section-title">${t(sel === 'base' ? 'Base frame (world → frame 0)' : 'Tool frame (flange → TCP)')}</div>
        ${poseFields(sel)}
      </div>
      <p class="hint">${t('Rotation is applied as R = Rz(yaw)·Ry(pitch)·Rx(roll).')}</p>`;
  }
  const j = getJoint(sel);
  if (!j) return '';
  const i = state.robot.joints.indexOf(j);
  const modified = state.robot.convention === 'modified';
  const angUnit = 'deg';
  const lim = j.type === 'revolute' ? 'deg' : 'm';
  const dhField = (k, label, unit, hint = '') => `
    <div class="field"><label class="label">${label}<span class="unit">${unit}</span></label>
      <input class="input mono" data-bind="joint:${j.id}.dh.${k}" value="${esc(j.dh[k])}" spellcheck="false">
      <div class="field-error" data-err="${j.id}.${k}"></div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  const matrixEditor = () => `
    <div class="matrix-edit">
      ${j.matrix.map((row, r) => row.map((c, k) => `<input class="input mono" data-bind="joint:${j.id}.matrix.${r}.${k}" data-errkey="${j.id}.m${r}${k}" value="${esc(c)}" spellcheck="false" title="${t('row {r}, col {c}', { r: r + 1, c: k + 1 })}">`).join('')).join('')}
      ${['0', '0', '0', '1'].map((v) => `<div class="fixed-cell">${v}</div>`).join('')}
    </div>
    <div class="field-error" data-err="${j.id}.matrix"></div>
    <p class="hint">${t("Entries may use <code>q</code> (this joint's variable: rad for revolute, m for prismatic), your parameters and functions like <code>cos</code>, <code>sin</code>. This is A<sub>{i}</sub>: frame {p} → frame {i}.", { i: i + 1, p: i })}</p>`;
  return `
    <div class="section">
      <div class="field"><label>${t('Name')}</label><input class="input" data-bind="joint:${j.id}.name" value="${esc(j.name)}" placeholder="${esc(jointLabel(j, i))}"></div>
    </div>
    <div class="section">
      <div class="section-title">${t('Joint type')}</div>
      <div class="segmented" data-seg="type">
        <button class="${j.type === 'revolute' ? 'on' : ''}" data-val="revolute">${t('Revolute')}</button>
        <button class="${j.type === 'prismatic' ? 'on' : ''}" data-val="prismatic">${t('Prismatic')}</button>
        <button class="${j.type === 'fixed' ? 'on' : ''}" data-val="fixed">${t('Fixed')}</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">${t('Defined by')}</div>
      <div class="segmented" data-seg="mode">
        <button class="${j.mode === 'dh' ? 'on' : ''}" data-val="dh">${t('DH parameters')}</button>
        <button class="${j.mode === 'elem' ? 'on' : ''}" data-val="elem">${t('Elementary transforms')}</button>
        <button class="${j.mode === 'matrix' ? 'on' : ''}" data-val="matrix">${t('Custom matrix')}</button>
      </div>
    </div>
    <div class="section">
      ${j.mode === 'dh' ? `
        <div class="section-title">${t(modified ? 'Modified DH' : 'Standard DH')} · ${modified ? 'Rx(α) Tx(a) Rz(θ) Tz(d)' : 'Rz(θ) Tz(d) Tx(a) Rx(α)'}</div>
        <div class="grid2">
          ${dhField('theta', j.type === 'revolute' ? t('θ offset') : 'θ', angUnit)}
          ${dhField('d', j.type === 'prismatic' ? t('d offset') : 'd', 'm')}
          ${dhField('a', modified ? 'a (i−1)' : 'a', 'm')}
          ${dhField('alpha', modified ? 'α (i−1)' : 'α', angUnit)}
        </div>
        <p class="hint">${t(j.type === 'revolute' ? 'θ = q + offset.' : j.type === 'prismatic' ? 'd = q + offset.' : 'No joint variable.')} ${t('Angles in degrees; expressions allowed.')}</p>
        ${jointAxisControls(j)}
        ${j.type === 'fixed' ? `
        <div class="section-title" style="margin-top:14px">${t('Point the link')}</div>
        <div class="row" style="gap:6px">
          <button class="btn btn-sm" data-act="link-dir" data-dir="up" data-id="${j.id}">↑ ${t('Up (+Z)')}</button>
          <button class="btn btn-sm" data-act="link-dir" data-dir="x" data-id="${j.id}">${t('Forward (+X)')}</button>
          <button class="btn btn-sm" data-act="link-dir" data-dir="down" data-id="${j.id}">↓ ${t('Down (−Z)')}</button>
        </div>
        <p class="hint">${t("Directions are relative to the previous frame. A fixed link has no joint, so the IK target can't move it; change d (along z) or a (along x) instead.")}</p>` : ''}`
      : j.mode === 'elem' ? elemEditor(j) : matrixEditor()}
    </div>
    ${isActive(j) ? `
    <div class="section">
      <div class="section-title">${t('Limits & home')}</div>
      <div class="grid3">
        <div class="field"><label class="label">${t('Min')}<span class="unit">${lim}</span></label><input class="input mono" data-bind="joint:${j.id}.min" value="${esc(j.min)}"><div class="field-error" data-err="${j.id}.min"></div></div>
        <div class="field"><label class="label">${t('Max')}<span class="unit">${lim}</span></label><input class="input mono" data-bind="joint:${j.id}.max" value="${esc(j.max)}"><div class="field-error" data-err="${j.id}.max"></div></div>
        <div class="field"><label class="label">${t('Home')}<span class="unit">${lim}</span></label><input class="input mono" data-bind="joint:${j.id}.home" value="${esc(j.home)}"><div class="field-error" data-err="${j.id}.home"></div></div>
      </div>
    </div>` : ''}
    <div class="divider"></div>
    <div class="row">
      <button class="btn btn-sm" data-act="dup" data-id="${j.id}">${icon('copy')}${t('Duplicate')}</button>
      <button class="btn btn-sm" data-act="del" data-id="${j.id}">${icon('trash')}${t('Delete')}</button>
    </div>`;
}

function renderJoints() {
  const links = state.prep.activeLinks;
  if (!links.length) return `<div class="notice info">${icon('info')}<div>${t('No movable joints yet. Add a revolute or prismatic joint from <b>All tools</b>.')}</div></div>`;
  return `
    <div class="row" style="margin-bottom:6px">
      <button class="btn btn-sm" data-act="home">${icon('home2')}${t('Home')}</button>
      <button class="btn btn-sm" data-act="zero">${t('Zero')}</button>
      <button class="btn btn-sm" data-act="random">${icon('dice')}${t('Random')}</button>
    </div>
    ${links.map((l, i) => {
      const j = l.joint;
      const unit = j.type === 'revolute' ? '°' : ' m';
      const lo = Number.isFinite(l.min) ? l.min : -Math.PI, hi = Number.isFinite(l.max) ? l.max : Math.PI;
      const step = j.type === 'revolute' ? 0.001 : 0.0005;
      return `
      <div class="joint-ctl" data-jc="${i}">
        <div class="jc-head">
          <span class="tile sm ${tileFor(j)[0]}">${glyph(tileFor(j)[1])}</span>
          <span class="jc-name">q${i + 1} · ${esc(jointLabel(j, state.robot.joints.indexOf(j)))}</span>
          <input class="input jc-val" data-qnum="${i}">
        </div>
        <input type="range" min="${lo}" max="${hi}" step="${step}" data-qrange="${i}">
        <div class="jc-range"><span>${fmt(toDisplay(j, lo), 1)}${unit}</span><span>${fmt(toDisplay(j, hi), 1)}${unit}</span></div>
      </div>`;
    }).join('')}`;
}

function syncJointSliders() {
  const q = currentQ();
  state.prep.activeLinks.forEach((l, i) => {
    const r = $(`[data-qrange="${i}"]`), n = $(`[data-qnum="${i}"]`);
    if (!r || !n) return;
    r.value = q[i];
    const lo = +r.min, hi = +r.max;
    r.style.setProperty('--fill', `${((q[i] - lo) / (hi - lo || 1)) * 100}%`);
    if (document.activeElement !== n) n.value = fmt(toDisplay(l.joint, q[i]), l.joint.type === 'revolute' ? 2 : 4);
    $(`[data-jc="${i}"]`).classList.toggle('at-limit', Math.abs(q[i] - l.min) < 1e-6 || Math.abs(q[i] - l.max) < 1e-6);
  });
}

function renderIK() {
  const tg = state.ik.target || lastFK.ee;
  const { roll, pitch, yaw } = M.toRPY(tg);
  const num = (k, v, unit) => `<div class="field"><label class="label">${k}<span class="unit">${unit}</span></label><input class="input mono" data-tgt="${k}" value="${fmt(v, unit === 'deg' ? 2 : 4)}"></div>`;
  const hasAnalytic = !!state.robot.analyticIK?.trim();
  return `
    <div class="section">
      <div class="section-title">${t('Goal')}</div>
      <div class="segmented" data-seg="ikmode">
        <button class="${state.ik.mode === 'full' ? 'on' : ''}" data-val="full">${t('Position + orientation')}</button>
        <button class="${state.ik.mode === 'position' ? 'on' : ''}" data-val="position">${t('Position only')}</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">${t('Target pose')} <span class="grow"></span><button class="btn btn-sm btn-quiet" data-act="tgt-ee">${icon('target')}${t('Use current')}</button></div>
      <div class="grid3">${num('x', tg[0][3], 'm')}${num('y', tg[1][3], 'm')}${num('z', tg[2][3], 'm')}</div>
      <div class="grid3" style="margin-top:10px">${num('roll', roll / M.DEG, 'deg')}${num('pitch', pitch / M.DEG, 'deg')}${num('yaw', yaw / M.DEG, 'deg')}</div>
      <p class="hint">${t('Or drag the green target in the 3D view (<b>Ctrl+M</b> move, <b>Ctrl+R</b> rotate).')}</p>
    </div>
    <div class="section">
      <label class="switch"><input type="checkbox" data-act="ik-live" ${state.ik.live ? 'checked' : ''}><span class="track"></span>${t('Follow target live (numerical)')}</label>
    </div>
    <div class="row">
      <button class="btn btn-primary" data-act="ik-num">${icon('play')}${t('Solve numerically')}</button>
      <button class="btn" data-act="ik-ana" ${hasAnalytic ? '' : 'disabled'}>${icon('sparkle')}${t('Analytic')}</button>
    </div>
    <div id="ik-status" style="margin-top:14px"></div>
    <div id="ik-solutions" class="stack" style="margin-top:12px"></div>
    <div class="divider"></div>
    <p class="hint">${t('Numerical solver: damped least squares on the geometric Jacobian with joint limits and random restarts. Analytic solver: your closed-form equations in the <b>Analytic IK</b> panel; every branch is checked with forward kinematics.')}</p>`;
}

function renderIKStatus() {
  const el = $('#ik-status');
  if (!el) return;
  const r = state.ik.result;
  if (r) {
    const cls = r.ok ? 'ok' : 'warn';
    el.innerHTML = `<div class="notice ${cls}">${icon(r.ok ? 'check' : 'warn')}<div><b>${t(r.ok ? 'Converged' : 'Target not reached (best effort)')}</b><br>
      ${t('position error {p} mm · orientation error {o}° · {n} iterations', { p: (r.posErr * 1000).toFixed(3), o: (r.rotErr / M.DEG).toFixed(3), n: r.iterations })}${r.restartsUsed ? t(' · restarts used') : ''}</div></div>`;
  } else el.innerHTML = '';
  const sl = $('#ik-solutions');
  const a = state.ik.analytic;
  if (!sl) return;
  if (!a) { sl.innerHTML = ''; return; }
  if (a.error) { sl.innerHTML = `<div class="notice err">${icon('warn')}<div>${esc(a.error)}</div></div>`; return; }
  if (!a.solutions.length) { sl.innerHTML = `<div class="notice warn">${icon('warn')}<div>${t('Analytic solver returned no solutions (target out of reach?).')}</div></div>`; return; }
  const links = state.prep.activeLinks;
  sl.innerHTML = `<div class="section-title">${t('Analytic solutions ({n})', { n: a.solutions.length })}</div>` + a.solutions.map((s, i) => `
    <div class="solution" data-sol="${i}">
      <div class="sol-head">${t('Branch {n}', { n: i + 1 })}
        ${s.ok ? `<span class="badge ok">${t('reaches')}</span>` : `<span class="badge err">${esc(s.reason || t('misses'))}</span>`}
        ${s.ok && !s.inLimits ? `<span class="badge warn">${t('outside limits')}</span>` : ''}</div>
      <div class="sol-q">${s.q.map((v, k) => `<span>${sym('q', k + 1)} = ${links[k] ? fmt(toDisplay(links[k].joint, v), links[k].joint.type === 'revolute' ? 1 : 4) : fmt(v)}${links[k]?.joint.type === 'revolute' ? '°' : ' m'}</span>`).join('')}</div>
    </div>`).join('');
}

function renderMatrices() {
  if (state.matrixView.startsWith('A') && +state.matrixView.slice(1) >= state.robot.joints.length) state.matrixView = 'total';
  const opts = [['total', t('⁰T_ee: base to end effector')], ['jacobian', t('Jacobian J(q) (6 × n)')]];
  state.robot.joints.forEach((j, i) => opts.push([`A${i}`, `A${i + 1}: ${jointLabel(j, i)}`]));
  opts.push(['all', t('All link matrices')]);
  opts.push(['elementary', t('Elementary matrices (reference)')]);
  return `
    <div class="field"><label>${t('Show')}</label>
      <select class="input" data-act="matrix-view">${opts.map(([v, l]) => `<option value="${v}" ${state.matrixView === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div id="matrix-body" style="margin-top:8px"></div>
    <div class="divider"></div>
    <div class="section-title">${t('Export')}</div>
    <div class="stack">
      <button class="btn btn-sm" data-act="copy-matrix">${icon('copy')}${t('Copy shown matrix (MATLAB)')}</button>
      <button class="btn btn-sm" data-act="export-matlab">${icon('export')}${t('Export symbolic FK to MATLAB (.m)')}</button>
      <button class="btn btn-sm" data-act="export-latex">${icon('copy')}${t('Copy DH table as LaTeX')}</button>
      <button class="btn btn-sm" data-act="export-csv">${icon('export')}${t('Export DH table (.csv)')}</button>
    </div>`;
}

function matrixHTML(A, digits = 4) {
  const cols = A[0].length;
  return `<div class="matrix-wrap"><div class="matrix" style="grid-template-columns:repeat(${cols}, auto)">${A.flat().map((v) => {
    const s = fmt(v, digits);
    return `<span class="${Number(s) === 0 ? 'dim' : ''}">${s}</span>`;
  }).join('')}</div></div>`;
}

function shownMatrix() {
  const v = state.matrixView;
  if (v === 'total') return { name: 'T', A: lastFK.ee };
  if (v === 'jacobian') return { name: 'J', A: state.prep.dof ? jacobian(state.prep, lastFK.q, lastFK.ee) : [[0]] };
  if (v.startsWith('A')) { const i = +v.slice(1); return { name: `A${i + 1}`, A: lastFK.A[i] || M.identity() }; }
  return { name: 'T', A: lastFK.ee };
}

function renderMatricesBody() {
  if (state.matrixView.startsWith('A') && +state.matrixView.slice(1) >= state.robot.joints.length) state.matrixView = 'total';
  const el = $('#matrix-body');
  if (!el) return;
  const v = state.matrixView;
  let html = '';
  if (v === 'elementary') {
    el.innerHTML = elementaryReferenceHTML();
    return;
  }
  if (v === 'all') {
    html = lastFK.A.map((A, i) => `<div class="matrix-caption"><span class="eq"><sup>${i}</sup>${sym('A', i + 1)}</span> ${esc(jointLabel(state.robot.joints[i], i))}</div>${matrixHTML(A)}`).join('')
      + `<div class="matrix-caption"><span class="eq"><sup>0</sup>${sym('T')}<sub>ee</sub> = ${sym('T')}<sub>base</sub> ${sym('A', 1)} ⋯ ${sym('A', 'n')} ${sym('T')}<sub>tool</sub></span></div>${matrixHTML(lastFK.ee)}`;
  } else if (v === 'jacobian') {
    if (!state.prep.dof) html = `<div class="notice info">${icon('info')}<div>${t('No movable joints.')}</div></div>`;
    else {
      const J = jacobian(state.prep, lastFK.q, lastFK.ee);
      const rows = state.prep.dof >= 6 ? 6 : 3;
      const m = manipulability(J, rows);
      const Jsq = state.prep.dof === 6 ? M.det(J) : null;
      html = `<div class="matrix-caption"><span class="eq">${sym('J')}(${sym('q')}) =</span> <span>${t('rows: v<sub>x</sub> v<sub>y</sub> v<sub>z</sub> ω<sub>x</sub> ω<sub>y</sub> ω<sub>z</sub> · columns: q₁…q{n}', { n: state.prep.dof })}</span></div>${matrixHTML(J)}
        <div class="stat-row" style="margin-top:12px">
          <div class="stat"><div class="stat-k">${t('manipulability')}</div><div class="stat-v">${m.w.toExponential(2)}</div></div>
          <div class="stat"><div class="stat-k">σ min</div><div class="stat-v">${(m.sv.at(-1) ?? 0).toExponential(2)}</div></div>
          <div class="stat"><div class="stat-k">${Jsq !== null ? 'det J' : 'cond'}</div><div class="stat-v">${Jsq !== null ? Jsq.toExponential(2) : Number.isFinite(m.cond) ? m.cond.toFixed(1) : '∞'}</div></div>
        </div>
        ${m.sv.at(-1) < 1e-3 ? `<div class="notice warn" style="margin-top:10px">${icon('warn')}<div>${t('The arm is at (or very near) a singularity, so it loses a direction of motion here.')}</div></div>` : ''}
        <p class="hint">${rows === 6 ? '' : t('Fewer than 6 DOF: manipulability uses the 3 linear rows. ')}${t('Computed numerically, so it works for custom-matrix joints too.')}</p>`;
    }
  } else {
    const { A } = shownMatrix();
    const { roll, pitch, yaw } = M.toRPY(A);
    const k = v.startsWith('A') ? +v.slice(1) : -1;
    const label = k >= 0 ? `<sup>${k}</sup>${sym('A', k + 1)}(${sym('q', qIndexOf(state.robot.joints[k]) ?? '')})` : `<sup>0</sup>${sym('T')}<sub>ee</sub>(${sym('q')})`;
    html = `<div class="matrix-caption"><span class="eq">${label} =</span></div>` + matrixHTML(A) + (A.length === 4 ? `<p class="hint">p = (${fmt(A[0][3], 4)}, ${fmt(A[1][3], 4)}, ${fmt(A[2][3], 4)}) m · RPY = (${fmt(roll / M.DEG, 2)}°, ${fmt(pitch / M.DEG, 2)}°, ${fmt(yaw / M.DEG, 2)}°)</p>` : '');
  }
  el.innerHTML = html;
}

function renderParams() {
  const rows = state.robot.params.map((p, i) => `
    <div class="param-row">
      <input class="input mono" data-bind="param:${i}.name" value="${esc(p.name)}" placeholder="${t('name')}" data-errkey="param.${esc(p.name)}">
      <input class="input mono" data-bind="param:${i}.value" value="${esc(p.value)}" placeholder="${t('value / expression')}">
      <span class="val" data-paramval="${esc(p.name)}"></span>
      <button class="icon-btn small danger" data-act="param-del" data-i="${i}" title="${t('Remove')}">${icon('trash')}</button>
    </div>`).join('');
  return `
    <p class="hint" style="margin-top:0">${t('Named constants you can use anywhere in the robot, like link lengths or offsets. Later parameters can use earlier ones (e.g. <code>L3 = L1 + L2</code>).')}</p>
    ${rows || `<div class="empty-note">${t('No parameters yet.')}</div>`}
    <button class="btn btn-sm" data-act="param-add" style="margin-top:6px">${icon('plus')}${t('Add parameter')}</button>
    <div class="divider"></div>
    <div class="section-title">${t('Expression reference')}</div>
    <p class="hint">${t('Operators <code>+ - * / ^</code>, constants <code>pi</code> <code>e</code>.<br>Functions:')} ${FUNCTION_NAMES.map((f) => `<code>${f}</code>`).join(' ')}</p>
    <div class="divider"></div>
    <div class="field"><label>${t('Notes')}</label><textarea class="input" rows="5" data-bind="robot.notes" placeholder="${t('Anything worth remembering about this robot…')}">${esc(state.robot.notes)}</textarea></div>`;
}

function renderCode() {
  return `
    <p class="hint" style="margin-top:0">${t('Write your closed-form inverse kinematics here (JavaScript). The function receives the target flange pose <code>T</code>, your parameters <code>P</code> and helpers <code>h</code>, and returns all solution branches.')}</p>
    <textarea class="code-editor" data-bind="robot.analyticIK" spellcheck="false">${esc(state.robot.analyticIK || ANALYTIC_TEMPLATE)}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn btn-primary btn-sm" data-act="code-test">${icon('play')}${t('Test on current pose')}</button>
      <button class="btn btn-sm" data-act="code-template">${t('Insert template')}</button>
    </div>
    <div id="code-result" style="margin-top:12px"></div>`;
}

// IK actions
function resetTargetToEE() {
  state.ik.target = M.clone(lastFK.ee);
  viewport.setTarget(state.ik.target);
}

// motion. everything that moves the arm on its own goes through here so
// joints always travel smoothly, never snap to another configuration

const FOLLOW_TRAVEL = 0.07; // max joint change per frame while chasing the target (rad or m)
const motion = { follow: null, tween: null, demo: null };

function stopMotion() {
  if (motion.follow) cancelAnimationFrame(motion.follow);
  if (motion.tween) cancelAnimationFrame(motion.tween.raf);
  motion.follow = null;
  motion.tween = null;
  stopDemo();
}

// arm chases state.ik.target a little every frame until it gets there
function followTarget() {
  if (motion.follow) return;
  if (motion.tween) { cancelAnimationFrame(motion.tween.raf); motion.tween = null; }
  const step = () => {
    motion.follow = null;
    if (!state.prep.dof) return;
    const res = solveIK(state.prep, state.ik.target, currentQ(), { mode: state.ik.mode, continuous: true, maxTravel: FOLLOW_TRAVEL, maxIter: 60 });
    setQ(res.q);
    state.ik.result = res;
    updateScene();
    if (res.limited) motion.follow = requestAnimationFrame(step);
  };
  motion.follow = requestAnimationFrame(step);
}

// glide from the current pose to q (joint space, eased)
function tweenTo(qTarget) {
  if (motion.tween) cancelAnimationFrame(motion.tween.raf);
  const from = currentQ();
  const dist = Math.max(0, ...qTarget.map((v, i) => Math.abs(v - from[i])));
  const duration = Math.min(1600, Math.max(350, (dist / (120 * M.DEG)) * 1000));
  const t0 = performance.now();
  const tick = (now) => {
    const s = Math.min(1, (now - t0) / duration);
    const e = s * s * (3 - 2 * s);
    setQ(from.map((v, i) => v + (qTarget[i] - v) * e));
    updateScene();
    if (s < 1) motion.tween.raf = requestAnimationFrame(tick);
    else motion.tween = null;
  };
  motion.tween = { raf: requestAnimationFrame(tick) };
}

// demo playback
function startDemo() {
  if (!state.prep.dof) { toast(t('Add a movable joint first'), 'err'); return; }
  stopMotion();
  const demo = demoFor(state.robot);
  const docRef = docs[activeDoc];
  const trail = [];
  let q = currentQ();
  if (demo.kind === 'path') {
    // find a start pose on the path, then ease into it before playing
    const start = solveIK(state.prep, demo.pose(0), state.prep.home, { mode: demo.mode, restarts: 12 });
    q = start.q;
  } else {
    q = demo.q(0, state.prep);
  }
  viewport.setDemoPath(samplePath(demo));
  const from = currentQ();
  const ease = 700;
  let t0 = performance.now();
  const tick = (now) => {
    if (docs[activeDoc] !== docRef || state.view !== 'doc') { stopDemo(); return; }
    const el = now - t0;
    if (el < ease) {
      const s = el / ease, e = s * s * (3 - 2 * s);
      setQ(from.map((v, i) => v + (q[i] - v) * e));
    } else {
      const t = (el - ease) / 1000;
      if (demo.kind === 'path') {
        const res = solveIK(state.prep, demo.pose(t), currentQ(), { mode: demo.mode, continuous: true, maxTravel: FOLLOW_TRAVEL * 2, maxIter: 40 });
        setQ(res.q);
      } else {
        setQ(demo.q(t, state.prep));
      }
      const T = fk(state.prep, currentQ()).ee;
      trail.push(T[0][3], T[1][3], T[2][3]);
      if (trail.length > 3 * 360) trail.splice(0, 3);
      viewport.setTrail(trail);
    }
    updateScene();
    if (motion.demo) motion.demo.raf = requestAnimationFrame(tick);
  };
  motion.demo = { raf: requestAnimationFrame(tick), caption: demo.caption };
  syncTargetGizmo();
  renderDemoChip();
  renderQuickRail();
}

function stopDemo() {
  if (!motion.demo) return;
  cancelAnimationFrame(motion.demo.raf);
  motion.demo = null;
  viewport.setDemoPath(null);
  viewport.setTrail(null);
  renderDemoChip();
  renderQuickRail();
  if (state.robot) { snapTargetToEE(); syncTargetGizmo(); }
}

function toggleDemo() {
  if (motion.demo) stopDemo();
  else startDemo();
}

function renderDemoChip() {
  const el = $('#demo-chip');
  if (!motion.demo) { el.hidden = true; return; }
  el.innerHTML = `<span class="demo-dot"></span><b>${t('Demo')}</b> ${t(motion.demo.caption)} <button class="btn btn-sm" data-demo-stop>${icon('close')}${t('Stop')}</button>`;
  el.hidden = false;
}

const clampAll = (q) => q.map((v, i) => Math.min(state.prep.limits[i][1], Math.max(state.prep.limits[i][0], v)));
// target catches up once a glide is done
function snapLater() {
  const wait = () => (motion.tween ? requestAnimationFrame(wait) : snapTargetToEE());
  requestAnimationFrame(wait);
}

// put the IK target back on the tool after a manual pose change
function snapTargetToEE() {
  if (!lastFK || viewport.tcontrols.dragging) return;
  state.ik.target = M.clone(lastFK.ee);
  state.ik.result = null;
  state.ik.analytic = null;
  viewport.setTarget(state.ik.target);
  if (state.panel === 'ik' && state.panelOpen) {
    const { roll, pitch, yaw } = M.toRPY(state.ik.target);
    const T = state.ik.target;
    const vals = { x: T[0][3], y: T[1][3], z: T[2][3], roll: roll / M.DEG, pitch: pitch / M.DEG, yaw: yaw / M.DEG };
    $$('[data-tgt]').forEach((el) => { if (document.activeElement !== el) el.value = fmt(vals[el.dataset.tgt], ['x', 'y', 'z'].includes(el.dataset.tgt) ? 4 : 2); });
    renderIKStatus();
  }
}

function poseChanged() {
  updateScene();
  snapTargetToEE();
}

let workspaceTimer = null;
function scheduleWorkspace() {
  if (!state.showWorkspace) return;
  clearTimeout(workspaceTimer);
  workspaceTimer = setTimeout(() => {
    if (state.showWorkspace && state.prep.dof) viewport.setWorkspace(sampleWorkspace(state.prep, Math.min(30000, 3000 * state.prep.dof)));
  }, 200);
}

function syncTargetGizmo() {
  const visible = !motion.demo && state.prep?.dof > 0 && (state.tool !== 'select' || (state.panelOpen && state.panel === 'ik'));
  if (!state.ik.target) resetTargetToEE();
  viewport.setTarget(state.ik.target);
  viewport.setTargetVisible(visible, state.tool === 'rotate' ? 'rotate' : 'translate');
}

function runNumericIK(target = state.ik.target, { quiet = false } = {}) {
  if (!state.prep.dof) { if (!quiet) toast(t('Add a movable joint first'), 'err'); return; }
  if (quiet) { state.ik.target = target; followTarget(); return; }
  const res = solveIK(state.prep, target, currentQ(), { mode: state.ik.mode, restarts: 12 });
  checkpoint();
  state.ik.result = res;
  markDirty();
  tweenTo(res.q);
}

function runAnalyticIK() {
  state.ik.analytic = solveAnalytic(state.prep, state.ik.target, state.robot.analyticIK);
  state.ik.result = null;
  renderIKStatus();
  const first = state.ik.analytic.solutions?.find((s) => s.ok && s.inLimits) || state.ik.analytic.solutions?.find((s) => s.ok);
  if (first) {
    checkpoint();
    markDirty();
    tweenTo(first.q);
  }
}

function setTargetFromFields() {
  const v = Object.fromEntries($$('[data-tgt]').map((el) => [el.dataset.tgt, parseFloat(el.value)]));
  if (Object.values(v).some((x) => !Number.isFinite(x))) return;
  state.ik.target = M.fromXYZRPY(v.x, v.y, v.z, v.roll * M.DEG, v.pitch * M.DEG, v.yaw * M.DEG);
  viewport.setTarget(state.ik.target);
  if (state.ik.live) runNumericIK(state.ik.target, { quiet: true });
}

let dragFrame = null;
function onTargetDrag(T) {
  state.ik.target = T;
  if (!state.ik.live || dragFrame) return;
  dragFrame = requestAnimationFrame(() => {
    dragFrame = null;
    followTarget();
    if (state.panel === 'ik') {
      const { roll, pitch, yaw } = M.toRPY(state.ik.target);
      const vals = { x: T[0][3], y: T[1][3], z: T[2][3], roll: roll / M.DEG, pitch: pitch / M.DEG, yaw: yaw / M.DEG };
      $$('[data-tgt]').forEach((el) => { el.value = fmt(vals[el.dataset.tgt], ['x', 'y', 'z'].includes(el.dataset.tgt) ? 4 : 2); });
    }
  });
}

// left panel
function renderTools() {
  const analyze = [
    ['ik', 'Inverse kinematics', 'Drag a target, solve q', 'green', 'ik'],
    ['joints', 'Joint controls', 'Forward kinematics sliders', 'teal', 'sliders'],
    ['matrices', 'Matrices & Jacobian', 'Aᵢ, ⁰Tₙ, J(q), singularities', 'indigo', 'jacobian'],
    ['code', 'Analytic IK solver', 'Plug in your closed form', 'red', 'code'],
    ['workspace', 'Workspace', 'Sample reachable points', 'magenta', 'workspace'],
  ].map(([id, name, desc, ...rest]) => [id, t(name), t(desc), ...rest]);
  $('#tools-panel').innerHTML = `
    <h2>${t('All tools')}</h2>
    <div class="tool-section">
      <div class="tool-section-title">${t('Build: drag into the chain')}</div>
      ${PART_TYPES.map((p) => `
        <div class="tool-item draggable" draggable="true" data-part="${p.kind}" title="${t('Drag into the chain or click to append')}">
          <span class="tile ${p.tile}">${glyph(p.glyph)}</span>
          <div class="tool-text"><span class="tool-name">${t(p.name)}</span><span class="tool-desc">${t(p.desc)}</span></div>
          <span class="drag-handle">${icon('grip')}</span>
        </div>`).join('')}
    </div>
    <div class="tool-section">
      <div class="tool-section-title">${t('Analyze')}</div>
      ${analyze.map(([id, name, desc, tile, g]) => `
        <div class="tool-item" data-analyze="${id}">
          <span class="tile ${tile}">${glyph(g)}</span>
          <div class="tool-text"><span class="tool-name">${name}</span><span class="tool-desc">${desc}</span></div>
        </div>`).join('')}
    </div>
    <div class="tool-section">
      <div class="tool-section-title">${t('Templates')}</div>
      ${PRESETS.map((p, i) => `
        <div class="tool-item" data-preset="${p.id}">
          <span class="tile ${['blue', 'green', 'orange', 'purple'][i % 4]}">${glyph(p.icon)}</span>
          <div class="tool-text"><span class="tool-name">${t(p.title)}</span><span class="tool-desc">${t(p.subtitle)}</span></div>
        </div>`).join('')}
    </div>`;
}

function renderQuickRail() {
  const b = (act, ic, tip, on = false) => `<button class="qbtn ${on ? 'on' : ''}" data-q="${act}" data-tip="${t(tip)}">${icon(ic)}</button>`;
  $('#quick-rail').innerHTML = `
    ${b('select', 'cursor', 'Select (Esc)', state.tool === 'select')}
    ${b('translate', 'move', 'Move IK target (Ctrl+M)', state.tool === 'translate')}
    ${b('rotate', 'rotate', 'Rotate IK target (Ctrl+R)', state.tool === 'rotate')}
    <div class="sep"></div>
    ${b('frames', 'frames', 'Show frames (Ctrl+F)', state.showFrames)}
    ${b('workspace', 'cloud', 'Workspace cloud (Ctrl+K)', state.showWorkspace)}
    <div class="sep"></div>
    ${b('home', 'home2', 'Home pose (Ctrl+H)')}
    ${b('demo', motion.demo ? 'stop' : 'play', motion.demo ? 'Stop demo (Ctrl+P)' : 'Play demo (Ctrl+P)', !!motion.demo)}
    ${b('keys', 'keyboard', 'Keyboard shortcuts (F1)')}`;
}

function renderViewPill() {
  const v = (id, label) => `<button class="pill-text ${state.camView === id ? 'on' : ''}" data-cam="${id}">${t(label)}</button>`;
  $('#view-pill').innerHTML = `
    ${v('iso', 'Iso')}${v('front', 'Front')}${v('side', 'Side')}${v('top', 'Top')}
    <div class="sep"></div>
    <button class="qbtn" data-zoom="1.2" title="${t('Zoom out')}">${icon('zoomOut')}</button>
    <button class="qbtn" data-zoom="0.83" title="${t('Zoom in')}">${icon('zoomIn')}</button>
    <button class="qbtn" data-cam="fit" title="${t('Fit robot')}">${icon('fit')}</button>`;
}

// home
function renderHome() {
  const recent = store.get('beanyik_recent', []);
  const session = store.get('beanyik_session', null);
  const resumeList = (session?.docs || (session?.robot ? [session] : [])).filter((d) => d?.robot);
  const ago = (time) => {
    const s = (Date.now() - time) / 1000;
    if (s < 60) return t('just now');
    if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
    if (s < 86400) return t('{n} h ago', { n: Math.floor(s / 3600) });
    return new Date(time).toLocaleDateString();
  };
  $('#home').innerHTML = `
    <div class="home-inner">
      <h1>${t('Welcome to BeanyIK')}</h1>
      <p class="sub">${t('Build serial robots from parts, then solve their forward and inverse kinematics.')}</p>
      <div class="hero">
        <div>
          <h2>${t('Start building a robot')}</h2>
          <p>${t('Drag revolute and prismatic joints into a chain, describe each one with DH parameters or your own 4×4 matrix, then drag the target and watch the IK solver move it.')}</p>
          <div class="row" style="justify-content:flex-start;flex-wrap:wrap">
            <button class="btn btn-primary" data-home="new" style="flex:0">${icon('plus')}${t('New robot')}</button>
            <button class="btn" data-home="open" style="flex:0">${icon('folder')}${t('Open file')}</button>
            ${resumeList.length && !docs.length ? `<button class="btn" data-home="resume" style="flex:0">${icon('play')}${resumeList.length === 1 ? t('Continue “{name}”', { name: esc(resumeList[0].robot.name) }) : t('Reopen {n} robots', { n: resumeList.length })}</button>` : ''}
          </div>
        </div>
        <img class="hero-art" src="logo.png" width="148" height="148" alt="">
      </div>
      <h3>${t('Start from a template')}</h3>
      <div class="card-grid">
        ${PRESETS.map((p, i) => `
          <div class="card" data-preset="${p.id}">
            <span class="tile ${['blue', 'green', 'orange', 'purple'][i % 4]}">${glyph(p.icon)}</span>
            <div><div class="card-title">${t(p.title)}</div><div class="card-sub">${t(p.subtitle)}</div></div>
            <div class="card-meta">${t('{n} joints · analytic IK included', { n: p.build().joints.length })}</div>
          </div>`).join('')}
        <div class="card" data-home="new">
          <span class="tile gray">${glyph('blank')}</span>
          <div><div class="card-title">${t('Blank robot')}</div><div class="card-sub">${t('Empty chain, drag parts in yourself')}</div></div>
          <div class="card-meta">${t('Standard DH')}</div>
        </div>
      </div>
      <h3>${t('Recent')}</h3>
      <div class="recent-list">
        <div class="recent-row head"><span></span><span>${t('Name')}</span><span>${t('Opened')}</span><span>${t('Location')}</span></div>
        ${recent.length ? recent.map((r, i) => `
          <div class="recent-row" data-recent="${i}">
            <span class="tile sm blue">${icon('robot')}</span>
            <span><b>${esc(r.name)}</b></span>
            <span class="muted">${ago(r.time)}</span>
            <span class="muted" title="${esc(r.filePath)}">${esc(r.filePath)}</span>
          </div>`).join('') : `<div class="empty-note">${t('Robots you save or open will show up here.')}</div>`}
      </div>
    </div>`;
}

function addRecent(filePath, name) {
  const recent = store.get('beanyik_recent', []).filter((r) => r.filePath !== filePath);
  recent.unshift({ filePath, name, time: Date.now() });
  store.set('beanyik_recent', recent.slice(0, 12));
}

// files
function serialize() {
  const q = {};
  state.prep.activeLinks.forEach((l) => { q[l.joint.id] = state.qById[l.joint.id]; });
  return JSON.stringify({ ...state.robot, pose: q }, null, 2);
}

function loadFromText(text, filePath) {
  let data;
  try { data = JSON.parse(text); } catch (e) { toast(t('Not a valid robot file'), 'err'); return; }
  if (!Array.isArray(data.joints)) { toast(t('Not a BeanyIK robot file'), 'err'); return; }
  const { pose, ...robot } = data;
  const already = filePath ? docs.findIndex((d, i) => docField(i, 'filePath') === filePath) : -1;
  if (already >= 0) { switchToDoc(already); return; }
  openRobot(robot, { filePath, qById: pose || null });
  if (filePath) addRecent(filePath, robot.name);
  toast(t('Opened {name}', { name: robot.name }), 'ok');
}

async function openFile() {
  const res = await window.api.openRobot();
  if (res) loadFromText(res.content, res.filePath);
}

async function save(saveAs = false) {
  if (!state.robot) return;
  const safe = (state.robot.name || 'robot').replace(/[^\w\- ]+/g, '').trim() || 'robot';
  const res = await window.api.saveRobot({ content: serialize(), filePath: state.filePath, suggestedName: `${safe}.robot.json`, saveAs });
  if (!res) return;
  state.filePath = res.filePath;
  markDirty(false);
  addRecent(res.filePath, state.robot.name);
  toast(t('Saved'), 'ok');
}

async function exportText(content, name, ext, label) {
  const res = await window.api.exportText({ content, suggestedName: name, filters: [{ name: label, extensions: [ext] }] });
  if (res) toast(t('Exported {name}', { name: res.filePath.split(/[\\/]/).pop() }), 'ok');
}

function newRobot() {
  openRobot(blankRobot());
  openPanel('chain');
}

function loadPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  openRobot(p.build());
  if (hasPathDemo(state.robot)) setTimeout(startDemo, 350);
}

// menu
function toggleMenu(show) {
  const m = $('#menu');
  if (show === undefined) show = m.hidden;
  if (!show) { m.hidden = true; return; }
  const doc = state.view === 'doc';
  const item = (act, ic, label, kbd = '', enabled = true) => enabled ? `<div class="menu-item" data-menu="${act}">${icon(ic)}${t(label)}<span class="kbd">${kbd}</span></div>` : '';
  m.innerHTML = `
    ${item('new', 'plus', 'New robot', 'Ctrl+T')}
    ${item('open', 'folder', 'Open…', 'Ctrl+O')}
    ${item('save', 'save', 'Save', 'Ctrl+S', doc)}
    ${item('saveas', 'save', 'Save as…', 'Ctrl+Shift+S', doc)}
    ${item('close', 'close', 'Close tab', 'Ctrl+W', doc)}
    ${doc ? '<div class="menu-sep"></div>' : ''}
    ${item('export-matlab', 'export', 'Export to MATLAB (.m)', '', doc)}
    ${item('export-csv', 'export', 'Export DH table (.csv)', '', doc)}
    <div class="menu-sep"></div>
    ${item('theme', 'theme', document.documentElement.dataset.theme === 'dark' ? 'Light theme' : 'Dark theme')}
    ${item('lang', 'globe', getLang() === 'sk' ? 'English' : 'Slovenčina')}
    ${item('home', 'home', 'Home')}
    <div class="menu-sep"></div>
    ${item('keys', 'keyboard', 'Keyboard shortcuts', 'F1')}
    ${item('terms', 'file', 'Terms & privacy')}
    ${item('about', 'info', 'About BeanyIK')}`;
  m.hidden = false;
}

function switchLanguage(lang) {
  setLang(lang);
  translateStatic();
  $('#lang-label').textContent = getLang().toUpperCase();
  renderTools();
  renderQuickRail();
  renderViewPill();
  renderTabs();
  if (state.view === 'home') renderHome();
  if (state.robot) refresh({ panel: true });
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('beanyik_theme', next); } catch { /* ignore */ }
  viewport.applyTheme();
}

// dnd
let dragPayload = null; // { kind } when dragging a part, { move: id } when reordering

function clearDropMarks() {
  $$('.drop-on').forEach((el) => el.classList.remove('drop-on'));
  $('#viewport-card').classList.remove('drag-over');
}

function wireDnD() {
  document.addEventListener('dragstart', (e) => {
    const part = e.target.closest?.('[data-part]');
    const node = e.target.closest?.('[data-node]');
    if (part) dragPayload = { kind: part.dataset.part };
    else if (node && !['base', 'tool'].includes(node.dataset.node)) { dragPayload = { move: node.dataset.node }; node.classList.add('dragging'); }
    else return;
    e.dataTransfer.effectAllowed = dragPayload.kind ? 'copy' : 'move';
    e.dataTransfer.setData('text/plain', dragPayload.kind || dragPayload.move);
    if (dragPayload.kind && (!state.panelOpen || state.panel !== 'chain')) openPanel('chain');
  });
  document.addEventListener('dragend', () => {
    dragPayload = null;
    clearDropMarks();
    $$('.dragging').forEach((el) => el.classList.remove('dragging'));
  });
  const gapFrom = (e) => {
    const gap = e.target.closest?.('[data-gap]');
    if (gap) return gap;
    // hovering a node, use the gap above or below it
    const node = e.target.closest?.('[data-node]');
    if (!node || !$('#chain')?.contains(node)) return null;
    const r = node.getBoundingClientRect();
    const id = node.dataset.node;
    if (id === 'base') return $('[data-gap="0"]');
    if (id === 'tool') return $(`[data-gap="${state.robot.joints.length}"]`);
    const idx = state.robot.joints.findIndex((j) => j.id === id);
    return $(`[data-gap="${e.clientY < r.top + r.height / 2 ? idx : idx + 1}"]`);
  };
  document.addEventListener('dragover', (e) => {
    if (!dragPayload) return;
    const gap = gapFrom(e);
    const overViewport = dragPayload.kind && e.target.closest?.('#viewport-card');
    if (gap || overViewport) {
      e.preventDefault();
      e.dataTransfer.dropEffect = dragPayload.kind ? 'copy' : 'move';
    }
    clearDropMarks();
    if (gap) gap.classList.add('drop-on');
    if (overViewport) $('#viewport-card').classList.add('drag-over');
  });
  document.addEventListener('drop', (e) => {
    if (!dragPayload) return;
    e.preventDefault();
    const gap = gapFrom(e);
    const payload = dragPayload;
    dragPayload = null;
    clearDropMarks();
    if (gap) {
      const idx = Number(gap.dataset.gap);
      if (payload.kind) insertJoint(payload.kind, idx);
      else moveJoint(payload.move, idx);
    } else if (payload.kind && e.target.closest('#viewport-card')) {
      insertJoint(payload.kind);
    }
  });
}

// events
function wireEvents() {
  $('#btn-min').onclick = () => window.api.minimize();
  $('#btn-max').onclick = () => window.api.maximize();
  $('#btn-close').onclick = () => window.api.close();
  $('#btn-theme').onclick = toggleTheme;
  $('#btn-lang').onclick = () => switchLanguage(getLang() === 'sk' ? 'en' : 'sk');
  $('#btn-undo').onclick = undo;
  $('#btn-redo').onclick = redo;
  $('#btn-save').onclick = () => (state.view === 'doc' ? save() : openFile());
  $('#btn-menu').onclick = (e) => { e.stopPropagation(); toggleMenu(); };
  $('#demo-chip').addEventListener('click', (e) => { if (e.target.closest('[data-demo-stop]')) stopDemo(); });
  $('#tabs').addEventListener('click', (e) => {
    const close = e.target.closest('[data-close]');
    if (close) { e.stopPropagation(); closeDoc(+close.dataset.close); return; }
    if (e.target.closest('[data-home-tab]')) return showView('home');
    if (e.target.closest('[data-new-tab]')) return newRobot();
    const tab = e.target.closest('[data-doc]');
    if (tab) switchToDoc(+tab.dataset.doc);
  });
  // middle click closes a tab
  $('#tabs').addEventListener('auxclick', (e) => {
    const tab = e.target.closest('[data-doc]');
    if (tab && e.button === 1) closeDoc(+tab.dataset.doc);
  });
  $('#side-close').onclick = () => { state.panelOpen = false; $('#side-panel').classList.add('collapsed'); renderRail(); syncTargetGizmo(); };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#menu') && !e.target.closest('#btn-menu')) toggleMenu(false);
  });

  $('#menu').addEventListener('click', (e) => {
    const it = e.target.closest('[data-menu]');
    if (!it) return;
    toggleMenu(false);
    ({
      new: newRobot, open: openFile, save: () => save(), saveas: () => save(true), theme: toggleTheme, home: () => showView('home'),
      lang: () => switchLanguage(getLang() === 'sk' ? 'en' : 'sk'),
      close: () => closeDoc(),
      keys: () => toggleShortcuts(true),
      terms: () => showAbout('terms'),
      about: () => showAbout('about'),
      'export-matlab': () => doAction('export-matlab'), 'export-csv': () => doAction('export-csv'),
    })[it.dataset.menu]?.();
  });

  $('#home').addEventListener('click', (e) => {
    const el = e.target.closest('[data-home],[data-preset],[data-recent]');
    if (!el) return;
    if (el.dataset.preset) return loadPreset(el.dataset.preset);
    if (el.dataset.recent) {
      const r = store.get('beanyik_recent', [])[+el.dataset.recent];
      window.api.readRobot(r.filePath).then((res) => {
        if (res.error) { toast(t("Can't open: {err}", { err: res.error }), 'err'); return; }
        loadFromText(res.content, res.filePath);
      });
      return;
    }
    const act = el.dataset.home;
    if (act === 'new') newRobot();
    if (act === 'open') openFile();
    if (act === 'resume') {
      restoreSession();
    }
  });

  $('#tools-panel').addEventListener('click', (e) => {
    const part = e.target.closest('[data-part]');
    if (part) {
      const selIdx = state.robot.joints.findIndex((j) => j.id === state.selected);
      insertJoint(part.dataset.part, selIdx >= 0 ? selIdx + 1 : state.robot.joints.length);
      return;
    }
    const an = e.target.closest('[data-analyze]');
    if (an) {
      if (an.dataset.analyze === 'workspace') return toggleWorkspace();
      return openPanel(an.dataset.analyze);
    }
    const pr = e.target.closest('[data-preset]');
    if (pr) loadPreset(pr.dataset.preset);
  });

  $('#right-rail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-panel]');
    if (!b) return;
    if (state.panelOpen && state.panel === b.dataset.panel) {
      state.panelOpen = false;
      $('#side-panel').classList.add('collapsed');
      renderRail();
      syncTargetGizmo();
    } else openPanel(b.dataset.panel);
  });

  $('#quick-rail').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const q = b.dataset.q;
    if (['select', 'translate', 'rotate'].includes(q)) setTool(q);
    if (q === 'frames') { state.showFrames = !state.showFrames; updateScene(); }
    if (q === 'workspace') toggleWorkspace();
    if (q === 'home') doAction('home');
    if (q === 'keys') toggleShortcuts();
    if (q === 'demo') toggleDemo();
    renderQuickRail();
  });

  $('#view-pill').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cam]');
    const z = e.target.closest('[data-zoom]');
    if (c) {
      if (c.dataset.cam !== 'fit') state.camView = c.dataset.cam;
      viewport.frame(state.camView);
      renderViewPill();
    }
    if (z) viewport.zoom(+z.dataset.zoom);
  });

  const side = $('#side-body');
  side.addEventListener('focusin', (e) => {
    if (e.target.dataset.bind) e.target.dataset.snap = snapshot();
  });
  side.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.bind && el.dataset.snap) {
      if (el.dataset.snap !== snapshot()) { state.history.past.push(el.dataset.snap); state.history.future = []; updateUndoButtons(); }
      el.dataset.snap = snapshot();
      if (state.panel === 'props' && el.dataset.bind.includes('.name')) renderRail();
    }
    if (el.dataset.act === 'matrix-view') { state.matrixView = el.value; renderMatricesBody(); }
    if (el.dataset.act === 'ik-live') state.ik.live = el.checked;
    if (el.dataset.tgt) setTargetFromFields();
    if (el.dataset.qnum !== undefined) {
      const i = +el.dataset.qnum;
      const l = state.prep.activeLinks[i];
      const v = parseFloat(el.value);
      if (Number.isFinite(v)) {
        checkpoint();
        const q = currentQ();
        q[i] = fromDisplay(l.joint, v);
        markDirty();
        tweenTo(clampAll(q));
        snapLater();
      }
    }
  });
  side.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.bind) {
      onBoundInput(el);
      if (el.dataset.bind.startsWith('param:') && el.dataset.bind.endsWith('.name')) {
        el.dataset.errkey = `param.${el.value}`;
        const valEl = el.parentElement.querySelector('[data-paramval]');
        if (valEl) valEl.dataset.paramval = el.value;
        updateFieldErrors();
      }
    }
    if (el.dataset.qrange !== undefined) {
      const i = +el.dataset.qrange;
      const q = currentQ();
      q[i] = +el.value;
      setQ(q);
      markDirty();
      poseChanged();
    }
  });
  side.addEventListener('pointerdown', (e) => { if (e.target.dataset.qrange !== undefined) checkpoint(); });
  side.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input.input')) e.target.blur();
    if (e.key === 'Tab' && e.target.matches('.code-editor')) {
      e.preventDefault();
      const ta = e.target, s = ta.selectionStart;
      ta.setRangeText('  ', s, ta.selectionEnd, 'end');
      onBoundInput(ta);
    }
  });
  side.addEventListener('click', (e) => {
    const seg = e.target.closest('[data-seg] button');
    if (seg) {
      const kind = seg.parentElement.dataset.seg, val = seg.dataset.val;
      if (kind === 'ikmode') { state.ik.mode = val; renderPanel(); return; }
      checkpoint();
      if (kind === 'convention') state.robot.convention = val;
      if (kind === 'type' || kind === 'mode') {
        const j = getJoint(state.selected);
        if (kind === 'mode' && val === 'elem' && j.mode !== 'elem' && !(j.elems && j.elems.length)) {
          j.elems = dhToElems(j, state.robot.convention === 'modified');
        }
        j[kind] = val;
        if (kind === 'type' && val === 'prismatic' && j.type === 'prismatic' && /^-?180$/.test(j.min)) { j.min = '0'; j.max = '0.3'; }
        if (kind === 'type' && val === 'revolute' && j.min === '0' && j.max === '0.3') { j.min = '-180'; j.max = '180'; }
        state.qById[j.id] = 0;
      }
      markDirty();
      refresh({ panel: true });
      return;
    }
    const node = e.target.closest('[data-node]');
    const act = e.target.closest('[data-act]');
    if (act && act.tagName === 'BUTTON') { doAction(act.dataset.act, act.dataset); return; }
    if (node) select(node.dataset.node);
    const sol = e.target.closest('[data-sol]');
    if (sol) {
      const s = state.ik.analytic.solutions[+sol.dataset.sol];
      if (s && s.q.length === state.prep.dof) { checkpoint(); markDirty(); tweenTo(s.q); }
    }
  });

  document.addEventListener('keydown', (e) => {
    if ($('#about').dataset.locked === '1') return; // terms popup still open
    // let text fields keep their own shortcuts
    const typing = !!e.target.matches?.('textarea, input:not([type=range]):not([type=checkbox]):not([type=radio])');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); if (state.view === 'doc') save(e.shiftKey); return; }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return; }
    if (ctrl && ['n', 't'].includes(e.key.toLowerCase())) { e.preventDefault(); newRobot(); return; }
    if (ctrl && e.key.toLowerCase() === 'w') { e.preventDefault(); if (state.view === 'doc') closeDoc(); return; }
    if (ctrl && e.key === 'Tab') { e.preventDefault(); cycleTabs(e.shiftKey ? -1 : 1); return; }
    if (ctrl && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      const n = Number(e.code.slice(5));
      goToTab(n === 9 ? docs.length : n - 1); // Ctrl+9 = last tab
      return;
    }
    if (e.key === 'F1' || (ctrl && e.key === '/')) { e.preventDefault(); toggleShortcuts(); return; }
    if (e.key === 'Escape' && (!$('#shortcuts').hidden || !$('#about').hidden)) { closeModals(); return; }
    if (state.view === 'doc' && ctrl && !e.altKey) {
      const k = e.key.toLowerCase();
      const docCombos = {
        m: () => setTool(state.tool === 'translate' ? 'select' : 'translate'),
        r: () => setTool(state.tool === 'rotate' ? 'select' : 'rotate'),
        h: () => doAction('home'),
        f: () => { state.showFrames = !state.showFrames; updateScene(); renderQuickRail(); },
        k: () => toggleWorkspace(),
        p: () => toggleDemo(),
        d: () => { if (getJoint(state.selected)) duplicateJoint(state.selected); },
        0: () => viewport.frame(state.camView),
        enter: () => (e.shiftKey ? doAction('ik-ana') : doAction('ik-num')),
      };
      if (docCombos[k] && !(typing && ['d', 'enter'].includes(k) && e.target.matches?.('textarea'))) {
        e.preventDefault();
        docCombos[k]();
        return;
      }
    }
    if (state.view === 'doc' && e.altKey && /^Digit[1-4]$/.test(e.code)) {
      e.preventDefault();
      state.camView = ['iso', 'front', 'side', 'top'][Number(e.code.slice(5)) - 1];
      viewport.frame(state.camView);
      renderViewPill();
      return;
    }
    if (typing || state.view !== 'doc') return;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (ctrl) return;
    const k = e.key.toLowerCase();
    if (k === 'delete' || k === 'backspace') { if (state.selected && getJoint(state.selected)) deleteJoint(state.selected); }
    else if (k === 'escape') { if (state.tool !== 'select') setTool('select'); else select(null); }
    else if (k === 'q') setTool('select');
    else if (k === 'w' || k === 'm') setTool('translate');
    else if (k === 'e' || k === 'r') setTool('rotate');
    else if (k === 'f') { state.showFrames = !state.showFrames; updateScene(); renderQuickRail(); }
    else if (k === 'h') doAction('home');
  });
}

// about / terms
const REPO_URL = 'https://github.com/greenythebeany/BeanyIK';
const TERMS_VERSION = 1;
let appVersion = '';

function openExternal(url) {
  if (window.api?.openExternal) window.api.openExternal(url);
  else window.open(url, '_blank');
}

function termsSummaryHTML() {
  return `
    <ul>
      <li>${t('BeanyIK is free, open-source software under the MIT License.')}</li>
      <li>${t('It is an educational and design tool. Results are numerical approximations, so never use it as the only basis for moving real hardware.')}</li>
      <li>${t('The analytic IK panel runs JavaScript you type, locally. Only run code you trust, including code inside robot files from others.')}</li>
      <li>${t('No accounts, analytics or telemetry. Your robots and settings stay on your computer. The app only contacts GitHub to check for updates.')}</li>
      <li>${t('Provided “as is”, without warranty of any kind.')}</li>
    </ul>`;
}

function showAbout(tab = 'about') {
  const el = $('#about');
  const tabs = [['about', t('About')], ['credits', t('Credits')], ['terms', t('Terms & privacy')]];
  const body = {
    about: `
      <div class="about-hero"><img src="logo.png" alt=""><div>
        <h2>BeanyIK</h2>
        <p>${t('Version')} ${esc(appVersion || '?')} · ${t('by')} GreenyBeany</p>
        <p>${t('Drag & drop robot kinematics: DH parameters or custom matrices, forward and inverse kinematics, Jacobians and workspaces.')}</p>
      </div></div>
      <div class="row" style="justify-content:flex-start;gap:8px">
        <button class="btn btn-sm" data-ext="${REPO_URL}">${icon('code')}GitHub</button>
        <button class="btn btn-sm" data-ext="${REPO_URL}/releases">${icon('export')}${t('Releases')}</button>
        <button class="btn btn-sm" data-ext="${REPO_URL}/issues">${icon('warn')}${t('Report a bug')}</button>
        <button class="btn btn-sm" data-act-modal="update">${icon('rotate')}${t('Check for updates')}</button>
      </div>
      <div id="update-result" class="hint" style="margin-top:10px"></div>
      <label class="switch" style="margin-top:14px"><input type="checkbox" data-auto-update ${store.get('beanyik_auto_update', true) ? 'checked' : ''}><span class="track"></span>${t('Check for updates when BeanyIK starts')}</label>`,
    credits: `
      <div class="about-section">
        <h3>${t('Logo')}</h3>
        <p>${t('Concept and art direction by GreenyBeany; image generated with Google Gemini, then cropped and exported to icon sizes.')}</p>
        <h3>${t('Fonts')}</h3>
        <ul>
          <li><b>Segoe UI</b>: ${t('interface text')} (Microsoft, ${t('included with Windows')})</li>
          <li><b>Cambria Math</b>: ${t('mathematical notation')} (Microsoft, ${t('included with Windows')})</li>
          <li><b>Cascadia Code</b>: ${t('code and numbers')} (Microsoft, SIL Open Font License 1.1)</li>
        </ul>
        <p class="hint">${t('No font files are bundled; the app uses fonts already installed on your system.')}</p>
        <h3>${t('Software')}</h3>
        <ul>
          <li><a data-ext="https://www.electronjs.org/">Electron</a>, MIT (${t('includes Chromium and Node.js')})</li>
          <li><a data-ext="https://threejs.org/">three.js</a> r170, MIT (OrbitControls, TransformControls)</li>
        </ul>
        <h3>${t('Design')}</h3>
        <p>${t('Layout inspired by Adobe Acrobat. Not affiliated with or endorsed by Adobe. UI icons drawn for BeanyIK.')}</p>
        <h3>${t('References')}</h3>
        <ul>
          <li>Denavit &amp; Hartenberg (1955), ${t('standard DH convention')}</li>
          <li>Craig, <i>Introduction to Robotics</i>, ${t('modified DH convention')}</li>
          <li>Siciliano et al., <i>Robotics: Modelling, Planning and Control</i></li>
          <li>Spong, Hutchinson &amp; Vidyasagar, <i>Robot Modeling and Control</i></li>
          <li>Wampler (1986), ${t('damped least-squares IK')}; Yoshikawa (1985), ${t('manipulability')}</li>
        </ul>
        <p><a data-ext="${REPO_URL}/blob/main/CREDITS.md">CREDITS.md</a></p>
      </div>`,
    terms: `
      <div class="about-section">
        <h3>${t('Summary')}</h3>
        ${termsSummaryHTML()}
        <p><a data-ext="${REPO_URL}/blob/main/TERMS.md">${t('Read the full Terms of Use & Privacy')}</a> · <a data-ext="${REPO_URL}/blob/main/LICENSE">MIT License</a></p>
      </div>`,
  };
  el.innerHTML = `
    <div class="modal-card" role="dialog" aria-label="${t('About BeanyIK')}">
      <div class="modal-head">
        <div class="segmented" style="width:auto">${tabs.map(([id, label]) => `<button class="${id === tab ? 'on' : ''}" data-about-tab="${id}" style="padding:0 14px">${label}</button>`).join('')}</div>
        <button class="icon-btn small" data-close-modal>${icon('close')}</button>
      </div>
      ${body[tab]}
    </div>`;
  el.hidden = false;
}

function showTermsPrompt() {
  const el = $('#about');
  el.innerHTML = `
    <div class="modal-card" role="dialog" style="max-width:620px">
      <div class="about-hero"><img src="logo.png" alt=""><div>
        <h2>${t('Welcome to BeanyIK')}</h2>
        <p>${t('Before you start, please read the short version of the terms.')}</p>
      </div></div>
      <div class="about-section">${termsSummaryHTML()}
        <p><a data-ext="${REPO_URL}/blob/main/TERMS.md">${t('Read the full Terms of Use & Privacy')}</a></p>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button class="btn btn-primary" data-accept-terms style="flex:0">${icon('check')}${t('I agree')}</button>
      </div>
    </div>`;
  el.dataset.locked = '1';
  el.hidden = false;
}

function closeModals() {
  if ($('#about').dataset.locked === '1') return;
  $('#about').hidden = true;
  $('#shortcuts').hidden = true;
}

function wireModals() {
  $('#about').addEventListener('change', (e) => {
    if (e.target.matches('[data-auto-update]')) {
      store.set('beanyik_auto_update', e.target.checked);
      window.api?.setAutoUpdateCheck?.(e.target.checked);
    }
  });
  for (const id of ['#about', '#shortcuts']) {
    $(id).addEventListener('click', async (e) => {
      if (e.target === e.currentTarget || e.target.closest('[data-close-modal]')) return closeModals();
      const ext = e.target.closest('[data-ext]');
      if (ext) { e.preventDefault(); return openExternal(ext.dataset.ext); }
      const tab = e.target.closest('[data-about-tab]');
      if (tab) return showAbout(tab.dataset.aboutTab);
      if (e.target.closest('[data-accept-terms]')) {
        store.set('beanyik_terms', TERMS_VERSION);
        $('#about').dataset.locked = '';
        return closeModals();
      }
      if (e.target.closest('[data-act-modal="update"]')) {
        const out = $('#update-result');
        out.textContent = t('Checking…');
        const res = await window.api?.checkForUpdates?.();
        if (!res) out.textContent = t('Update check is only available in the desktop app.');
        else if (res.status === 'available') { out.textContent = ''; closeModals(); showUpdate(res); }
        else if (res.status === 'up-to-date') out.textContent = t('You have the latest version.');
        else out.textContent = t('Could not check for updates: {err}', { err: res.error || '' });
      }
    });
  }
  wireUpdates();
  window.api?.getAppVersion?.().then((v) => { appVersion = v; });
  if (store.get('beanyik_terms', 0) < TERMS_VERSION) showTermsPrompt();
}

// updates

const update = { info: null, stage: 'idle', progress: null, file: null, error: '' };

const mb = (n) => (n / 1048576).toFixed(1);

// release notes are short markdown, render the bits we use
function notesHTML(md) {
  const lines = String(md || '').split(/\r?\n/);
  let html = '', inList = false;
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  for (const raw of lines) {
    const line = raw.trim();
    const li = /^[*-]\s+(.*)$/.exec(line);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (!line || line.startsWith('<')) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    html += h ? `<h4>${inline(h[1])}</h4>` : /^\*\*(.+)\*\*$/.test(line) ? `<h4>${inline(line.slice(2, -2))}</h4>` : `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

function renderUpdate() {
  const el = $('#update');
  const u = update;
  if (!u.info) { el.hidden = true; return; }
  const i = u.info;
  let body = '', actions = '';
  if (u.stage === 'prompt') {
    body = `<div class="update-notes">${notesHTML(i.notes) || `<p>${t('See the release page for details.')}</p>`}</div>
      ${i.canInstall ? `<p class="hint">${t(i.portable ? 'The new portable version is saved next to this one and started for you.' : 'BeanyIK downloads the installer, checks it, then closes and starts the update. Your open robots are kept.')}</p>` : ''}`;
    actions = `
      <button class="btn btn-quiet" data-upd="skip">${t('Skip this version')}</button>
      <span class="grow"></span>
      <button class="btn" data-upd="later">${t('Later')}</button>
      ${i.canInstall
        ? `<button class="btn btn-primary" data-upd="download">${icon('download')}${t('Update now')}</button>`
        : `<button class="btn btn-primary" data-upd="page">${icon('download')}${t('Download from GitHub')}</button>`}`;
  } else if (u.stage === 'downloading') {
    const p = u.progress || { received: 0, total: i.size };
    const pct = p.total ? Math.round((p.received / p.total) * 100) : 0;
    body = `<div class="update-progress"><div class="bar"><span style="width:${pct}%"></span></div>
      <div class="hint">${t('Downloading {a} of {b} MB', { a: mb(p.received), b: mb(p.total || i.size) })} · ${pct}%</div></div>`;
    actions = `<span class="grow"></span><button class="btn" disabled>${t('Downloading…')}</button>`;
  } else if (u.stage === 'ready') {
    body = `<div class="notice ok">${icon('check')}<div>${t(u.verified ? 'Update downloaded and verified.' : 'Update downloaded.')} ${t(i.portable ? 'The new version starts and this one closes.' : 'BeanyIK closes and the installer opens. Your open robots come back next time.')}</div></div>`;
    actions = `<span class="grow"></span><button class="btn" data-upd="later">${t('Later')}</button><button class="btn btn-primary" data-upd="install">${icon('rotate')}${t(i.portable ? 'Restart now' : 'Install and restart')}</button>`;
  } else if (u.stage === 'error') {
    body = `<div class="notice err">${icon('warn')}<div>${esc(u.error)}</div></div>`;
    actions = `<span class="grow"></span><button class="btn" data-upd="later">${t('Close')}</button><button class="btn btn-primary" data-upd="page">${icon('download')}${t('Download from GitHub')}</button>`;
  }
  el.innerHTML = `
    <div class="modal-card update-card" role="dialog" aria-label="${t('Update available')}">
      <div class="update-head">
        <img src="logo.png" alt="">
        <div><h2>${t('Update available')}</h2>
          <p>${t('BeanyIK {v} is out. You have {c}.', { v: esc(i.version), c: esc(i.current || appVersion) })}${i.size ? ` · ${mb(i.size)} MB` : ''}</p></div>
      </div>
      ${body}
      <div class="row update-actions">${actions}</div>
    </div>`;
  el.hidden = false;
}

function showUpdate(info) {
  update.info = info;
  update.stage = 'prompt';
  update.error = '';
  renderUpdate();
}

async function startUpdateDownload() {
  update.stage = 'downloading';
  update.progress = { received: 0, total: update.info.size };
  renderUpdate();
  const res = await window.api.downloadUpdate();
  if (!res.ok) {
    update.stage = 'error';
    update.error = t('Could not download the update: {err}', { err: res.error });
  } else {
    update.stage = 'ready';
    update.file = res.file;
    update.verified = res.verified;
  }
  renderUpdate();
}

async function installUpdate() {
  // keep every open tab, the home screen offers to reopen them
  stashActive();
  saveSessionNow();
  const res = await window.api.installUpdate(update.file);
  if (!res.ok) {
    update.stage = 'error';
    update.error = res.error;
    renderUpdate();
  }
}

function wireUpdates() {
  const autoCheck = store.get('beanyik_auto_update', true);
  window.api?.setAutoUpdateCheck?.(autoCheck);
  window.api?.onUpdateAvailable?.((info) => {
    if (store.get('beanyik_skip_version', '') === info.version) return;
    if (update.info) return;
    showUpdate(info);
  });
  window.api?.onUpdateProgress?.((p) => {
    update.progress = p;
    if (update.stage === 'downloading') renderUpdate();
  });
  $('#update').addEventListener('click', (e) => {
    const b = e.target.closest('[data-upd]');
    if (!b) return;
    const act = b.dataset.upd;
    if (act === 'later') { update.info = null; renderUpdate(); }
    if (act === 'skip') { store.set('beanyik_skip_version', update.info.version); update.info = null; renderUpdate(); }
    if (act === 'page') openExternal(update.info.url);
    if (act === 'download') startUpdateDownload();
    if (act === 'install') installUpdate();
  });
}

const SHORTCUTS = [
  ['Tabs & files', [
    ['Ctrl+T', 'New robot tab'], ['Ctrl+W', 'Close tab'], ['Ctrl+1 … 8', 'Go to tab (1 = Home)'], ['Ctrl+9', 'Last tab'],
    ['Ctrl+Tab', 'Next tab'], ['Ctrl+O', 'Open robot'], ['Ctrl+S', 'Save'], ['Ctrl+Shift+S', 'Save as'],
  ]],
  ['Inverse kinematics', [
    ['Ctrl+M', 'Move mode (drag the IK target)'], ['Ctrl+R', 'Rotate mode (rotate the IK target)'], ['Esc', 'Back to select mode'],
    ['Ctrl+Enter', 'Solve numerically'], ['Ctrl+Shift+Enter', 'Solve analytically'], ['Ctrl+H', 'Home pose'],
    ['Ctrl+P', 'Play / stop the demo'],
  ]],
  ['Editing', [
    ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+D', 'Duplicate selected joint'], ['Delete', 'Delete selected joint'],
  ]],
  ['View', [
    ['Ctrl+F', 'Show / hide frames'], ['Ctrl+K', 'Workspace cloud'], ['Ctrl+0', 'Fit robot'],
    ['Alt+1 … 4', 'Iso / front / side / top view'], ['F1', 'This list'],
  ]],
];

function toggleShortcuts(show) {
  const el = $('#shortcuts');
  if (show === undefined) show = el.hidden;
  if (!show) { el.hidden = true; return; }
  el.innerHTML = `
    <div class="modal-card" role="dialog" aria-label="${t('Keyboard shortcuts')}">
      <div class="modal-head"><h2>${t('Keyboard shortcuts')}</h2><button class="icon-btn small" data-close-modal>${icon('close')}</button></div>
      <div class="shortcut-grid">
        ${SHORTCUTS.map(([group, rows]) => `
          <section><h3>${t(group)}</h3>
            ${rows.map(([k, d]) => `<div class="shortcut-row"><span>${t(d)}</span><span class="keys">${k.split(/\+(?=.)/).map((x) => `<kbd>${esc(x)}</kbd>`).join('<i>+</i>')}</span></div>`).join('')}
          </section>`).join('')}
      </div>
    </div>`;
  el.hidden = false;
}

function setTool(mode) {
  if (mode !== 'select' && !state.prep.dof) {
    toast(t('The IK target moves joints. Add a revolute or prismatic joint first.'), 'info');
    mode = 'select';
  }
  state.tool = mode;
  if (mode !== 'select' && (!state.panelOpen || state.panel !== 'ik')) openPanel('ik');
  renderQuickRail();
  syncTargetGizmo();
}

function toggleWorkspace() {
  state.showWorkspace = !state.showWorkspace;
  if (state.showWorkspace) {
    if (!state.prep.dof) { state.showWorkspace = false; toast(t('Add a movable joint first'), 'err'); }
    else {
      viewport.setWorkspace(sampleWorkspace(state.prep, Math.min(30000, 3000 * state.prep.dof)));
      toast(t('Workspace sampled from random joint configurations within the limits'), 'info');
    }
  } else viewport.setWorkspace(null);
  renderQuickRail();
}

function doAction(act, data = {}) {
  switch (act) {
    case 'del': return deleteJoint(data.id);
    case 'dup': return duplicateJoint(data.id);
    case 'home': checkpoint(); markDirty(); tweenTo(clampAll(state.prep.home)); return snapLater();
    case 'zero': checkpoint(); markDirty(); tweenTo(clampAll(state.prep.home.map(() => 0))); return snapLater();
    case 'random': {
      checkpoint();
      markDirty();
      tweenTo(state.prep.limits.map(([a, b]) => {
        const lo = Number.isFinite(a) ? a : -Math.PI, hi = Number.isFinite(b) ? b : Math.PI;
        return lo + Math.random() * (hi - lo);
      }));
      return snapLater();
    }
    case 'tgt-ee': resetTargetToEE(); state.ik.result = null; return renderPanel();
    case 'ik-num': return runNumericIK();
    case 'elem-add': case 'elem-del': case 'elem-up': case 'elem-down': {
      const j = getJoint(data.id);
      if (!j) return;
      checkpoint();
      const list = j.elems || (j.elems = []);
      const k = Number(data.k);
      if (act === 'elem-add') list.push({ op: data.op, v: data.op[0] === 'R' ? (j.type === 'revolute' && !list.some((e) => /\bq\b/.test(e.v)) ? 'q' : '0') : (j.type === 'prismatic' && !list.some((e) => /\bq\b/.test(e.v)) ? 'q' : '0.1') });
      if (act === 'elem-del') list.splice(k, 1);
      if (act === 'elem-up' && k > 0) [list[k - 1], list[k]] = [list[k], list[k - 1]];
      if (act === 'elem-down' && k < list.length - 1) [list[k + 1], list[k]] = [list[k], list[k + 1]];
      markDirty();
      refresh({ panel: true });
      return fitIfOutOfView();
    }
    case 'axis-tilt': {
      const j = getJoint(data.id);
      const ref = j && axisTwistRef(j);
      if (!ref) return;
      checkpoint();
      ref.obj[ref.key] = data.v;
      markDirty();
      refresh({ panel: true });
      return fitIfOutOfView();
    }
    case 'theta-quick': {
      const j = getJoint(data.id);
      if (!j) return;
      checkpoint();
      j.dh.theta = data.v;
      markDirty();
      refresh({ panel: true });
      return fitIfOutOfView();
    }
    case 'link-dir': {
      const j = getJoint(data.id);
      if (!j) return;
      // keep the current length, just change which way it points
      const len = [j.dh.a, j.dh.d].map((v) => String(v ?? '0').trim().replace(/^-/, '')).find((v) => !/^0*(\.0*)?$/.test(v)) || '0.15';
      checkpoint();
      j.dh.theta = '0';
      j.dh.alpha = '0';
      if (data.dir === 'x') { j.dh.a = len; j.dh.d = '0'; }
      else { j.dh.a = '0'; j.dh.d = data.dir === 'down' ? `-${len}` : len; }
      markDirty();
      refresh({ panel: true });
      return fitIfOutOfView();
    }
    case 'ik-ana': return runAnalyticIK();
    case 'param-add': {
      checkpoint();
      const used = new Set(state.robot.params.map((p) => p.name));
      let n = state.robot.params.length + 1;
      while (used.has(`L${n}`)) n++;
      state.robot.params.push({ name: `L${n}`, value: '0.1' });
      markDirty();
      return refresh({ panel: true });
    }
    case 'param-del': checkpoint(); state.robot.params.splice(+data.i, 1); markDirty(); return refresh({ panel: true });
    case 'code-template': {
      checkpoint();
      state.robot.analyticIK = ANALYTIC_TEMPLATE;
      markDirty();
      return renderPanel();
    }
    case 'code-test': {
      const res = solveAnalytic(state.prep, lastFK.ee, state.robot.analyticIK);
      const el = $('#code-result');
      if (res.error) { el.innerHTML = `<div class="notice err">${icon('warn')}<div>${esc(res.error)}</div></div>`; return; }
      const good = res.solutions.filter((s) => s.ok).length;
      const matchesCurrent = res.solutions.some((s) => s.ok && s.q.every((v, i) => Math.abs(Math.atan2(Math.sin(v - lastFK.q[i]), Math.cos(v - lastFK.q[i]))) < 1e-4));
      el.innerHTML = `<div class="notice ${good ? 'ok' : 'warn'}">${icon(good ? 'check' : 'warn')}<div>${t('{n} branch(es) returned, <b>{ok}</b> reproduce the current end-effector pose', { n: res.solutions.length, ok: good })}${matchesCurrent ? t(', including the current joint configuration') : ''}.</div></div>`;
      return;
    }
    case 'copy-matrix': {
      const { name, A } = shownMatrix();
      navigator.clipboard.writeText(matrixToMatlab(A, name));
      return toast(t('Copied as MATLAB matrix'), 'ok');
    }
    case 'export-matlab': return exportText(toMatlab(state.robot), `${state.robot.name.replace(/[^\w]+/g, '_')}_fk.m`, 'm', 'MATLAB script');
    case 'export-csv': return exportText(dhTableCSV(state.robot), `${state.robot.name.replace(/[^\w]+/g, '_')}_dh.csv`, 'csv', 'CSV');
    case 'export-latex': navigator.clipboard.writeText(dhTableLatex(state.robot)); return toast(t('DH table copied as LaTeX'), 'ok');
    case 'copy-text': navigator.clipboard.writeText(matrixToText(shownMatrix().A)); return toast(t('Copied'), 'ok');
  }
}

// boot
const viewport = new Viewport($('#viewport'), {
  onSelect: (id) => select(id),
  onTargetDrag,
  onTargetDragStart: () => { if (state.ik.live) checkpoint(); },
  onTargetDragEnd: () => { if (state.ik.live) markDirty(); },
});

setLang(getLang());
translateStatic();
$('#lang-label').textContent = getLang().toUpperCase();
hydrateIcons();
renderTools();
renderQuickRail();
renderViewPill();
wireEvents();
wireDnD();
wireModals();
state.panel = store.get('beanyik_panel', 'chain');
if (!PANELS.some((p) => p.id === state.panel)) state.panel = 'chain';
window.api?.onWindowState?.(() => {});
showView('home');
updateUndoButtons();
window.addEventListener('beforeunload', () => { stashActive(); saveSessionNow(); });
