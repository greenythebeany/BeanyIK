// the website's draggable arm has to follow the same no-flick rule as the app
import { HOME, MAX_STEP, fk, step } from '../website/src/arm.js';

let q = HOME.slice(), worst = 0, flips = 0;
const paths = [
  (s) => [1.2 * Math.cos(Math.PI * s), 0.3 * Math.sin(Math.PI * s)],            // sweep through the base
  (s) => [0.05 + 0.9 * Math.abs(Math.sin(4 * Math.PI * s)), 0.02],              // in and out, stretched
  (s) => [Math.sin(37 * s) * 1.1, Math.cos(53 * s) * 1.1],                      // jittery mouse
];
for (const path of paths) {
  for (let k = 0; k <= 900; k++) {
    let cur = q;
    for (let i = 0; i < 3; i++) cur = step(cur, path(k / 900)).q;   // what one frame does
    const jump = Math.max(...cur.map((v, i) => Math.abs(v - q[i])));
    worst = Math.max(worst, jump);
    if (Math.sign(cur[1]) !== Math.sign(q[1]) && Math.abs(cur[1] - q[1]) > 0.3) flips++;
    q = cur;
  }
}
const limit = 3 * MAX_STEP;
console.log(`${worst <= limit + 1e-9 && flips === 0 ? 'ok  ' : 'FAIL'} website arm: biggest joint change per frame ${(worst * 180 / Math.PI).toFixed(1)} deg (limit ${(limit * 180 / Math.PI).toFixed(1)}), elbow flips ${flips}, tip at ${fk(q)[3].map((v) => v.toFixed(2))}`);
process.exit(worst <= limit + 1e-9 && flips === 0 ? 0 : 1);
