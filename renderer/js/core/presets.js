// templates, each one has a working closed form IK

import { makeRobot, makeJoint } from './robot.js';

const J = (type, name, dh, extra = {}) => makeJoint(type, { name, dh: { theta: '0', d: '0', a: '0', alpha: '0', ...dh }, ...extra });

const ARM6_IK = `// Anthropomorphic arm + spherical wrist (standard DH).
// wrist centre gives q1..q3, wrist orientation gives q4..q6. 8 branches total
const { d1, a2, d4, d6 } = P;
const R = h.rotation(T);
const ax = R[0][2], ay = R[1][2], az = R[2][2];
const wx = T[0][3] - d6 * ax, wy = T[1][3] - d6 * ay, wz = T[2][3] - d6 * az;
const sols = [];
for (const shoulder of [1, -1]) {
  const q1 = shoulder > 0 ? h.atan2(wy, wx) : h.atan2(-wy, -wx);
  const r = shoulder * h.hypot(wx, wy), s = wz - d1;
  const D = (r * r + s * s - a2 * a2 - d4 * d4) / (2 * a2 * d4);
  if (Math.abs(D) > 1) continue;
  for (const elbow of [1, -1]) {
    const t3p = h.atan2(elbow * h.sqrt(1 - D * D), D);   // forearm angle rel. to upper arm
    const th2 = h.atan2(s, r) - h.atan2(d4 * h.sin(t3p), a2 + d4 * h.cos(t3p));
    const q2 = h.wrap(th2 - h.PI / 2);                     // theta offset of joint 2 is 90°
    const q3 = h.wrap(t3p + h.PI / 2);
    const R03 = h.rotation(h.fk([q1, q2, q3]).at(-1));
    const R36 = h.mul(h.transpose(R03), R);
    for (const flip of [1, -1]) {
      const q5 = h.atan2(flip * h.hypot(R36[0][2], R36[1][2]), R36[2][2]);
      const q4 = h.atan2(flip * R36[1][2], flip * R36[0][2]);
      const q6 = h.atan2(flip * R36[2][1], -flip * R36[2][0]);
      sols.push([q1, q2, q3, q4, q5, q6].map(h.wrap));
    }
  }
}
return sols;
`;

const LEG_IK = `// 3-DOF quadruped leg: hip abduction (about body x), hip flexion, knee.
// T is the foot pose in frame 0 (x0 down, y0 left, z0 forward).
const { L0, L1, L2 } = P;
const px = T[0][3], py = T[1][3], pz = T[2][3];
const rr = px * px + py * py - L0 * L0;
if (rr < 0) return [];
const Y = -pz;
const c3 = (rr + Y * Y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
if (Math.abs(c3) > 1) return [];
const sols = [];
for (const X of [h.sqrt(rr), -h.sqrt(rr)]) {   // leg below / leg swung over the hip
  const q1 = h.atan2(py, px) - h.atan2(L0, X);
  for (const knee of [-1, 1]) {                  // knee-backward first, like most dogs
    const q3 = knee * h.acos(c3);
    const q2 = h.atan2(Y, X) - h.atan2(L2 * h.sin(q3), L1 + L2 * h.cos(q3));
    sols.push([h.wrap(q1), h.wrap(q2), q3]);
  }
}
return sols;
`;

const PLANAR_IK = `// Planar RR arm, position only (orientation follows from q1 + q2).
const { L1, L2 } = P;
const x = T[0][3], y = T[1][3];
const c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
if (Math.abs(c2) > 1) return [];
return [1, -1].map((s) => {
  const q2 = s * h.acos(c2);
  const q1 = h.atan2(y, x) - h.atan2(L2 * h.sin(q2), L1 + L2 * h.cos(q2));
  return [h.wrap(q1), q2];
});
`;

