// IK: damped least squares for any chain, plus the user's own closed form
// solver (checked with FK afterwards)

import * as M from './mat.js';
import { endEffector, jacobian, clampToLimits, fk } from './robot.js';

function poseError(Td, T, mode, rotWeight) {
  const pd = M.position(Td), p = M.position(T);
  const ep = M.sub3(pd, p);
  if (mode === 'position') return ep;
  const eo = M.orientationError(M.rotation(Td), M.rotation(T));
  return [...ep, ...eo.map((v) => v * rotWeight)];
}

// (J^T J + λ² I) dq = J^T e, the damping keeps it sane near singularities
function dlsStep(J, e, lambda) {
  const Jt = M.transpose(J);
  const n = Jt.length;
  const A = M.mul(Jt, J);
  for (let i = 0; i < n; i++) A[i][i] += lambda * lambda;
  const b = M.mul(Jt, e.map((v) => [v]));
  const Ainv = M.inverse(A);
  if (!Ainv) return new Array(n).fill(0);
  return M.mul(Ainv, b).map((r) => r[0]);
}

export const DEFAULT_IK_OPTIONS = {
  mode: 'full', // 'full' | 'position'
  maxIter: 200,
  tolPos: 1e-4, // m
  tolRot: 1e-3, // rad
  rotWeight: 0.3, // scales orientation error vs metres
  lambda: 0.05,
  maxStep: 0.25, // rad|m per iteration
  restarts: 6,
};

function errNorms(Td, T) {
  const pe = M.norm(M.sub3(M.position(Td), M.position(T)));
  const re = M.norm(M.orientationError(M.rotation(Td), M.rotation(T)));
  return { pe, re };
}

function solveFrom(prep, Td, q0, o) {
  let q = clampToLimits(prep, q0);
  let T = endEffector(prep, q);
  let e = poseError(Td, T, o.mode, o.rotWeight);
  let cost = e.reduce((s, v) => s + v * v, 0);
  let lambda = o.lambda;
  let iter = 0;
  for (; iter < o.maxIter; iter++) {
    const { pe, re } = errNorms(Td, T);
    if (pe < o.tolPos && (o.mode === 'position' || re < o.tolRot)) break;
    let J = jacobian(prep, q, T);
    if (o.mode === 'position') J = J.slice(0, 3);
    else J = [...J.slice(0, 3), ...J.slice(3).map((row) => row.map((v) => v * o.rotWeight))];
    let dq = dlsStep(J, e, lambda);
    const big = Math.max(...dq.map(Math.abs));
    if (big > o.maxStep) dq = dq.map((v) => (v * o.maxStep) / big);
    const qn = clampToLimits(prep, q.map((v, i) => v + dq[i]));
    const Tn = endEffector(prep, qn);
    const en = poseError(Td, Tn, o.mode, o.rotWeight);
    const cn = en.reduce((s, v) => s + v * v, 0);
    if (cn < cost) {
      q = qn; T = Tn; e = en; cost = cn;
      lambda = Math.max(1e-4, lambda * 0.6);
    } else {
      lambda = Math.min(10, lambda * 3);
      if (lambda >= 10) break;
    }
  }
  const { pe, re } = errNorms(Td, T);
  const ok = pe < o.tolPos * 5 && (o.mode === 'position' || re < o.tolRot * 5);
  return { q, ok, posErr: pe, rotErr: re, iterations: iter };
}

// how far the joints actually have to travel. no wrapping on purpose: a joint
// with limits can't take the short way through ±180°
function jointDistance(prep, a, b) {
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
}

