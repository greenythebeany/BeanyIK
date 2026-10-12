// URDF import. turns the joint tree into one serial chain of elementary
// transform joints. no DOM in here so npm test can run it.
// meshes, inertia and collision are ignored, only kinematics come over.

import { makeRobot, makeJoint } from './robot.js';

// tiny xml reader, enough for urdf: elements, attributes, comments
export function parseXML(text) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const src = String(text)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '');
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(src))) {
    const [, closing, tag, attrSrc, selfClose] = m;
    if (closing) {
      if (stack.length > 1 && stack.at(-1).tag === tag) stack.pop();
      else throw new Error(`Unexpected </${tag}>`);
      continue;
    }
    const attrs = {};
    for (const a of attrSrc.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescape(a[2] ?? a[3]);
    const el = { tag, attrs, children: [] };
    stack.at(-1).children.push(el);
    if (!selfClose) stack.push(el);
  }
  if (stack.length > 1) throw new Error(`<${stack.at(-1).tag}> is never closed`);
  return root;
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const child = (el, tag) => el.children.find((c) => c.tag === tag);
const vec = (s, fallback) => {
  const v = String(s ?? '').trim().split(/\s+/).map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? v : fallback;
};

const DEG = 180 / Math.PI;
// short numbers so the fields stay readable, 90.0000000001 -> "90"
export const num = (v) => {
  const r = Math.round(v * 1e6) / 1e6;
  return String(Object.is(r, -0) ? 0 : r);
};

const MOVABLE = { revolute: 'revolute', continuous: 'revolute', prismatic: 'prismatic' };

// parent origin of a urdf joint: translate xyz, then rpy = Rz(yaw) Ry(pitch) Rx(roll)
function originElems(j) {
  const out = [];
  j.xyz.forEach((v, i) => { if (Math.abs(v) > 1e-9) out.push({ op: ['Tx', 'Ty', 'Tz'][i], v: num(v) }); });
  const [roll, pitch, yaw] = j.rpy;
  if (Math.abs(yaw) > 1e-9) out.push({ op: 'Rz', v: num(yaw * DEG) });
  if (Math.abs(pitch) > 1e-9) out.push({ op: 'Ry', v: num(pitch * DEG) });
  if (Math.abs(roll) > 1e-9) out.push({ op: 'Rx', v: num(roll * DEG) });
  return out;
}

// motion about / along the joint axis. a principal axis is one factor,
// any other axis gets turned onto z, moved, and turned back
function motionElems(j) {
  const kind = j.kind === 'prismatic' ? 'T' : 'R';
  const n = Math.hypot(...j.axis);
  const a = n > 1e-12 ? j.axis.map((v) => v / n) : [1, 0, 0];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(Math.abs(a[i]) - 1) < 1e-9) return [{ op: kind + 'xyz'[i], v: a[i] > 0 ? 'q' : '-q' }];
  }
  const theta = Math.acos(Math.max(-1, Math.min(1, a[2]))) * DEG;
  const phi = Math.atan2(a[1], a[0]) * DEG;
  return [
    { op: 'Rz', v: num(phi) }, { op: 'Ry', v: num(theta) },
    { op: kind + 'z', v: 'q' },
    { op: 'Ry', v: num(-theta) }, { op: 'Rz', v: num(-phi) },
  ];
}

function readJoints(robotEl) {
  return robotEl.children.filter((c) => c.tag === 'joint').map((el) => {
    const origin = child(el, 'origin');
    const limit = child(el, 'limit');
    const lim = (k) => (limit && limit.attrs[k] !== undefined && Number.isFinite(+limit.attrs[k]) ? +limit.attrs[k] : null);
    return {
      name: el.attrs.name || '',
      type: el.attrs.type || 'fixed',
      kind: MOVABLE[el.attrs.type] || 'fixed',
      parent: child(el, 'parent')?.attrs.link,
      child: child(el, 'child')?.attrs.link,
      xyz: vec(origin?.attrs.xyz, [0, 0, 0]),
      rpy: vec(origin?.attrs.rpy, [0, 0, 0]),
      axis: vec(child(el, 'axis')?.attrs.xyz, [1, 0, 0]),
      lower: lim('lower'),
      upper: lim('upper'),
      mimic: !!child(el, 'mimic'),
    };
  });
}

