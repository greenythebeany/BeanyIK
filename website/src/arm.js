// 3 link planar arm, solved the same way the app does it: damped least
// squares from the current pose, joints capped per frame so it never snaps
export const L = [0.42, 0.34, 0.2];
export const REACH = L[0] + L[1] + L[2];
export const HOME = [0.9, -1.1, -0.7];
export const LIMIT = [Math.PI, 2.6, 2.6]; // joint 1 free-ish, the others like a real elbow/wrist
export const MAX_STEP = 0.06; // rad per frame

export function fk(q) {
  const pts = [[0, 0]];
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < 3; i++) {
    a += q[i];
    x += L[i] * Math.cos(a);
    y += L[i] * Math.sin(a);
    pts.push([x, y]);
  }
  return pts;
}

export function step(q, target) {
  const pts = fk(q);
  const tip = pts[3];
  const ex = target[0] - tip[0], ey = target[1] - tip[1];
  const err = Math.hypot(ex, ey);
  if (err < 1e-4) return { q, err };
  // jacobian 2x3
  const J = [[0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    J[0][i] = -(tip[1] - pts[i][1]);
    J[1][i] = tip[0] - pts[i][0];
  }
  const lam2 = 0.02;
  const a = J[0][0] ** 2 + J[0][1] ** 2 + J[0][2] ** 2 + lam2;
  const b = J[0][0] * J[1][0] + J[0][1] * J[1][1] + J[0][2] * J[1][2];
  const d = J[1][0] ** 2 + J[1][1] ** 2 + J[1][2] ** 2 + lam2;
  const det = a * d - b * b;
  const fx = (d * ex - b * ey) / det, fy = (-b * ex + a * ey) / det;
  let dq = [0, 1, 2].map((i) => J[0][i] * fx + J[1][i] * fy);
  const big = Math.max(...dq.map(Math.abs));
  if (big > MAX_STEP) dq = dq.map((v) => (v * MAX_STEP) / big);
  const next = q.map((v, i) => Math.max(-LIMIT[i], Math.min(LIMIT[i], v + dq[i])));
  return { q: next, err };
}

