// drags IK targets around in nasty ways and checks the arm never jumps (templates + random robots)
import { PRESETS } from '../renderer/js/core/presets.js';
import { prepare, makeRobot, makeJoint } from '../renderer/js/core/robot.js';
import { solveIK } from '../renderer/js/core/ik.js';
import * as M from '../renderer/js/core/mat.js';

const TRAVEL = 0.07;
const target = (x, y, z) => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z], [0, 0, 0, 1]];
const paths = {
  // straight across the front, through and past full reach, then back behind the base
  sweep: (s) => [0.9 * Math.cos(Math.PI * s), 0.9 * Math.sin(Math.PI * s) * 0.4, 0.25],
  // in and out through the stretched-out singularity
  pump: (s) => [0.15 + 0.6 * Math.abs(Math.sin(3 * Math.PI * s)), 0.05, 0.25],
  // random mouse jitter
  jitter: (() => { const r = []; for (let i = 0; i < 400; i++) r.push([Math.random() * 1.2 - 0.6, Math.random() * 1.2 - 0.6, 0.1 + Math.random() * 0.3]); return (s) => r[Math.min(399, Math.floor(s * 400))]; })(),
};
// random user style robots: any mix of joint types, random DH numbers
function randomRobot(seed) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const joints = [];
  const n = 2 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const type = pick(['revolute', 'revolute', 'revolute', 'prismatic', 'fixed', 'matrix']);
    if (type === 'matrix') {
      joints.push(makeJoint('revolute', { mode: 'matrix', matrix: [['cos(q)', '-sin(q)', '0', String((rnd() * 0.3).toFixed(2))], ['sin(q)', 'cos(q)', '0', '0'], ['0', '0', '1', String((rnd() * 0.2).toFixed(2))]] }));
      continue;
    }
    joints.push(makeJoint(type, { dh: { theta: String(pick([0, 90, -90, 30])), d: (rnd() * 0.3).toFixed(2), a: (rnd() * 0.35).toFixed(2), alpha: String(pick([0, 90, -90, 180])) } }));
  }
  return makeRobot({ name: `random ${seed}`, joints });
}

let bad = 0;
const robots = [...['scara', 'planar2', 'arm6', 'leg3'].map((id) => [id, PRESETS.find((p) => p.id === id).build()]),
  ...Array.from({ length: 12 }, (_, i) => [`user${i + 1}`, randomRobot(i + 1)])];
for (const [id, robot] of robots) {
  const prep = prepare(robot);
  if (!prep.dof) continue;
  for (const [name, path] of Object.entries(paths)) {
    let q = prep.home.slice();
    let maxStep = 0, flips = 0;
    const elbowIdx = Math.min(prep.dof - 1, id === 'arm6' ? 2 : 1);
    for (let k = 0; k <= 600; k++) {
      const [x, y, z] = path(k / 600);
      const r = solveIK(prep, target(x, y, id === 'planar2' ? 0 : z), q, { mode: 'position', continuous: true, maxTravel: TRAVEL, maxIter: 60 });
      const step = Math.max(...r.q.map((v, i) => Math.abs(v - q[i])));
      if (Math.sign(r.q[elbowIdx]) !== Math.sign(q[elbowIdx]) && Math.abs(r.q[elbowIdx] - q[elbowIdx]) > 0.2) flips++;
      maxStep = Math.max(maxStep, step);
      q = r.q;
    }
    const ok = maxStep <= TRAVEL + 1e-9 && flips === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${id.padEnd(8)} ${name.padEnd(7)} biggest joint jump per frame ${(maxStep / M.DEG).toFixed(2)} deg (limit ${(TRAVEL / M.DEG).toFixed(1)}), elbow flips ${flips}`);
  }
}
process.exit(bad ? 1 : 0);
