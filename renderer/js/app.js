import * as M from './core/mat.js';
import {
  makeJoint, makeRobot, prepare, fk, jacobian, manipulability, jointGeometry,
  sampleWorkspace, toDisplay, fromDisplay, isActive,
} from './core/robot.js';
import { solveIK, solveAnalytic, ANALYTIC_TEMPLATE } from './core/ik.js';
import { PRESETS, blankRobot } from './core/presets.js';
import { toMatlab, dhTableCSV, dhTableLatex, matrixToText, matrixToMatlab } from './core/export.js';
import { FUNCTION_NAMES } from './core/expr.js';
import { icon, glyph, hydrateIcons } from './icons.js';
import { Viewport } from './viewport.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 3) => (Number.isFinite(v) ? (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d) : '—');
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// ---------------------------------------------------------------- state

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
};

const history = { past: [], future: [] };

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

// ------------------------------------------------------------ helpers

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
  return j.name || `${j.type === 'fixed' ? 'Link' : 'Joint'} ${i + 1}`;
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

// ----------------------------------------------------- history / dirty

function snapshot() {
  return JSON.stringify({ robot: state.robot, qById: state.qById });
}

function checkpoint() {
  history.past.push(snapshot());
  if (history.past.length > 200) history.past.shift();
  history.future = [];
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
  if (!history.past.length) return;
  history.future.push(snapshot());
  restore(history.past.pop());
  updateUndoButtons();
}

function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  restore(history.future.pop());
  updateUndoButtons();
}

function updateUndoButtons() {
  $('#btn-undo').disabled = !history.past.length;
  $('#btn-redo').disabled = !history.future.length;
}

function markDirty(d = true) {
  state.dirty = d;
  $('#tab-doc').classList.toggle('dirty', d);
  if (d) autosave();
}

let autosaveTimer = null;
function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    store.set('beanyik_session', { robot: state.robot, qById: state.qById, filePath: state.filePath, savedAt: Date.now() });
  }, 400);
}

// ------------------------------------------------------- open document

function openRobot(robot, { filePath = null, qById = null, fresh = true } = {}) {
  state.robot = makeRobot(robot);
  state.robot.joints = state.robot.joints.map((j) => ({ ...makeJoint(j.type), ...j, dh: { ...makeJoint(j.type).dh, ...j.dh } }));
  state.filePath = filePath;
  state.qById = qById || {};
  state.selected = null;
  state.ik.result = null;
  state.ik.analytic = null;
  state.showWorkspace = false;
  viewport.setWorkspace(null);
  if (fresh) { history.past = []; history.future = []; }
  state.prep = prepare(state.robot);
  if (!qById) setQ(state.prep.home);
  state.ik.mode = state.prep.dof >= 6 ? 'full' : 'position';
  state.ik.target = null;
  markDirty(false);
  autosave();
  showView('doc');
  refresh({ panel: true });
  resetTargetToEE();
  syncTargetGizmo();
  requestAnimationFrame(() => viewport.frame(state.camView));
  updateUndoButtons();
}

function showView(view) {
  state.view = view;
  $('#home').hidden = view !== 'home';
  $('#workspace').hidden = view !== 'doc';
  $('#tab-home').classList.toggle('active', view === 'home');
  $('#tab-doc').classList.toggle('active', view === 'doc');
  $('#tab-doc').hidden = !state.robot;
  if (view === 'home') renderHome();
}

// ------------------------------------------------------------- refresh

function refresh({ panel = false, scene = true } = {}) {
  state.prep = prepare(state.robot);
  $('#doc-title').textContent = state.robot.name || 'Untitled robot';
  document.title = `${state.robot.name} — BeanyIK`;
  if (scene) updateScene();
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
    manip = singular ? '<span class="badge warn">near singular</span>' : `<span class="badge info">w = ${m.w.toExponential(2)}</span>`;
  }
  $('#hud').innerHTML = `
    <div class="hud-title">End effector ${manip}</div>
    <div class="hud-grid">
      <span class="k x">x</span><span>${fmt(T[0][3])}</span>
      <span class="k y">y</span><span>${fmt(T[1][3])}</span>
      <span class="k z">z</span><span>${fmt(T[2][3])}</span>
      <span class="k x">R</span><span>${fmt(roll / M.DEG, 1)}°</span>
      <span class="k y">P</span><span>${fmt(pitch / M.DEG, 1)}°</span>
      <span class="k z">Y</span><span>${fmt(yaw / M.DEG, 1)}°</span>
    </div>`;
}

// ------------------------------------------------------------ editing

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
  if (state.panel !== 'chain' && state.panel !== 'props') openPanel('props');
  toast(`Added ${PART_TYPES.find((p) => p.kind === kind)?.name.toLowerCase() || 'joint'}`, 'info');
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
}

function select(id) {
  state.selected = id;
  updateScene();
  if (id && state.panel === 'chain') renderPanel();
  else if (id) openPanel('props');
  else if (state.panel === 'props') renderPanel();
}

// Generic data-bind: "robot.name", "joint:<id>.dh.theta", "param:<i>.value", "base.x"
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
  // keep the chain summary in sync without re-rendering inputs
  if (state.panel === 'chain') renderPanel();
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