// starts from the current pose. continuous: true (dragging, demos) never jumps
// to another branch and moves each joint at most maxTravel per call, like a
// real arm would. otherwise random restarts are allowed but the solution
// closest to the current pose wins.
export function solveIK(prep, Td, seed, options = {}) {
  const o = { ...DEFAULT_IK_OPTIONS, ...options };
  if (!prep.dof) return { q: [], ok: false, posErr: Infinity, rotErr: Infinity, iterations: 0, error: 'Robot has no movable joints' };
  let best = solveFrom(prep, Td, seed, o);

  if (o.continuous) {
    const travel = jointDistance(prep, best.q, seed);
    if (o.maxTravel && travel > o.maxTravel) {
      const k = o.maxTravel / travel;
      best.q = clampToLimits(prep, seed.map((v, i) => v + (best.q[i] - v) * k));
      best.ok = false;
      best.limited = true;
    }
    return best;
  }

  if (best.ok) return best;
  const score = (x) => x.posErr + (o.mode === 'position' ? 0 : x.rotErr * 0.1);
  const found = [];
  for (let r = 0; r < o.restarts; r++) {
    const rand = prep.limits.map(([a, b]) => {
      const lo = Number.isFinite(a) ? a : -Math.PI, hi = Number.isFinite(b) ? b : Math.PI;
      return lo + Math.random() * (hi - lo);
    });
    const res = solveFrom(prep, Td, rand, o);
    if (res.ok) found.push(res);
    else if (!found.length && score(res) < score(best)) best = res;
  }
  if (found.length) {
    found.sort((a, b) => jointDistance(prep, a.q, seed) - jointDistance(prep, b.q, seed));
    best = found[0];
  }
  best.restartsUsed = true;
  return best;
}

// analytic
export const ANALYTIC_TEMPLATE = `// Closed-form IK. Return an array of solutions; each solution is an array of
// joint values (rad for revolute, m for prismatic) in chain order.
//
//   T  : desired FLANGE pose as 4x4 [[r11,r12,r13,px],...] in the chain's
//        base frame (robot base + tool transforms are already removed)
//   P  : your parameters, e.g. P.L1
//   h  : helpers like atan2, sqrt, acos, mul, inverse, transpose,
//        fk(qPartial) returns the frames, DEG, wrap(angle)
//
// Every returned solution is verified with forward kinematics, so it's fine
// to return all branches and let the app tell you which ones reach.

const px = T[0][3], py = T[1][3], pz = T[2][3];
return [];
`;

const HELPERS = {
  ...Object.fromEntries(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sqrt', 'abs', 'hypot', 'min', 'max', 'sign', 'PI'].map((k) => [k, Math[k]])),
  pi: Math.PI,
  DEG: M.DEG,
  mul: M.mul,
  inverse: M.inverse,
  transpose: M.transpose,
  rotation: M.rotation,
  position: M.position,
  rotX: M.rotX, rotY: M.rotY, rotZ: M.rotZ, trans: M.trans,
  dh: M.dhStandard, mdh: M.dhModified,
  wrap: (a) => Math.atan2(Math.sin(a), Math.cos(a)),
  clampUnit: (x) => Math.min(1, Math.max(-1, x)),
};

export function compileAnalytic(code) {
  // eslint-disable-next-line no-new-func
  return new Function('T', 'P', 'h', code);
}

export function solveAnalytic(prep, Td, code) {
  if (!code || !code.trim()) return { solutions: [], error: 'No analytic solver defined for this robot.' };
  let fn;
  try {
    fn = compileAnalytic(code);
  } catch (e) {
    return { solutions: [], error: `Syntax error: ${e.message}` };
  }
  // solver works on the bare chain, so take base and tool off
  const Tflange = M.mul(M.mul(M.invertTransform(prep.base), Td), M.invertTransform(prep.tool));
  const helpers = {
    ...HELPERS,
    // FK of the first few joints, base = identity
    fk: (qPartial) => {
      let T = M.identity(4);
      const frames = [T];
      let k = 0;
      for (const link of prep.links) {
        if (link.active && k >= qPartial.length) break;
        T = M.mul(T, link.transform(link.active ? qPartial[k++] : 0));
        frames.push(T);
      }
      return frames;
    },
  };
  let raw;
  try {
    raw = fn(Tflange, { ...prep.scope }, helpers);
  } catch (e) {
    return { solutions: [], error: `Runtime error: ${e.message}` };
  }
  if (!Array.isArray(raw)) return { solutions: [], error: 'Solver must return an array of solutions.' };
  if (raw.length && !Array.isArray(raw[0])) raw = [raw];
  const solutions = raw.map((q) => {
    const qn = q.map(Number);
    const valid = qn.length === prep.dof && qn.every(Number.isFinite);
    if (!valid) return { q: qn, ok: false, reason: `Expected ${prep.dof} finite values` };
    const T = fk(prep, qn).ee;
    const { pe, re } = errNorms(Td, T);
    const inLimits = qn.every((v, i) => v >= prep.limits[i][0] - 1e-9 && v <= prep.limits[i][1] + 1e-9);
    return { q: qn, ok: pe < 1e-5 && re < 1e-5, posErr: pe, rotErr: re, inLimits };
  });
  return { solutions, error: null };
}
