// robot model + FK. no DOM in here so npm test can run it.
// lengths in metres. angles in the editor are degrees, but q is radians
// internally and inside custom matrices.

import * as M from './mat.js';
import { compile, tryEvaluate } from './expr.js';

let idSeq = 0;
export const newId = () => `j${Date.now().toString(36)}${(idSeq++).toString(36)}`;

export const JOINT_TYPES = ['revolute', 'prismatic', 'fixed'];

export function makeJoint(type = 'revolute', overrides = {}) {
  const isPrism = type === 'prismatic';
  return {
    id: newId(),
    name: '',
    type,
    mode: 'dh',
    // so a new part isn't invisible
    // fixed links start upright (along z), revolute ones stick out along x
    dh: { theta: '0', d: type === 'fixed' ? '0.15' : '0', a: isPrism || type === 'fixed' ? '0' : '0.2', alpha: '0' },
    matrix: [
      ['cos(q)', '-sin(q)', '0', '0'],
      ['sin(q)', 'cos(q)', '0', '0'],
      ['0', '0', '1', '0'],
    ],
    min: isPrism ? '0' : '-180',
    max: isPrism ? '0.3' : '180',
    home: isPrism ? '0.1' : '0',
    ...overrides,
  };
}

export function makeRobot(overrides = {}) {
  return {
    format: 'beanyik-robot',
    version: 1,
    name: 'Untitled robot',
    convention: 'standard',
    params: [],
    base: { x: '0', y: '0', z: '0', roll: '0', pitch: '0', yaw: '0' },
    tool: { x: '0', y: '0', z: '0', roll: '0', pitch: '0', yaw: '0' },
    joints: [],
    analyticIK: '',
    notes: '',
    ...overrides,
  };
}

export const isActive = (j) => j.type !== 'fixed';

export function toDisplay(joint, q) {
  return joint.type === 'revolute' ? q / M.DEG : q;
}
export function fromDisplay(joint, v) {
  return joint.type === 'revolute' ? v * M.DEG : v;
}

// compilation
// later params can use earlier ones
export function resolveParams(robot) {
  const scope = {};
  const errors = {};
  for (const p of robot.params) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name || '')) { errors[p.name] = 'Invalid name'; continue; }
    const r = tryEvaluate(p.value, scope);
    if (r.error) errors[p.name] = r.error;
    scope[p.name] = r.error ? 0 : r.value;
  }
  return { scope, errors };
}

function poseFrom(spec, scope, errors, prefix) {
  const v = {};
  for (const k of ['x', 'y', 'z', 'roll', 'pitch', 'yaw']) {
    const r = tryEvaluate(spec?.[k] ?? '0', scope);
    if (r.error) errors[`${prefix}.${k}`] = r.error;
    v[k] = r.error ? 0 : r.value;
  }
  return M.fromXYZRPY(v.x, v.y, v.z, v.roll * M.DEG, v.pitch * M.DEG, v.yaw * M.DEG);
}