// ------------------------------------------------------------- panels

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
    <button class="rail-btn ${state.panelOpen && state.panel === p.id ? 'on' : ''}" data-panel="${p.id}" data-tip="${p.title}">
      ${icon(p.icon)}${p.id === 'chain' && errCount ? `<span class="count">${errCount}</span>` : ''}
    </button>`).join('');
}

function renderPanel() {
  const p = PANELS.find((x) => x.id === state.panel);
  $('#side-title').textContent = p.title;
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

function dhSummary(j) {
  if (j.mode === 'matrix') return 'custom 4×4 transform';
  const th = j.type === 'revolute' ? (j.dh.theta && j.dh.theta !== '0' ? `q+${j.dh.theta}°` : 'q') : `${j.dh.theta}°`;
  const d = j.type === 'prismatic' ? (j.dh.d && j.dh.d !== '0' ? `q+${j.dh.d}` : 'q') : j.dh.d;
  return `θ=${th}  d=${d}  a=${j.dh.a}  α=${j.dh.alpha}°`;
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
          <div class="node-name">${esc(jointLabel(j, i))} <span class="node-idx">#${i + 1}</span>${hasErr ? `<span class="badge err">${icon('warn')}error</span>` : ''}</div>
          <div class="node-sub">${esc(dhSummary(j))}</div>
        </div>
        <div class="node-actions">
          <button class="icon-btn small" data-act="dup" data-id="${j.id}" title="Duplicate">${icon('copy')}</button>
          <button class="icon-btn small danger" data-act="del" data-id="${j.id}" title="Delete">${icon('trash')}</button>
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
      <div class="field"><label>Robot name</label><input class="input" data-bind="robot.name" value="${esc(r.name)}"></div>
    </div>
    <div class="section">
      <div class="section-title">DH convention</div>
      <div class="segmented" data-seg="convention">
        <button class="${r.convention === 'standard' ? 'on' : ''}" data-val="standard">Standard (distal)</button>
        <button class="${r.convention === 'modified' ? 'on' : ''}" data-val="modified">Modified (Craig)</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Links & joints <span class="grow"></span><span class="badge info">${state.prep.dof} DOF</span></div>
      <div class="chain" id="chain">
        ${special('base', 'Base', poseSub(r.base), 'base')}
        ${r.joints.length ? nodes + `<div class="chain-gap" data-gap="${r.joints.length}"></div>` : `<div class="chain-gap"></div><div class="chain-empty" data-gap="0">Drag a <b>Revolute</b>, <b>Prismatic</b>, <b>Fixed</b> or <b>Matrix</b> part here from <b>All tools</b>, or click one to append it.</div><div class="chain-gap"></div>`}
        ${special('tool', 'Tool / end effector', poseSub(r.tool), 'tool')}
      </div>
    </div>
    <p class="hint">Drag parts from the left to insert them anywhere in the chain. Drag the grip to reorder. Click a link in the 3D view to select it.</p>`;
}

function poseFields(key) {
  const p = state.robot[key];
  const f = (k, label, unit) => `<div class="field"><label class="label">${label}<span class="unit">${unit}</span></label><input class="input mono" data-bind="${key}.${k}" value="${esc(p[k])}"><div class="field-error" data-err="${key}.${k}"></div></div>`;
  return `
    <div class="grid3">${f('x', 'x', 'm')}${f('y', 'y', 'm')}${f('z', 'z', 'm')}</div>
    <div class="grid3" style="margin-top:10px">${f('roll', 'Roll (x)', 'deg')}${f('pitch', 'Pitch (y)', 'deg')}${f('yaw', 'Yaw (z)', 'deg')}</div>`;
}

