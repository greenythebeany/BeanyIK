// matrix helpers, matrices are arrays of rows. transforms are [R p; 0 1]

export const DEG = Math.PI / 180;

export function identity(n = 4) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

export function zeros(r, c) {
  return Array.from({ length: r }, () => new Array(c).fill(0));
}

export function clone(A) {
  return A.map((row) => row.slice());
}

export function mul(A, B) {
  const r = A.length, n = B.length, c = B[0].length;
  const C = zeros(r, c);
  for (let i = 0; i < r; i++) {
    for (let k = 0; k < n; k++) {
      const a = A[i][k];
      if (a === 0) continue;
      for (let j = 0; j < c; j++) C[i][j] += a * B[k][j];
    }
  }
  return C;
}

export function transpose(A) {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

export function add(A, B) {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

export function scale(A, s) {
  return A.map((row) => row.map((v) => v * s));
}

// gauss jordan, null if singular
export function inverse(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...identity(n)[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

export function det(A) {
  const n = A.length;
  const M = clone(A);
  let d = 1;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-14) return 0;
    if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; d = -d; }
    d *= M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let j = col; j < n; j++) M[r][j] -= f * M[col][j];
    }
  }
  return d;
}

// homogeneous transforms
export function rotX(t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]];
}
export function rotY(t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]];
}
export function rotZ(t) {
  const c = Math.cos(t), s = Math.sin(t);
  return [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
}
export function trans(x, y, z) {
  return [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];
}

// Standard (distal) DH: Rz(theta) Tz(d) Tx(a) Rx(alpha)
export function dhStandard(theta, d, a, alpha) {
  const ct = Math.cos(theta), st = Math.sin(theta), ca = Math.cos(alpha), sa = Math.sin(alpha);
  return [
    [ct, -st * ca, st * sa, a * ct],
    [st, ct * ca, -ct * sa, a * st],
    [0, sa, ca, d],
    [0, 0, 0, 1],
  ];
}

// Modified (proximal, Craig) DH: Rx(alpha_{i-1}) Tx(a_{i-1}) Rz(theta) Tz(d)
export function dhModified(theta, d, a, alpha) {
  const ct = Math.cos(theta), st = Math.sin(theta), ca = Math.cos(alpha), sa = Math.sin(alpha);
  return [
    [ct, -st, 0, a],
    [st * ca, ct * ca, -sa, -sa * d],
    [st * sa, ct * sa, ca, ca * d],
    [0, 0, 0, 1],
  ];
}

// RPY: R = Rz(yaw) Ry(pitch) Rx(roll)
export function fromXYZRPY(x, y, z, roll, pitch, yaw) {
  const T = mul(mul(rotZ(yaw), rotY(pitch)), rotX(roll));
  T[0][3] = x; T[1][3] = y; T[2][3] = z;
  return T;
}

export function toRPY(T) {
  const r20 = T[2][0];
  let pitch, roll, yaw;
  if (Math.abs(r20) < 1 - 1e-9) {
    pitch = -Math.asin(r20);
    roll = Math.atan2(T[2][1], T[2][2]);
    yaw = Math.atan2(T[1][0], T[0][0]);
  } else {
    // gimbal lock: fold everything into yaw
    pitch = r20 < 0 ? Math.PI / 2 : -Math.PI / 2;
    roll = 0;
    yaw = Math.atan2(-T[0][1], T[1][1]);
  }
  return { roll, pitch, yaw };
}

export function position(T) {
  return [T[0][3], T[1][3], T[2][3]];
}

export function rotation(T) {
  return [T[0].slice(0, 3), T[1].slice(0, 3), T[2].slice(0, 3)];
}

export function invertTransform(T) {
  const R = rotation(T), p = position(T), Rt = transpose(R);
  const q = Rt.map((row) => -(row[0] * p[0] + row[1] * p[1] + row[2] * p[2]));
  return [[...Rt[0], q[0]], [...Rt[1], q[1]], [...Rt[2], q[2]], [0, 0, 0, 1]];
}

export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function norm(v) { return Math.hypot(...v); }

// orientation error as axis*angle, log(Rd * Rc^T) in the base frame
export function orientationError(Rd, Rc) {
  const E = mul(Rd, transpose(Rc));
  const tr = E[0][0] + E[1][1] + E[2][2];
  const cosA = Math.min(1, Math.max(-1, (tr - 1) / 2));
  const angle = Math.acos(cosA);
  const v = [E[2][1] - E[1][2], E[0][2] - E[2][0], E[1][0] - E[0][1]];
  if (angle < 1e-9) return [v[0] / 2, v[1] / 2, v[2] / 2];
  if (Math.PI - angle < 1e-6) {
    // close to 180°, get the axis from the diagonal
    const xx = (E[0][0] + 1) / 2, yy = (E[1][1] + 1) / 2, zz = (E[2][2] + 1) / 2;
    let axis;
    if (xx >= yy && xx >= zz) { const x = Math.sqrt(xx); axis = [x, E[0][1] / (2 * x), E[0][2] / (2 * x)]; }
    else if (yy >= zz) { const y = Math.sqrt(yy); axis = [E[0][1] / (2 * y), y, E[1][2] / (2 * y)]; }
    else { const z = Math.sqrt(zz); axis = [E[0][2] / (2 * z), E[1][2] / (2 * z), z]; }
    return axis.map((a) => a * angle);
  }
  const k = angle / (2 * Math.sin(angle));
  return v.map((x) => x * k);
}

// singular values from the eigenvalues of J J^T (jacobi method)
export function singularValues(J) {
  const A = mul(J, transpose(J));
  const n = A.length;
  const M = clone(A);
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += M[p][q] * M[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(M[p][q]) < 1e-15) continue;
        const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = M[k][p], mkq = M[k][q];
          M[k][p] = c * mkp - s * mkq;
          M[k][q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = M[p][k], mqk = M[q][k];
          M[p][k] = c * mpk - s * mqk;
          M[q][k] = s * mpk + c * mqk;
        }
      }
    }
  }
  return M.map((row, i) => Math.sqrt(Math.max(0, row[i]))).sort((a, b) => b - a);
}