// errors go into prep.errors["jointId.field"] so the UI can mark the field
export function prepare(robot) {
  const { scope, errors: paramErrors } = resolveParams(robot);
  const errors = {};
  for (const [k, v] of Object.entries(paramErrors)) errors[`param.${k}`] = v;

  const base = poseFrom(robot.base, scope, errors, 'base');
  const tool = poseFrom(robot.tool, scope, errors, 'tool');
  const modified = robot.convention === 'modified';

  const links = robot.joints.map((j) => {
    const num = (field, src, fallback = 0) => {
      const r = tryEvaluate(src, scope);
      if (r.error) { errors[`${j.id}.${field}`] = r.error; return fallback; }
      return r.value;
    };
    const active = isActive(j);
    const unit = j.type === 'revolute' ? M.DEG : 1;
    const link = {
      joint: j,
      active,
      min: active ? num('min', j.min, -Infinity) * unit : 0,
      max: active ? num('max', j.max, Infinity) * unit : 0,
      home: active ? num('home', j.home, 0) * unit : 0,
    };
    if (link.min > link.max) [link.min, link.max] = [link.max, link.min];

    if (j.mode === 'matrix') {
      const cells = j.matrix.map((row, r) => row.map((src, c) => {
        try {
          const { fn } = compile(src);
          return fn;
        } catch (e) {
          errors[`${j.id}.m${r}${c}`] = e.message;
          return () => (r === c ? 1 : 0);
        }
      }));
      const local = { ...scope };
      link.transform = (q) => {
        local.q = q;
        const T = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 1]];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) T[r][c] = cells[r][c](local);
        return T;
      };
      // check the rotation part is actually a rotation
      try {
        const T = link.transform(link.home);
        const R = M.rotation(T);
        const d = M.det(R);
        const RtR = M.mul(M.transpose(R), R);
        const orthoErr = Math.max(...RtR.flatMap((row, i) => row.map((v, k) => Math.abs(v - (i === k ? 1 : 0)))));
        if (!Number.isFinite(d) || Math.abs(d - 1) > 1e-3 || orthoErr > 1e-3) {
          errors[`${j.id}.matrix`] = 'Rotation block is not orthonormal (det ≠ 1)';
        }
      } catch (e) {
        errors[`${j.id}.matrix`] = e.message;
      }
    } else {
      const theta = num('theta', j.dh.theta) * M.DEG;
      const d = num('d', j.dh.d);
      const a = num('a', j.dh.a);
      const alpha = num('alpha', j.dh.alpha) * M.DEG;
      link.dh = { theta, d, a, alpha };
      const f = modified ? M.dhModified : M.dhStandard;
      link.transform = (q) => {
        if (j.type === 'revolute') return f(theta + q, d, a, alpha);
        if (j.type === 'prismatic') return f(theta, d + q, a, alpha);
        return f(theta, d, a, alpha);
      };
    }
    return link;
  });

  const activeLinks = links.filter((l) => l.active);

  // rough robot size for drawing, doesn't change with the pose
  let size = M.norm(M.position(tool));
  for (const link of links) {
    try {
      size += M.norm(M.position(link.transform(link.home)));
      if (link.joint.type === 'prismatic' && Number.isFinite(link.max) && Number.isFinite(link.min)) size += Math.abs(link.max - link.min);
    } catch { /* reported via errors */ }
  }
  if (!Number.isFinite(size)) size = 0;

  return {
    size,
    robot,
    modified,
    scope,
    errors,
    base,
    tool,
    links,
    activeLinks,
    dof: activeLinks.length,
    limits: activeLinks.map((l) => [l.min, l.max]),
    home: activeLinks.map((l) => l.home),
  };
}

// forward kinematics
// frames[0] is the base, frames[i] the frame after link i, ee is the tool
export function fk(prep, q) {
  const frames = [prep.base];
  const A = [];
  let T = prep.base;
  let k = 0;
  for (const link of prep.links) {
    const qi = link.active ? q[k++] ?? 0 : 0;
    const Ai = link.transform(qi);
    A.push(Ai);
    T = M.mul(T, Ai);
    frames.push(T);
  }
  const flange = T;
  const ee = M.mul(T, prep.tool);
  return { frames, A, flange, ee };
}

export function endEffector(prep, q) {
  let T = prep.base;
  let k = 0;
  for (const link of prep.links) T = M.mul(T, link.transform(link.active ? q[k++] ?? 0 : 0));
  return M.mul(T, prep.tool);
}