function renderProps() {
  const sel = state.selected;
  if (!sel) {
    return `<div class="notice info">${icon('info')}<div>Select a link in the chain or in the 3D view to edit it. Fields accept expressions — numbers, your parameters (<code>L1</code>), <code>pi</code>, <code>sqrt()</code>, <code>atan2()</code>…</div></div>`;
  }
  if (sel === 'base' || sel === 'tool') {
    return `
      <div class="section">
        <div class="section-title">${sel === 'base' ? 'Base frame (world → frame 0)' : 'Tool frame (flange → TCP)'}</div>
        ${poseFields(sel)}
      </div>
      <p class="hint">Rotation is applied as R = Rz(yaw)·Ry(pitch)·Rx(roll).</p>`;
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
      ${j.matrix.map((row, r) => row.map((c, k) => `<input class="input mono" data-bind="joint:${j.id}.matrix.${r}.${k}" data-errkey="${j.id}.m${r}${k}" value="${esc(c)}" spellcheck="false" title="row ${r + 1}, col ${k + 1}">`).join('')).join('')}
      ${['0', '0', '0', '1'].map((v) => `<div class="fixed-cell">${v}</div>`).join('')}
    </div>
    <div class="field-error" data-err="${j.id}.matrix"></div>
    <p class="hint">Entries may use <code>q</code> (this joint's variable: rad for revolute, m for prismatic), your parameters and functions like <code>cos</code>, <code>sin</code>. This is A<sub>i</sub>: frame ${i} → frame ${i + 1}.</p>`;
  return `
    <div class="section">
      <div class="field"><label>Name</label><input class="input" data-bind="joint:${j.id}.name" value="${esc(j.name)}" placeholder="${esc(jointLabel(j, i))}"></div>
    </div>
    <div class="section">
      <div class="section-title">Joint type</div>
      <div class="segmented" data-seg="type">
        <button class="${j.type === 'revolute' ? 'on' : ''}" data-val="revolute">Revolute</button>
        <button class="${j.type === 'prismatic' ? 'on' : ''}" data-val="prismatic">Prismatic</button>
        <button class="${j.type === 'fixed' ? 'on' : ''}" data-val="fixed">Fixed</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Defined by</div>
      <div class="segmented" data-seg="mode">
        <button class="${j.mode === 'dh' ? 'on' : ''}" data-val="dh">DH parameters</button>
        <button class="${j.mode === 'matrix' ? 'on' : ''}" data-val="matrix">Custom matrix</button>
      </div>
    </div>
    <div class="section">
      ${j.mode === 'dh' ? `
        <div class="section-title">${modified ? 'Modified DH · Rx(α) Tx(a) Rz(θ) Tz(d)' : 'Standard DH · Rz(θ) Tz(d) Tx(a) Rx(α)'}</div>
        <div class="grid2">
          ${dhField('theta', j.type === 'revolute' ? 'θ offset' : 'θ', angUnit)}
          ${dhField('d', j.type === 'prismatic' ? 'd offset' : 'd', 'm')}
          ${dhField('a', modified ? 'a (i−1)' : 'a', 'm')}
          ${dhField('alpha', modified ? 'α (i−1)' : 'α', angUnit)}
        </div>
        <p class="hint">${j.type === 'revolute' ? 'θ = q + offset.' : j.type === 'prismatic' ? 'd = q + offset.' : 'No joint variable.'} Angles in degrees; expressions allowed.</p>`
      : matrixEditor()}
    </div>
    ${isActive(j) ? `
    <div class="section">
      <div class="section-title">Limits & home</div>
      <div class="grid3">
        <div class="field"><label class="label">Min<span class="unit">${lim}</span></label><input class="input mono" data-bind="joint:${j.id}.min" value="${esc(j.min)}"><div class="field-error" data-err="${j.id}.min"></div></div>
        <div class="field"><label class="label">Max<span class="unit">${lim}</span></label><input class="input mono" data-bind="joint:${j.id}.max" value="${esc(j.max)}"><div class="field-error" data-err="${j.id}.max"></div></div>
        <div class="field"><label class="label">Home<span class="unit">${lim}</span></label><input class="input mono" data-bind="joint:${j.id}.home" value="${esc(j.home)}"><div class="field-error" data-err="${j.id}.home"></div></div>
      </div>
    </div>` : ''}
    <div class="divider"></div>
    <div class="row">
      <button class="btn btn-sm" data-act="dup" data-id="${j.id}">${icon('copy')}Duplicate</button>
      <button class="btn btn-sm" data-act="del" data-id="${j.id}">${icon('trash')}Delete</button>
    </div>`;
}

function renderJoints() {
  const links = state.prep.activeLinks;
  if (!links.length) return `<div class="notice info">${icon('info')}<div>No movable joints yet. Add a revolute or prismatic joint from <b>All tools</b>.</div></div>`;
  return `
    <div class="row" style="margin-bottom:6px">
      <button class="btn btn-sm" data-act="home">${icon('home2')}Home</button>
      <button class="btn btn-sm" data-act="zero">Zero</button>
      <button class="btn btn-sm" data-act="random">${icon('dice')}Random</button>
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
  const t = state.ik.target || lastFK.ee;
  const { roll, pitch, yaw } = M.toRPY(t);
  const num = (k, v, unit) => `<div class="field"><label class="label">${k}<span class="unit">${unit}</span></label><input class="input mono" data-tgt="${k}" value="${fmt(v, unit === 'deg' ? 2 : 4)}"></div>`;
  const hasAnalytic = !!state.robot.analyticIK?.trim();
  return `
    <div class="section">
      <div class="section-title">Goal</div>
      <div class="segmented" data-seg="ikmode">
        <button class="${state.ik.mode === 'full' ? 'on' : ''}" data-val="full">Position + orientation</button>
        <button class="${state.ik.mode === 'position' ? 'on' : ''}" data-val="position">Position only</button>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Target pose <span class="grow"></span><button class="btn btn-sm btn-quiet" data-act="tgt-ee">${icon('target')}Use current</button></div>
      <div class="grid3">${num('x', t[0][3], 'm')}${num('y', t[1][3], 'm')}${num('z', t[2][3], 'm')}</div>
      <div class="grid3" style="margin-top:10px">${num('roll', roll / M.DEG, 'deg')}${num('pitch', pitch / M.DEG, 'deg')}${num('yaw', yaw / M.DEG, 'deg')}</div>
      <p class="hint">Or drag the green target in the 3D view — <b>W</b> move, <b>E</b> rotate.</p>
    </div>
    <div class="section">
      <label class="switch"><input type="checkbox" data-act="ik-live" ${state.ik.live ? 'checked' : ''}><span class="track"></span>Follow target live (numerical)</label>
    </div>
    <div class="row">
      <button class="btn btn-primary" data-act="ik-num">${icon('play')}Solve numerically</button>
      <button class="btn" data-act="ik-ana" ${hasAnalytic ? '' : 'disabled'}>${icon('sparkle')}Analytic</button>
    </div>
    <div id="ik-status" style="margin-top:14px"></div>
    <div id="ik-solutions" class="stack" style="margin-top:12px"></div>
    <div class="divider"></div>
    <p class="hint">Numerical solver: damped least squares on the geometric Jacobian with joint limits and random restarts. Analytic solver: your closed-form equations in the <b>Analytic IK</b> panel; every branch is checked with forward kinematics.</p>`;
}

function renderIKStatus() {
  const el = $('#ik-status');
  if (!el) return;
  const r = state.ik.result;
  if (r) {
    const cls = r.ok ? 'ok' : 'warn';
    el.innerHTML = `<div class="notice ${cls}">${icon(r.ok ? 'check' : 'warn')}<div><b>${r.ok ? 'Converged' : 'Best effort — target not reached'}</b><br>
      position error ${(r.posErr * 1000).toFixed(3)} mm · orientation error ${(r.rotErr / M.DEG).toFixed(3)}° · ${r.iterations} iterations${r.restartsUsed ? ' · restarts used' : ''}</div></div>`;
  } else el.innerHTML = '';
  const sl = $('#ik-solutions');
  const a = state.ik.analytic;
  if (!sl) return;
  if (!a) { sl.innerHTML = ''; return; }
  if (a.error) { sl.innerHTML = `<div class="notice err">${icon('warn')}<div>${esc(a.error)}</div></div>`; return; }
  if (!a.solutions.length) { sl.innerHTML = `<div class="notice warn">${icon('warn')}<div>Analytic solver returned no solutions (target out of reach?).</div></div>`; return; }
  const links = state.prep.activeLinks;
  sl.innerHTML = `<div class="section-title">Analytic solutions (${a.solutions.length})</div>` + a.solutions.map((s, i) => `
    <div class="solution" data-sol="${i}">
      <div class="sol-head">Branch ${i + 1}
        ${s.ok ? '<span class="badge ok">reaches</span>' : `<span class="badge err">${esc(s.reason || 'misses')}</span>`}
        ${s.ok && !s.inLimits ? '<span class="badge warn">outside limits</span>' : ''}</div>
      <div class="sol-q">${s.q.map((v, k) => `<span>q${k + 1}=${links[k] ? fmt(toDisplay(links[k].joint, v), links[k].joint.type === 'revolute' ? 1 : 4) : fmt(v)}${links[k]?.joint.type === 'revolute' ? '°' : ''}</span>`).join('')}</div>
    </div>`).join('');
}

function renderMatrices() {
  const opts = [['total', `⁰T_ee — base to end effector`], ['jacobian', 'Jacobian J(q) (6 × n)']];
  state.robot.joints.forEach((j, i) => opts.push([`A${i}`, `A${i + 1} — ${jointLabel(j, i)}`]));
  opts.push(['all', 'All link matrices']);
  return `
    <div class="field"><label>Show</label>
      <select class="input" data-act="matrix-view">${opts.map(([v, l]) => `<option value="${v}" ${state.matrixView === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div id="matrix-body" style="margin-top:8px"></div>
    <div class="divider"></div>
    <div class="section-title">Export</div>
    <div class="stack">
      <button class="btn btn-sm" data-act="copy-matrix">${icon('copy')}Copy shown matrix (MATLAB)</button>
      <button class="btn btn-sm" data-act="export-matlab">${icon('export')}Export symbolic FK to MATLAB (.m)</button>
      <button class="btn btn-sm" data-act="export-latex">${icon('copy')}Copy DH table as LaTeX</button>
      <button class="btn btn-sm" data-act="export-csv">${icon('export')}Export DH table (.csv)</button>
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
  const el = $('#matrix-body');
  if (!el) return;
  const v = state.matrixView;
  let html = '';
  if (v === 'all') {
    html = lastFK.A.map((A, i) => `<div class="matrix-caption"><b>A${i + 1}</b> ${esc(jointLabel(state.robot.joints[i], i))}</div>${matrixHTML(A)}`).join('')
      + `<div class="matrix-caption"><b>⁰T_ee</b> = T_base · A₁ ⋯ Aₙ · T_tool</div>${matrixHTML(lastFK.ee)}`;
  } else if (v === 'jacobian') {
    if (!state.prep.dof) html = `<div class="notice info">${icon('info')}<div>No movable joints.</div></div>`;
    else {
      const J = jacobian(state.prep, lastFK.q, lastFK.ee);
      const rows = state.prep.dof >= 6 ? 6 : 3;
      const m = manipulability(J, rows);
      const Jsq = state.prep.dof === 6 ? M.det(J) : null;
      html = `<div class="matrix-caption">rows: v<sub>x</sub> v<sub>y</sub> v<sub>z</sub> ω<sub>x</sub> ω<sub>y</sub> ω<sub>z</sub> · columns: q₁…q${state.prep.dof}</div>${matrixHTML(J)}
        <div class="stat-row" style="margin-top:12px">
          <div class="stat"><div class="stat-k">manipulability</div><div class="stat-v">${m.w.toExponential(2)}</div></div>
          <div class="stat"><div class="stat-k">σ min</div><div class="stat-v">${(m.sv.at(-1) ?? 0).toExponential(2)}</div></div>
          <div class="stat"><div class="stat-k">${Jsq !== null ? 'det J' : 'cond'}</div><div class="stat-v">${Jsq !== null ? Jsq.toExponential(2) : Number.isFinite(m.cond) ? m.cond.toFixed(1) : '∞'}</div></div>
        </div>
        ${m.sv.at(-1) < 1e-3 ? `<div class="notice warn" style="margin-top:10px">${icon('warn')}<div>The arm is at (or very near) a singularity — it loses a direction of motion here.</div></div>` : ''}
        <p class="hint">${rows === 6 ? '' : 'Fewer than 6 DOF: manipulability uses the 3 linear rows. '}Computed numerically, so it works for custom-matrix joints too.</p>`;
    }
  } else {
    const { A } = shownMatrix();
    const { roll, pitch, yaw } = M.toRPY(A);
    html = matrixHTML(A) + (A.length === 4 ? `<p class="hint">p = (${fmt(A[0][3], 4)}, ${fmt(A[1][3], 4)}, ${fmt(A[2][3], 4)}) m · RPY = (${fmt(roll / M.DEG, 2)}°, ${fmt(pitch / M.DEG, 2)}°, ${fmt(yaw / M.DEG, 2)}°)</p>` : '');
  }
  el.innerHTML = html;
}

function renderParams() {
  const rows = state.robot.params.map((p, i) => `
    <div class="param-row">
      <input class="input mono" data-bind="param:${i}.name" value="${esc(p.name)}" placeholder="name" data-errkey="param.${esc(p.name)}">
      <input class="input mono" data-bind="param:${i}.value" value="${esc(p.value)}" placeholder="value / expression">
      <span class="val" data-paramval="${esc(p.name)}"></span>
      <button class="icon-btn small danger" data-act="param-del" data-i="${i}" title="Remove">${icon('trash')}</button>
    </div>`).join('');
  return `
    <p class="hint" style="margin-top:0">Named constants used anywhere in the robot — link lengths, offsets… Later parameters can use earlier ones (e.g. <code>L3 = L1 + L2</code>).</p>
    ${rows || `<div class="empty-note">No parameters yet.</div>`}
    <button class="btn btn-sm" data-act="param-add" style="margin-top:6px">${icon('plus')}Add parameter</button>
    <div class="divider"></div>
    <div class="section-title">Expression reference</div>
    <p class="hint">Operators <code>+ - * / ^</code>, constants <code>pi</code> <code>e</code>.<br>Functions: ${FUNCTION_NAMES.map((f) => `<code>${f}</code>`).join(' ')}</p>
    <div class="divider"></div>
    <div class="field"><label>Notes</label><textarea class="input" rows="5" data-bind="robot.notes" placeholder="Anything worth remembering about this robot…">${esc(state.robot.notes)}</textarea></div>`;
}

function renderCode() {
  return `
    <p class="hint" style="margin-top:0">Write your closed-form inverse kinematics here (JavaScript). The function receives the target flange pose <code>T</code>, your parameters <code>P</code> and helpers <code>h</code>, and returns all solution branches.</p>
    <textarea class="code-editor" data-bind="robot.analyticIK" spellcheck="false">${esc(state.robot.analyticIK || ANALYTIC_TEMPLATE)}</textarea>
    <div class="row" style="margin-top:10px">
      <button class="btn btn-primary btn-sm" data-act="code-test">${icon('play')}Test on current pose</button>
      <button class="btn btn-sm" data-act="code-template">Insert template</button>
    </div>
    <div id="code-result" style="margin-top:12px"></div>`;
}

// ---------------------------------------------------------- IK actions

function resetTargetToEE() {
  state.ik.target = M.clone(lastFK.ee);
  viewport.setTarget(state.ik.target);
}

function syncTargetGizmo() {
  const visible = state.tool !== 'select' || (state.panelOpen && state.panel === 'ik');
  if (!state.ik.target) resetTargetToEE();
  viewport.setTarget(state.ik.target);
  viewport.setTargetVisible(visible, state.tool === 'rotate' ? 'rotate' : 'translate');
}

function runNumericIK(target = state.ik.target, { quiet = false } = {}) {
  if (!state.prep.dof) { if (!quiet) toast('Add a movable joint first', 'err'); return; }
  const res = solveIK(state.prep, target, currentQ(), { mode: state.ik.mode, restarts: quiet ? 2 : 8 });
  if (!quiet) checkpoint();
  setQ(res.q);
  state.ik.result = res;
  if (!quiet) markDirty();
  updateScene();
}

function runAnalyticIK() {
  state.ik.analytic = solveAnalytic(state.prep, state.ik.target, state.robot.analyticIK);
  state.ik.result = null;
  renderIKStatus();
  const first = state.ik.analytic.solutions?.find((s) => s.ok && s.inLimits) || state.ik.analytic.solutions?.find((s) => s.ok);
  if (first) {
    checkpoint();
    setQ(first.q);
    markDirty();
    updateScene();
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
    runNumericIK(state.ik.target, { quiet: true });
    if (state.panel === 'ik') {
      const { roll, pitch, yaw } = M.toRPY(state.ik.target);
      const vals = { x: T[0][3], y: T[1][3], z: T[2][3], roll: roll / M.DEG, pitch: pitch / M.DEG, yaw: yaw / M.DEG };
      $$('[data-tgt]').forEach((el) => { el.value = fmt(vals[el.dataset.tgt], ['x', 'y', 'z'].includes(el.dataset.tgt) ? 4 : 2); });
    }
  });
}

// ------------------------------------------------------------- left panel

function renderTools() {
  const analyze = [
    ['ik', 'Inverse kinematics', 'Drag a target, solve q', 'green', 'ik'],
    ['joints', 'Joint controls', 'Forward kinematics sliders', 'teal', 'sliders'],
    ['matrices', 'Matrices & Jacobian', 'Aᵢ, ⁰Tₙ, J(q), singularities', 'indigo', 'jacobian'],
    ['code', 'Analytic IK solver', 'Plug in your closed form', 'red', 'code'],
    ['workspace', 'Workspace', 'Sample reachable points', 'magenta', 'workspace'],
  ];
  $('#tools-panel').innerHTML = `
    <h2>All tools</h2>
    <div class="tool-section">
      <div class="tool-section-title">Build — drag into the chain</div>
      ${PART_TYPES.map((p) => `
        <div class="tool-item draggable" draggable="true" data-part="${p.kind}" title="Drag into the chain or click to append">
          <span class="tile ${p.tile}">${glyph(p.glyph)}</span>
          <div class="tool-text"><span class="tool-name">${p.name}</span><span class="tool-desc">${p.desc}</span></div>
          <span class="drag-handle">${icon('grip')}</span>
        </div>`).join('')}
    </div>
    <div class="tool-section">
      <div class="tool-section-title">Analyze</div>
      ${analyze.map(([id, name, desc, tile, g]) => `
        <div class="tool-item" data-analyze="${id}">
          <span class="tile ${tile}">${glyph(g)}</span>
          <div class="tool-text"><span class="tool-name">${name}</span><span class="tool-desc">${desc}</span></div>
        </div>`).join('')}
    </div>
    <div class="tool-section">
      <div class="tool-section-title">Templates</div>
      ${PRESETS.map((p, i) => `
        <div class="tool-item" data-preset="${p.id}">
          <span class="tile ${['blue', 'green', 'orange', 'purple'][i % 4]}">${glyph(p.icon)}</span>
          <div class="tool-text"><span class="tool-name">${p.title}</span><span class="tool-desc">${p.subtitle}</span></div>
        </div>`).join('')}
    </div>`;
}

function renderQuickRail() {
  const b = (act, ic, tip, on = false) => `<button class="qbtn ${on ? 'on' : ''}" data-q="${act}" data-tip="${tip}">${icon(ic)}</button>`;
  $('#quick-rail').innerHTML = `
    ${b('select', 'cursor', 'Select (Q)', state.tool === 'select')}
    ${b('translate', 'move', 'Move IK target (W)', state.tool === 'translate')}
    ${b('rotate', 'rotate', 'Rotate IK target (E)', state.tool === 'rotate')}
    <div class="sep"></div>
    ${b('frames', 'frames', 'Show frames (F)', state.showFrames)}
    ${b('workspace', 'cloud', 'Workspace cloud', state.showWorkspace)}
    <div class="sep"></div>
    ${b('home', 'home2', 'Home pose (H)')}`;
}

function renderViewPill() {
  const v = (id, label) => `<button class="pill-text ${state.camView === id ? 'on' : ''}" data-cam="${id}">${label}</button>`;
  $('#view-pill').innerHTML = `
    ${v('iso', 'Iso')}${v('front', 'Front')}${v('side', 'Side')}${v('top', 'Top')}
    <div class="sep"></div>
    <button class="qbtn" data-zoom="1.2" title="Zoom out">${icon('zoomOut')}</button>
    <button class="qbtn" data-zoom="0.83" title="Zoom in">${icon('zoomIn')}</button>
    <button class="qbtn" data-cam="fit" title="Fit robot">${icon('fit')}</button>`;
}

// ------------------------------------------------------------------ home

function renderHome() {
  const recent = store.get('beanyik_recent', []);
  const session = store.get('beanyik_session', null);
  const ago = (t) => {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(t).toLocaleDateString();
  };
  $('#home').innerHTML = `
    <div class="home-inner">
      <h1>Welcome to BeanyIK</h1>
      <p class="sub">Build serial robots from parts, then solve their forward and inverse kinematics.</p>
      <div class="hero">
        <div>
          <h2>Start building a robot</h2>
          <p>Drag revolute and prismatic joints into a chain, describe each one with DH parameters or your own 4×4 matrix, then drag the target and watch the IK solver move it.</p>
          <div class="row" style="justify-content:flex-start;flex-wrap:wrap">
            <button class="btn btn-primary" data-home="new" style="flex:0">${icon('plus')}New robot</button>
            <button class="btn" data-home="open" style="flex:0">${icon('folder')}Open file</button>
            ${session?.robot ? `<button class="btn" data-home="resume" style="flex:0">${icon('play')}Continue “${esc(session.robot.name)}”</button>` : ''}
          </div>
        </div>
        <svg class="hero-art" width="210" height="150" viewBox="0 0 210 150" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M40 135h70" opacity=".7"/><rect x="55" y="120" width="40" height="15" rx="4" fill="rgba(255,255,255,.15)"/>
          <path d="M75 120 95 70 150 50 175 75" /><circle cx="75" cy="120" r="7" fill="#5a7dfc"/><circle cx="95" cy="70" r="7" fill="#5a7dfc"/><circle cx="150" cy="50" r="7" fill="#5a7dfc"/>
          <path d="M175 75l8 10M175 75l12-3"/><circle cx="190" cy="100" r="9" stroke-dasharray="4 4" opacity=".8"/><path d="M190 88v-6M190 112v6M178 100h-6M202 100h6" opacity=".8"/>
        </svg>
      </div>
      <h3>Start from a template</h3>
      <div class="card-grid">
        ${PRESETS.map((p, i) => `
          <div class="card" data-preset="${p.id}">
            <span class="tile ${['blue', 'green', 'orange', 'purple'][i % 4]}">${glyph(p.icon)}</span>
            <div><div class="card-title">${p.title}</div><div class="card-sub">${p.subtitle}</div></div>
            <div class="card-meta">${p.build().joints.length} joints · analytic IK included</div>
          </div>`).join('')}
        <div class="card" data-home="new">
          <span class="tile gray">${glyph('blank')}</span>
          <div><div class="card-title">Blank robot</div><div class="card-sub">Empty chain — drag parts in yourself</div></div>
          <div class="card-meta">Standard DH</div>
        </div>
      </div>
      <h3>Recent</h3>
      <div class="recent-list">
        <div class="recent-row head"><span></span><span>Name</span><span>Opened</span><span>Location</span></div>
        ${recent.length ? recent.map((r, i) => `
          <div class="recent-row" data-recent="${i}">
            <span class="tile sm blue">${icon('robot')}</span>
            <span><b>${esc(r.name)}</b></span>
            <span class="muted">${ago(r.time)}</span>
            <span class="muted" title="${esc(r.filePath)}">${esc(r.filePath)}</span>
          </div>`).join('') : '<div class="empty-note">Robots you save or open will show up here.</div>'}
      </div>
    </div>`;
}

function addRecent(filePath, name) {
  const recent = store.get('beanyik_recent', []).filter((r) => r.filePath !== filePath);
  recent.unshift({ filePath, name, time: Date.now() });
  store.set('beanyik_recent', recent.slice(0, 12));
}

// ------------------------------------------------------------------- files

function confirmDiscard() {
  return !state.dirty || state.filePath === null && !state.robot?.joints.length || confirm('You have unsaved changes. Discard them?');
}

function serialize() {
  const q = {};
  state.prep.activeLinks.forEach((l) => { q[l.joint.id] = state.qById[l.joint.id]; });
  return JSON.stringify({ ...state.robot, pose: q }, null, 2);
}

function loadFromText(text, filePath) {
  let data;
  try { data = JSON.parse(text); } catch (e) { toast('Not a valid robot file', 'err'); return; }
  if (!Array.isArray(data.joints)) { toast('Not a BeanyIK robot file', 'err'); return; }
  const { pose, ...robot } = data;
  openRobot(robot, { filePath, qById: pose || null });
  if (filePath) addRecent(filePath, robot.name);
  toast(`Opened ${robot.name}`, 'ok');
}

async function openFile() {
  if (state.view === 'doc' && !confirmDiscard()) return;
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
  toast('Saved', 'ok');
}

async function exportText(content, name, ext, label) {
  const res = await window.api.exportText({ content, suggestedName: name, filters: [{ name: label, extensions: [ext] }] });
  if (res) toast(`Exported ${res.filePath.split(/[\\/]/).pop()}`, 'ok');
}

function newRobot() {
  if (state.view === 'doc' && !confirmDiscard()) return;
  openRobot(blankRobot());
  openPanel('chain');
}

function loadPreset(id) {
  if (state.view === 'doc' && state.robot && !confirmDiscard()) return;
  const p = PRESETS.find((x) => x.id === id);
  openRobot(p.build());
}

// -------------------------------------------------------------------- menu

function toggleMenu(show) {
  const m = $('#menu');
  if (show === undefined) show = m.hidden;
  if (!show) { m.hidden = true; return; }
  const doc = state.view === 'doc';
  const item = (act, ic, label, kbd = '', enabled = true) => enabled ? `<div class="menu-item" data-menu="${act}">${icon(ic)}${label}<span class="kbd">${kbd}</span></div>` : '';
  m.innerHTML = `
    ${item('new', 'plus', 'New robot', 'Ctrl+N')}
    ${item('open', 'folder', 'Open…', 'Ctrl+O')}
    ${item('save', 'save', 'Save', 'Ctrl+S', doc)}
    ${item('saveas', 'save', 'Save as…', 'Ctrl+Shift+S', doc)}
    ${doc ? '<div class="menu-sep"></div>' : ''}
    ${item('export-matlab', 'export', 'Export to MATLAB (.m)', '', doc)}
    ${item('export-csv', 'export', 'Export DH table (.csv)', '', doc)}
    <div class="menu-sep"></div>
    ${item('theme', 'theme', document.documentElement.dataset.theme === 'dark' ? 'Light theme' : 'Dark theme')}
    ${item('home', 'home', 'Home')}`;
  m.hidden = false;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('beanyik_theme', next); } catch { /* ignore */ }
  viewport.applyTheme();
}

// -------------------------------------------------------------- dnd

let dragPayload = null; // { kind } from palette | { move: id } from chain

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
    // nearest gap to the pointer when hovering over a node
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

// ----------------------------------------------------------- events

function wireEvents() {
  $('#btn-min').onclick = () => window.api.minimize();
  $('#btn-max').onclick = () => window.api.maximize();
  $('#btn-close').onclick = () => window.api.close();
  $('#btn-theme').onclick = toggleTheme;
  $('#btn-undo').onclick = undo;
  $('#btn-redo').onclick = redo;
  $('#btn-save').onclick = () => (state.view === 'doc' ? save() : openFile());
  $('#btn-menu').onclick = (e) => { e.stopPropagation(); toggleMenu(); };
  $('#tab-home').onclick = () => showView('home');
  $('#tab-doc').onclick = () => showView('doc');
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
      'export-matlab': () => doAction('export-matlab'), 'export-csv': () => doAction('export-csv'),
    })[it.dataset.menu]?.();
  });

  $('#home').addEventListener('click', (e) => {
    const t = e.target.closest('[data-home],[data-preset],[data-recent]');
    if (!t) return;
    if (t.dataset.preset) return loadPreset(t.dataset.preset);
    if (t.dataset.recent) {
      const r = store.get('beanyik_recent', [])[+t.dataset.recent];
      window.api.readRobot(r.filePath).then((res) => {
        if (res.error) { toast(`Can't open: ${res.error}`, 'err'); return; }
        loadFromText(res.content, res.filePath);
      });
      return;
    }
    const act = t.dataset.home;
    if (act === 'new') newRobot();
    if (act === 'open') openFile();
    if (act === 'resume') {
      const s = store.get('beanyik_session', null);
      if (s?.robot) { openRobot(s.robot, { filePath: s.filePath, qById: s.qById }); markDirty(!!s.filePath); }
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
      if (el.dataset.snap !== snapshot()) { history.past.push(el.dataset.snap); history.future = []; updateUndoButtons(); }
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
        setQ(q);
        markDirty();
        updateScene();
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
      updateScene();
    }
  });
  side.addEventListener('pointerdown', (e) => { if (e.target.dataset.qrange !== undefined) checkpoint(); });
  side.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input.input')) e.target.blur();
    if (e.key === 'Tab' && e.target.matches('.code-editor')) {
      e.preventDefault();
      const t = e.target, s = t.selectionStart;
      t.setRangeText('  ', s, t.selectionEnd, 'end');
      onBoundInput(t);
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
      if (s && s.q.length === state.prep.dof) { checkpoint(); setQ(s.q); markDirty(); updateScene(); }
    }
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, textarea, select');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); if (state.view === 'doc') save(e.shiftKey); return; }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return; }
    if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); newRobot(); return; }
    if (typing || state.view !== 'doc') return;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (ctrl) return;
    const k = e.key.toLowerCase();
    if (k === 'delete' || k === 'backspace') { if (state.selected && getJoint(state.selected)) deleteJoint(state.selected); }
    else if (k === 'escape') select(null);
    else if (k === 'q') setTool('select');
    else if (k === 'w') setTool('translate');
    else if (k === 'e') setTool('rotate');
    else if (k === 'f') { state.showFrames = !state.showFrames; updateScene(); renderQuickRail(); }
    else if (k === 'h') doAction('home');
  });
}

