// Headless checks for the kinematics core: expression parser, FK sanity,
// numerical IK convergence, and every preset's analytic IK verified by FK.
import { evaluate } from '../renderer/js/core/expr.js';
import { prepare, fk, jacobian, manipulability } from '../renderer/js/core/robot.js';
import { solveIK, solveAnalytic } from '../renderer/js/core/ik.js';
import { PRESETS } from '../renderer/js/core/presets.js';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`); if (!cond) failures++; };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log('expr');
check(close(evaluate('2+3*4^2'), 50), 'precedence');
check(close(evaluate('-2^2'), -4), 'unary minus binds looser than ^');
check(close(evaluate('L1*cos(q)', { L1: 2, q: 0 }), 2), 'variables');
check(close(evaluate('atan2(1,1)'), Math.PI / 4), 'atan2');

for (const preset of PRESETS) {
  console.log(preset.title);
  const robot = preset.build();
  const prep = prepare(robot);
  check(Object.keys(prep.errors).length === 0, `compiles (${JSON.stringify(prep.errors)})`);

  let analyticOk = 0, analyticTotal = 0, numericOk = 0;
  for (let trial = 0; trial < 25; trial++) {
    const q = prep.limits.map(([a, b]) => a + (0.1 + 0.8 * Math.random()) * (b - a));
    const Td = fk(prep, q).ee;
    const ar = solveAnalytic(prep, Td, robot.analyticIK);
    if (ar.error) { check(false, `analytic error: ${ar.error}`); break; }
    analyticTotal++;
    if (ar.solutions.some((s) => s.ok)) analyticOk++;
    const nr = solveIK(prep, Td, prep.home, { mode: prep.dof < 6 ? 'position' : 'full' });
    if (nr.ok) numericOk++;
  }
  check(analyticOk === analyticTotal, `analytic IK reaches ${analyticOk}/${analyticTotal} random poses`);
  check(numericOk >= 23, `numerical IK converges ${numericOk}/25`);
  const J = jacobian(prep, prep.home);
  check(J.length === 6 && J[0].length === prep.dof, `jacobian 6x${prep.dof}, w=${manipulability(J).w.toExponential(2)}`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall good');
process.exit(failures ? 1 : 0);