// numerical jacobian, 6 x dof, linear rows first. works for matrix joints too
export function jacobian(prep, q, T0 = endEffector(prep, q)) {
  const n = prep.dof;
  const J = M.zeros(6, n);
  const h = 1e-6;
  const p0 = M.position(T0), R0 = M.rotation(T0);
  for (let i = 0; i < n; i++) {
    const qp = q.slice();
    qp[i] += h;
    const T = endEffector(prep, qp);
    const p = M.position(T);
    const w = M.orientationError(M.rotation(T), R0);
    J[0][i] = (p[0] - p0[0]) / h;
    J[1][i] = (p[1] - p0[1]) / h;
    J[2][i] = (p[2] - p0[2]) / h;
    J[3][i] = w[0] / h;
    J[4][i] = w[1] / h;
    J[5][i] = w[2] / h;
  }
  return J;
}

// yoshikawa manipulability
export function manipulability(J, rows = 6) {
  const Jr = J.slice(0, rows);
  const sv = M.singularValues(Jr);
  const r = Math.min(rows, J[0]?.length ?? 0);
  if (!r) return { w: 0, sv: [], cond: Infinity };
  const top = sv.slice(0, r);
  const w = top.reduce((a, b) => a * b, 1);
  const cond = top[top.length - 1] > 1e-12 ? top[0] / top[top.length - 1] : Infinity;
  return { w, sv: top, cond };
}

// joint positions/axes for drawing. matrix joints get probed numerically
export function jointGeometry(prep, q, fkResult = fk(prep, q)) {
  const { frames } = fkResult;
  const out = [];
  let k = 0;
  prep.links.forEach((link, i) => {
    const prev = frames[i], next = frames[i + 1];
    const zPrev = [prev[0][2], prev[1][2], prev[2][2]];
    const zNext = [next[0][2], next[1][2], next[2][2]];
    const xPrev = [prev[0][0], prev[1][0], prev[2][0]];
    const oPrev = M.position(prev), oNext = M.position(next);
    let axis, at, path;
    if (link.dh && !prep.modified) {
      axis = zPrev; at = oPrev;
      const dEff = link.joint.type === 'prismatic' ? link.dh.d + (q[k] ?? 0) : link.dh.d;
      const mid = oPrev.map((v, c) => v + zPrev[c] * dEff);
      path = [oPrev, mid, oNext];
    } else if (link.dh) {
      axis = zNext; at = oNext;
      const mid = oPrev.map((v, c) => v + xPrev[c] * link.dh.a);
      path = [oPrev, mid, oNext];
    } else {
      // custom matrix, see how the next frame moves
      at = oPrev; path = [oPrev, oNext]; axis = zPrev;
      if (link.active) {
        const qi = q[k] ?? 0, h = 1e-4;
        const Ta = M.mul(prev, link.transform(qi)), Tb = M.mul(prev, link.transform(qi + h));
        if (link.joint.type === 'revolute') {
          const w = M.orientationError(M.rotation(Tb), M.rotation(Ta));
          const n = M.norm(w);
          if (n > 1e-12) axis = w.map((v) => v / n);
        } else {
          const dp = M.sub3(M.position(Tb), M.position(Ta));
          const n = M.norm(dp);
          if (n > 1e-12) axis = dp.map((v) => v / n);
        }
      }
    }
    out.push({ link, index: i, axis, at, path, qIndex: link.active ? k : -1 });
    if (link.active) k++;
  });
  return out;
}

// random configs for the workspace cloud
export function sampleWorkspace(prep, count = 4000) {
  const pts = new Float32Array(count * 3);
  const lim = prep.limits.map(([a, b]) => [Number.isFinite(a) ? a : -Math.PI, Number.isFinite(b) ? b : Math.PI]);
  for (let s = 0; s < count; s++) {
    const q = lim.map(([a, b]) => a + Math.random() * (b - a));
    const T = endEffector(prep, q);
    pts[s * 3] = T[0][3];
    pts[s * 3 + 1] = T[1][3];
    pts[s * 3 + 2] = T[2][3];
  }
  return pts;
}

export function clampToLimits(prep, q) {
  return q.map((v, i) => Math.min(prep.limits[i][1], Math.max(prep.limits[i][0], v)));
}