function setTool(t) {
  state.tool = t;
  if (t !== 'select' && (!state.panelOpen || state.panel !== 'ik')) openPanel('ik');
  renderQuickRail();
  syncTargetGizmo();
}

function toggleWorkspace() {
  state.showWorkspace = !state.showWorkspace;
  if (state.showWorkspace) {
    if (!state.prep.dof) { state.showWorkspace = false; toast('Add a movable joint first', 'err'); }
    else {
      viewport.setWorkspace(sampleWorkspace(state.prep, Math.min(30000, 3000 * state.prep.dof)));
      toast('Workspace sampled — random joint configurations within limits', 'info');
    }
  } else viewport.setWorkspace(null);
  renderQuickRail();
}

function doAction(act, data = {}) {
  switch (act) {
    case 'del': return deleteJoint(data.id);
    case 'dup': return duplicateJoint(data.id);
    case 'home': checkpoint(); setQ(state.prep.home); markDirty(); return updateScene();
    case 'zero': checkpoint(); setQ(state.prep.home.map(() => 0)); markDirty(); return updateScene();
    case 'random': {
      checkpoint();
      setQ(state.prep.limits.map(([a, b]) => {
        const lo = Number.isFinite(a) ? a : -Math.PI, hi = Number.isFinite(b) ? b : Math.PI;
        return lo + Math.random() * (hi - lo);
      }));
      markDirty();
      return updateScene();
    }
    case 'tgt-ee': resetTargetToEE(); state.ik.result = null; return renderPanel();
    case 'ik-num': return runNumericIK();
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
      el.innerHTML = `<div class="notice ${good ? 'ok' : 'warn'}">${icon(good ? 'check' : 'warn')}<div>${res.solutions.length} branch(es) returned, <b>${good}</b> reproduce the current end-effector pose${matchesCurrent ? ', including the current joint configuration' : ''}.</div></div>`;
      return;
    }
    case 'copy-matrix': {
      const { name, A } = shownMatrix();
      navigator.clipboard.writeText(matrixToMatlab(A, name));
      return toast('Copied as MATLAB matrix', 'ok');
    }
    case 'export-matlab': return exportText(toMatlab(state.robot), `${state.robot.name.replace(/[^\w]+/g, '_')}_fk.m`, 'm', 'MATLAB script');
    case 'export-csv': return exportText(dhTableCSV(state.robot), `${state.robot.name.replace(/[^\w]+/g, '_')}_dh.csv`, 'csv', 'CSV');
    case 'export-latex': navigator.clipboard.writeText(dhTableLatex(state.robot)); return toast('DH table copied as LaTeX', 'ok');
    case 'copy-text': navigator.clipboard.writeText(matrixToText(shownMatrix().A)); return toast('Copied', 'ok');
  }
}

// -------------------------------------------------------------------- boot

const viewport = new Viewport($('#viewport'), {
  onSelect: (id) => select(id),
  onTargetDrag,
  onTargetDragEnd: () => { if (state.ik.live) markDirty(); },
});

hydrateIcons();
renderTools();
renderQuickRail();
renderViewPill();
wireEvents();
wireDnD();
state.panel = store.get('beanyik_panel', 'chain');
if (!PANELS.some((p) => p.id === state.panel)) state.panel = 'chain';
window.api?.onWindowState?.(() => {});
showView('home');
updateUndoButtons();
