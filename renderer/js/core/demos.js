// demo motions for the play button. templates follow a path in world
// coordinates (IK does the rest), anything else just sweeps its joints

import * as M from './mat.js';

const TAU = Math.PI * 2;
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, s) => a + (b - a) * s;

// position + rotation into a 4x4
const pose = (x, y, z, R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) => [
  [R[0][0], R[0][1], R[0][2], x],
  [R[1][0], R[1][1], R[1][2], y],
  [R[2][0], R[2][1], R[2][2], z],
  [0, 0, 0, 1],
];

const TOOL_DOWN = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];

// piecewise path through keyframes [t, x, y, z], eased between them
function keyframes(frames, period) {
  return (t) => {
    const u = ((t % period) + period) % period;
    let i = 0;
    while (i < frames.length - 2 && u > frames[i + 1][0]) i++;
    const [t0, ...a] = frames[i];
    const [t1, ...b] = frames[i + 1];
    const s = smooth(Math.min(1, Math.max(0, (u - t0) / (t1 - t0))));
    return a.map((v, k) => lerp(v, b[k], s));
  };
}

const scaraPath = keyframes([
  [0.0, 0.40, -0.20, 0.35],
  [0.7, 0.40, -0.20, 0.15], // down to pick
  [1.2, 0.40, -0.20, 0.15],
  [1.9, 0.40, -0.20, 0.35], // lift
  [3.1, 0.40, 0.20, 0.35], // carry over
  [3.8, 0.40, 0.20, 0.15], // place
  [4.3, 0.40, 0.20, 0.15],
  [5.0, 0.40, 0.20, 0.35],
  [6.2, 0.40, -0.20, 0.35], // back
], 6.2);

const DEMOS = {
  arm6: {
    caption: 'Tool traces a circle, pointing down',
    kind: 'path',
    mode: 'full',
    period: 6,
    pose: (t) => {
      const a = (TAU * t) / 6;
      return pose(0.40 + 0.12 * Math.cos(a), 0.12 * Math.sin(a), 0.30, TOOL_DOWN);
    },
  },
  leg3: {
    caption: 'Walking gait: stance and swing',
    kind: 'path',
    mode: 'position',
    period: 1.6,
    pose: (t) => {
      const u = (((t / 1.6) % 1) + 1) % 1;
      const stance = 0.6;
      const reach = 0.08, ground = 0.14, lift = 0.06;
      if (u < stance) {
        // foot on the ground, sliding back as the body moves forward
        return pose(lerp(reach, -reach, u / stance), 0.06, ground);
      }
      const s = (u - stance) / (1 - stance);
      return pose(lerp(-reach, reach, smooth(s)), 0.06, ground + lift * Math.sin(Math.PI * s));
    },
  },
  planar2: {
    caption: 'Tip draws a figure eight',
    kind: 'path',
    mode: 'position',
    period: 5,
    pose: (t) => {
      const a = (TAU * t) / 5;
      return pose(0.45 + 0.18 * Math.sin(a), 0.18 * Math.sin(a) * Math.cos(a), 0);
    },
  },
  scara: {
    caption: 'Pick and place',
    kind: 'path',
    mode: 'position',
    period: 6.2,
    pose: (t) => pose(...scaraPath(t)),
  },
};

// any robot: every joint swings around the middle of its range, out of phase
const JOINT_SWEEP = {
  caption: 'Joint sweep',
  kind: 'joints',
  period: 6,
  q: (t, prep) => prep.limits.map(([lo, hi], i) => {
    const a = Number.isFinite(lo) ? lo : -Math.PI;
    const b = Number.isFinite(hi) ? hi : Math.PI;
    const mid = (a + b) / 2;
    const amp = Math.min((b - a) * 0.35, prep.activeLinks[i].joint.type === 'revolute' ? 60 * M.DEG : Infinity);
    return mid + amp * Math.sin((TAU * t) / 6 + i * 1.3);
  }),
};

export function demoFor(robot) {
  return DEMOS[robot?.template] || JOINT_SWEEP;
}

export function hasPathDemo(robot) {
  return !!DEMOS[robot?.template];
}

// points along one period, for drawing the planned path
export function samplePath(demo, n = 240) {
  if (demo.kind !== 'path') return null;
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const T = demo.pose((demo.period * i) / (n - 1));
    pts[i * 3] = T[0][3];
    pts[i * 3 + 1] = T[1][3];
    pts[i * 3 + 2] = T[2][3];
  }
  return pts;
}
