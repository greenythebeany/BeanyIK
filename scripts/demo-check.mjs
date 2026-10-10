// runs every template demo through IK and prints how well it follows the path
import { PRESETS } from '../renderer/js/core/presets.js';
import { prepare, fk } from '../renderer/js/core/robot.js';
import { solveIK } from '../renderer/js/core/ik.js';
import { demoFor } from '../renderer/js/core/demos.js';
import * as M from '../renderer/js/core/mat.js';

let bad = 0;
for (const preset of PRESETS) {
  const robot = preset.build();
  const prep = prepare(robot);
  const demo = demoFor(robot);
  let q = solveIK(prep, demo.pose(0), prep.home, { mode: demo.mode, restarts: 12 }).q;
  let worst = 0, worstRot = 0, jump = 0, ms = 0;
  for (let k = 1; k <= 30 * demo.period * 2; k++) {
    const t = k / 30;
    const T = demo.pose(t);
    const t0 = performance.now();
    const r = solveIK(prep, T, q, { mode: demo.mode, restarts: 0, maxIter: 40 });
    ms = Math.max(ms, performance.now() - t0);
    jump = Math.max(jump, ...r.q.map((v, i) => Math.abs(v - q[i])));
    q = r.q;
    const ee = fk(prep, q).ee;
    worst = Math.max(worst, M.norm(M.sub3(M.position(T), M.position(ee))));
    if (demo.mode === 'full') worstRot = Math.max(worstRot, M.norm(M.orientationError(M.rotation(T), M.rotation(ee))));
  }
  const ok = worst < 2e-3 && jump < 0.35;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${preset.id.padEnd(8)} pos err ${(worst * 1000).toFixed(2)} mm, rot err ${(worstRot / M.DEG).toFixed(2)} deg, biggest joint step ${(jump / M.DEG).toFixed(1)} deg, slowest frame ${ms.toFixed(1)} ms`);
}
process.exit(bad ? 1 : 0);