const SCARA_IK = `// SCARA (RRPR, standard DH). Joint 3 is prismatic downwards.
const { d1, L1, L2 } = P;
const x = T[0][3], y = T[1][3], z = T[2][3];
const c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
if (Math.abs(c2) > 1) return [];
const yawT = h.atan2(T[1][0], T[0][0]);
return [1, -1].map((s) => {
  const q2 = s * h.acos(c2);
  const q1 = h.atan2(y, x) - h.atan2(L2 * h.sin(q2), L1 + L2 * h.cos(q2));
  const q3 = d1 - z;                     // alpha2 = 180° flips z downwards
  const q4 = h.wrap(q1 + q2 - yawT);     // frame 3 is mirrored, so yaw subtracts
  return [h.wrap(q1), q2, q3, q4];
});
`;

export const PRESETS = [
  {
    id: 'arm6',
    title: '6-DOF arm',
    subtitle: 'Anthropomorphic arm with spherical wrist',
    icon: 'arm',
    build: () => makeRobot({
      name: '6-DOF arm',
      params: [
        { name: 'd1', value: '0.30' },
        { name: 'a2', value: '0.35' },
        { name: 'd4', value: '0.35' },
        { name: 'd6', value: '0.08' },
      ],
      joints: [
        J('revolute', 'Waist', { d: 'd1', alpha: '90' }),
        J('revolute', 'Shoulder', { theta: '90', a: 'a2' }, { min: '-120', max: '120' }),
        J('revolute', 'Elbow', { alpha: '90' }, { min: '-150', max: '150', home: '-20' }),
        J('revolute', 'Wrist roll', { d: 'd4', alpha: '-90' }),
        J('revolute', 'Wrist pitch', { alpha: '90' }, { min: '-120', max: '120', home: '-30' }),
        J('revolute', 'Flange', { d: 'd6' }),
      ],
      analyticIK: ARM6_IK,
    }),
  },
  {
    id: 'leg3',
    title: 'Quadruped leg',
    subtitle: 'Hip abduction, hip flexion, knee',
    icon: 'leg',
    build: () => makeRobot({
      name: 'Robot dog leg (left)',
      params: [
        { name: 'L0', value: '0.06' },
        { name: 'L1', value: '0.20' },
        { name: 'L2', value: '0.20' },
      ],
      base: { x: '0', y: '0', z: '0.45', roll: '0', pitch: '90', yaw: '0' },
      joints: [
        J('revolute', 'Hip abduction', { alpha: '-90' }, { min: '-45', max: '45' }),
        J('revolute', 'Hip flexion', { d: 'L0', a: 'L1' }, { min: '-90', max: '90', home: '30' }),
        J('revolute', 'Knee', { a: 'L2' }, { min: '-160', max: '0', home: '-60' }),
      ],
      analyticIK: LEG_IK,
    }),
  },
  {
    id: 'planar2',
    title: 'Planar 2R',
    subtitle: 'The classic two-link arm',
    icon: 'planar',
    build: () => makeRobot({
      name: 'Planar 2R',
      params: [{ name: 'L1', value: '0.4' }, { name: 'L2', value: '0.3' }],
      joints: [
        J('revolute', 'Joint 1', { a: 'L1' }),
        J('revolute', 'Joint 2', { a: 'L2' }, { home: '45' }),
      ],
      analyticIK: PLANAR_IK,
    }),
  },
  {
    id: 'scara',
    title: 'SCARA',
    subtitle: 'RRPR pick-and-place',
    icon: 'scara',
    build: () => makeRobot({
      name: 'SCARA',
      params: [
        { name: 'd1', value: '0.40' },
        { name: 'L1', value: '0.35' },
        { name: 'L2', value: '0.25' },
      ],
      joints: [
        J('revolute', 'Shoulder', { d: 'd1', a: 'L1' }, { min: '-150', max: '150' }),
        J('revolute', 'Elbow', { a: 'L2', alpha: '180' }, { min: '-145', max: '145', home: '30' }),
        J('prismatic', 'Quill', {}, { min: '0', max: '0.3', home: '0.1' }),
        J('revolute', 'Wrist', {}),
      ],
      analyticIK: SCARA_IK,
    }),
  },
];

export function blankRobot() {
  return makeRobot({ name: 'Untitled robot' });
}
