// URDF import: the imported chain has to give the same FK as the URDF itself
import { urdfToRobot } from '../renderer/js/core/urdf.js';
import { prepare, fk } from '../renderer/js/core/robot.js';
import * as M from '../renderer/js/core/mat.js';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`); if (!cond) failures++; };

// tilted base, a skewed axis, a negative axis, fixed links in between,
// a continuous joint, a prismatic one and a two finger gripper at the end
const URDF = `<?xml version="1.0"?>
<!-- test arm -->
<robot name="test_arm" xmlns:xacro="http://www.ros.org/wiki/xacro">
  <link name="world"/><link name="base"/><link name="l1"/><link name="l2"/><link name="l3"/>
  <link name="l4"/><link name="l5"/><link name="hand"/><link name="f1"/><link name="f2"/>
  <joint name="mount" type="fixed"><parent link="world"/><child link="base"/>
    <origin xyz="0.1 0 0.05" rpy="0 0 0.5"/></joint>
  <joint name="j1" type="revolute"><parent link="base"/><child link="l1"/>
    <origin xyz="0 0 0.3" rpy="0 0 0"/><axis xyz="0 0 1"/><limit lower="-2.9" upper="2.9" effort="1" velocity="1"/></joint>
  <joint name="j2" type="revolute"><parent link="l1"/><child link="l2"/>
    <origin xyz="0 0.05 0.1" rpy="-1.5708 0 0"/><axis xyz="0 0 -1"/><limit lower="-1.7" upper="1.7"/></joint>
  <joint name="j3" type="continuous"><parent link="l2"/><child link="l3"/>
    <origin xyz="0.4 0 0" rpy="0.2 0.3 0.4"/><axis xyz="0.3 -0.5 0.8"/></joint>
  <joint name="spacer" type="fixed"><parent link="l3"/><child link="l4"/><origin xyz="0 0 0.2"/></joint>
  <joint name="j4" type="prismatic"><parent link="l4"/><child link="l5"/>
    <origin xyz="0.05 0 0" rpy="0 1.5708 0"/><axis xyz="1 0 0"/><limit lower="0" upper="0.2"/></joint>
  <joint name="flange" type="fixed"><parent link="l5"/><child link="hand"/><origin xyz="0 0 0.1"/></joint>
  <joint name="finger1" type="prismatic"><parent link="hand"/><child link="f1"/>
    <origin xyz="0 0.02 0.05"/><axis xyz="0 1 0"/><limit lower="0" upper="0.04"/></joint>
  <joint name="finger2" type="prismatic"><parent link="hand"/><child link="f2"/>
    <origin xyz="0 -0.02 0.05"/><axis xyz="0 -1 0"/><limit lower="0" upper="0.04"/><mimic joint="finger1"/></joint>
</robot>`;

// reference FK straight from the URDF numbers
function axisAngle(axis, t) {
  const n = Math.hypot(...axis), [x, y, z] = axis.map((v) => v / n);
  const c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  return [
    [c + x * x * C, x * y * C - z * s, x * z * C + y * s, 0],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s, 0],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C, 0],
    [0, 0, 0, 1],
  ];
}
const O = (x, y, z, r, p, yw) => M.fromXYZRPY(x, y, z, r, p, yw);
function refFK([q1, q2, q3, q4]) {
  let T = O(0.1, 0, 0.05, 0, 0, 0.5);
  T = M.mul(M.mul(T, O(0, 0, 0.3, 0, 0, 0)), axisAngle([0, 0, 1], q1));
  T = M.mul(M.mul(T, O(0, 0.05, 0.1, -1.5708, 0, 0)), axisAngle([0, 0, -1], q2));
  T = M.mul(M.mul(T, O(0.4, 0, 0, 0.2, 0.3, 0.4)), axisAngle([0.3, -0.5, 0.8], q3));
  T = M.mul(T, O(0, 0, 0.2, 0, 0, 0));
  T = M.mul(M.mul(T, O(0.05, 0, 0, 0, 1.5708, 0)), M.trans(q4, 0, 0));
  return M.mul(T, O(0, 0, 0.1, 0, 0, 0));
}

console.log('urdf');
const { robot, warnings, tip } = urdfToRobot(URDF);
const prep = prepare(robot);
check(Object.keys(prep.errors).length === 0, `compiles (${JSON.stringify(prep.errors)})`);
check(prep.dof === 4, `4 moving joints, gripper left out (dof ${prep.dof}, tip ${tip})`);
check(warnings.some((w) => /Gripper/.test(w)), 'warns about the gripper');
check(robot.joints[0].type === 'fixed' && robot.joints[0].name === 'world', 'mount offset becomes a fixed base part');
check(prep.limits[0][1] > 2.89 && prep.limits[0][1] < 2.91, 'revolute limits come over in radians internally');
check(prep.limits[2][0] === -Math.PI, 'continuous joint gets ±180°');

let worst = 0;
for (let trial = 0; trial < 50; trial++) {
  const q = prep.limits.map(([a, b]) => a + Math.random() * (b - a));
  const A = fk(prep, q).ee, B = refFK(q);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(A[r][c] - B[r][c]));
}
check(worst < 1e-6, `FK matches the URDF on 50 random poses (max error ${worst.toExponential(1)})`);

let threw = false;
try { urdfToRobot('<robot name="x"><xacro:macro name="m"/></robot>'); } catch { threw = true; }
check(threw, 'xacro files are refused');
threw = false;
try { urdfToRobot('{"joints": []}'); } catch { threw = true; }
check(threw, 'non-xml is refused');

if (failures) { console.log(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