// the chain from the root link with the most joints that really move.
// a gripper at the end (2+ moving branches splitting off near the tip) is cut off
function pickChain(joints, warnings) {
  const byParent = new Map();
  for (const j of joints) {
    if (!byParent.has(j.parent)) byParent.set(j.parent, []);
    byParent.get(j.parent).push(j);
  }
  const childLinks = new Set(joints.map((j) => j.child));
  const roots = [...byParent.keys()].filter((l) => !childLinks.has(l));
  if (roots.length !== 1) throw new Error(roots.length ? 'URDF has more than one root link' : 'URDF joints form a loop');
  const counts = (j) => (j.kind !== 'fixed' && !j.mimic ? 1 : 0);

  // best path below each link
  const best = new Map();
  const seen = new Set();
  const walk = (link) => {
    if (best.has(link)) return best.get(link);
    if (seen.has(link)) throw new Error('URDF joints form a loop');
    seen.add(link);
    let top = { moving: 0, path: [] };
    for (const j of byParent.get(link) || []) {
      const sub = walk(j.child);
      const cand = { moving: sub.moving + counts(j), path: [j, ...sub.path] };
      if (cand.moving > top.moving || (cand.moving === top.moving && cand.path.length > top.path.length)) top = cand;
    }
    best.set(link, top);
    return top;
  };
  let path = walk(roots[0]).path;

  // mimic fingers count here, a two finger gripper often has one
  const anyMoving = (j) => j.kind !== 'fixed' || (byParent.get(j.child) || []).some(anyMoving);
  const movingBelow = (link) => (byParent.get(link) || []).filter(anyMoving).length;
  let gripper = 0;
  for (let i = path.length - 1; i > 0; i--) {
    if (movingBelow(path[i].parent) < 2) continue;
    const after = path.slice(i).filter(counts).length;
    if (after <= 2 && path.slice(0, i).some(counts)) {
      warnings.push(`Gripper at ${path[i].parent} left out`);
      const under = (link) => (byParent.get(link) || []).reduce((n, j) => n + counts(j) + under(j.child), 0);
      gripper = under(path[i].parent);
      path = path.slice(0, i);
    }
    break;
  }
  const others = joints.filter(counts).length - path.filter(counts).length - gripper;
  if (others > 0) warnings.push(`${others} joint(s) on other branches left out`);
  return { root: roots[0], tip: path.at(-1)?.child ?? roots[0], path };
}

export function urdfToRobot(text) {
  if (/<xacro:/.test(text)) throw new Error('This is a xacro file, run it through xacro to get a plain URDF first');
  const doc = parseXML(text);
  const robotEl = doc.children.find((c) => c.tag === 'robot');
  if (!robotEl) throw new Error('No <robot> element, not a URDF file');
  const all = readJoints(robotEl);
  if (!all.length) throw new Error('The URDF has no joints');
  const warnings = [];
  const { root, tip, path } = pickChain(all, warnings);

  // each beanyik joint is [motion, origins up to the next motion], so the
  // joint sits where it actually turns. origins before the first motion
  // become a fixed "base" part
  const out = [];
  let current = null;
  let pending = [];
  for (const j of path) {
    pending.push(...originElems(j));
    const moving = j.kind !== 'fixed';
    if (j.mimic) warnings.push(`${j.name} is a mimic joint, it moves on its own here`);
    if (!moving) {
      if (!MOVABLE[j.type] && j.type !== 'fixed') warnings.push(`${j.name} is ${j.type}, treated as fixed`);
      continue;
    }
    if (current) current.elems.push(...pending);
    else if (pending.length) out.push(makeJoint('fixed', { name: root, mode: 'elem', elems: pending, min: '0', max: '0', home: '0' }));
    pending = [];

    const rev = j.kind === 'revolute';
    let lo = rev ? (j.type === 'continuous' || j.lower === null ? -180 : j.lower * DEG) : (j.lower ?? 0);
    let hi = rev ? (j.type === 'continuous' || j.upper === null ? 180 : j.upper * DEG) : (j.upper ?? 0.3);
    if (lo > hi) [lo, hi] = [hi, lo];
    const home = Math.min(hi, Math.max(lo, 0));
    current = makeJoint(j.kind, { name: j.name, mode: 'elem', elems: motionElems(j), min: num(lo), max: num(hi), home: num(home) });
    out.push(current);
  }
  if (current) current.elems.push(...pending);
  else if (pending.length) out.push(makeJoint('fixed', { name: root, mode: 'elem', elems: pending, min: '0', max: '0', home: '0' }));

  const robot = makeRobot({
    name: robotEl.attrs.name || 'URDF robot',
    joints: out,
    notes: `Imported from URDF, chain ${root} → ${tip}.`,
  });
  return { robot, warnings, root, tip };
}
