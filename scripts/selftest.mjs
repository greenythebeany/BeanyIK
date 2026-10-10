// quick sanity checks for the math (npm test)
import { evaluate } from '../renderer/js/core/expr.js';
import { prepare, fk, jacobian, manipulability, dhToElems } from '../renderer/js/core/robot.js';
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
    const nr = solveIK(prep, Td, prep.home, { mode: prep.dof < 6 ? 'position' : 'full', restarts: 12 });
    if (nr.ok) numericOk++;
  }
  check(analyticOk === analyticTotal, `analytic IK reaches ${analyticOk}/${analyticTotal} random poses`);
  // starts from home every time so the odd miss is fine
  check(numericOk >= 22, `numerical IK converges ${numericOk}/25`);
  const J = jacobian(prep, prep.home);
  check(J.length === 6 && J[0].length === prep.dof, `jacobian 6x${prep.dof}, w=${manipulability(J).w.toExponential(2)}`);
}

console.log('elementary transforms');
for (const preset of PRESETS) {
  for (const conv of ['standard', 'modified']) {
    const robot = preset.build();
    robot.convention = conv;
    const a = prepare(robot);
    const copy = JSON.parse(JSON.stringify(robot));
    copy.joints.forEach((j) => { if (j.mode === 'dh') { j.elems = dhToElems(j, conv === 'modified'); j.mode = 'elem'; } });
    const b = prepare(copy);
    let worst = 0;
    for (let k = 0; k < 20; k++) {
      const q = a.limits.map(([lo, hi]) => lo + Math.random() * (hi - lo));
      const A = fk(a, q).ee, B = fk(b, q).ee;
      for (let i = 0; i < 3; i++) for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(A[i][c] - B[i][c]));
    }
    check(worst < 1e-12 && !Object.keys(b.errors).length, `${preset.id} ${conv}: Rz·Tz·Tx·Rx matches DH (${worst.toExponential(1)})`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : '\nall good');
process.exit(failures ? 1 : 0);
