<p align="center">
  <img src="thumbnail.png" width="140" alt="BeanyIK icon">
</p>

<h1 align="center">BeanyIK</h1>

<p align="center">
  A drag &amp; drop robot kinematics builder for the desktop. Assemble a serial chain from joints,
  describe it with DH parameters or your own 4×4 matrices, and solve forward &amp; inverse kinematics live in 3D.
</p>

<p align="center">
  <a href="#showcase">Showcase</a> ·
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#writing-your-own-analytic-ik">Analytic IK</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a>
</p>

---

BeanyIK is GreenyBeany's tool for the robotics & cybernetics coursework: build the robot you're actually
working on (a 6-DOF arm, a robot dog leg, a SCARA…), check your DH table against a 3D model, drag a target
around and watch the IK solver move the arm, and compare your hand-derived closed-form solution against
the numerical one. The UI follows the layout of modern Adobe Acrobat: tab bar, an **All tools** panel,
a floating quick-tools rail beside the canvas, and an icon rail on the right that opens panels.

## Showcase

<p align="center">
  <img src="docs/screenshots/ik-light.png" alt="6-DOF arm with analytic IK branches" width="900">
</p>
<p align="center"><i>6-DOF arm with a spherical wrist: the target is set, and all 8 closed-form branches are checked with FK.</i></p>

<p align="center">
  <img src="docs/screenshots/matrices-dark.png" alt="Quadruped leg, Jacobian and workspace, dark theme" width="900">
</p>
<p align="center"><i>Quadruped leg in the dark theme, showing the Jacobian, manipulability and a sampled workspace cloud.</i></p>

<p align="center">
  <img src="docs/screenshots/slovak.png" alt="SCARA with joint sliders, Slovak UI" width="900">
</p>
<p align="center"><i>SCARA with joint sliders, in the Slovak UI.</i></p>

## Features

- **Drag & drop chain builder.** Drag *Revolute*, *Prismatic*, *Fixed link* or *Matrix joint* parts from
  **All tools** into the chain (anywhere, or onto the 3D view to append). Drag the grip to reorder; click to edit.
- **Standard (distal) or modified (Craig) DH**: θ, d, a, α per joint, joint limits and home pose.
- **Custom matrix joints.** Type the 4×4 transform Aᵢ directly with expressions in `q`
  (e.g. `cos(q)`, `L1*sin(q)`). Useful when your course gives you the matrices rather than a DH table.
  The app checks that the rotation block is orthonormal.
- **Parameters.** Name your link lengths (`L1 = 0.3`, `L3 = L1 + L2`) and use them in every field.
  Fields accept `+ - * / ^`, `pi`, `sin`, `atan2`, `sqrt`, `deg()`/`rad()`…
- **Forward kinematics**: joint sliders, per-link Aᵢ, ⁰Tₙ, and an end-effector pose HUD.
- **Numerical IK**: damped least squares (Levenberg–Marquardt) on the Jacobian, with joint
  limits and random restarts. Choose position + orientation or position only. Drag the
  green target (W move / E rotate) and the robot follows live.
- **Analytic IK.** Write your closed-form solution in the built-in editor. Every branch you return is
  verified with FK and flagged *reaches* or *outside limits*. Each template ships with a worked example.
- **Jacobian & singularities**: geometric Jacobian, manipulability, smallest singular value, det J, and a
  near-singularity warning.
- **Workspace cloud**: samples random configurations within the joint limits.
- **Export**: symbolic FK + Jacobian as a MATLAB `.m` script (Symbolic Math Toolbox), DH table as CSV or
  LaTeX, and any matrix as MATLAB.
- **English & Slovak UI.** Switch with the 🌐 EN/SK button in the top bar (Slovenčina is picked automatically on a Slovak system).
- Robots save as readable `.robot.json`. Also included: undo/redo, recent files, autosave and light/dark themes.

### Templates

| Template | Joints | Analytic IK included |
| --- | --- | --- |
| 6-DOF arm | anthropomorphic arm + spherical wrist | 8 branches (shoulder × elbow × wrist flip) |
| Quadruped leg | hip abduction, hip flexion, knee | 4 branches |
| Planar 2R | two revolute links | elbow up / down |
| SCARA | R R P R | elbow left / right |

## Getting started

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/Greenythebeany/BeanyIK.git
cd BeanyIK
npm install
npm start
```

Other scripts:

```bash
npm test        # headless kinematics self-test (FK, numerical IK, every template's analytic IK)
npm run dist    # build a Windows installer + portable exe into dist/
npm run vendor  # re-copy three.js from node_modules into renderer/vendor
```

## Units & conventions

- Lengths are in **metres**. In the editor, DH angles (θ, α), revolute limits/home and base/tool RPY are in **degrees**.
- Inside custom-matrix expressions and analytic solvers, `q` is in **radians** (revolute) or **metres** (prismatic).
- Standard DH: `Aᵢ = Rz(θ) Tz(d) Tx(a) Rx(α)`. Modified DH: `Aᵢ = Rx(αᵢ₋₁) Tx(aᵢ₋₁) Rz(θ) Tz(d)`.
- ⁰T_ee = T_base · A₁ ⋯ Aₙ · T_tool, with RPY as `Rz(yaw)·Ry(pitch)·Rx(roll)`. The world is Z-up.

## Writing your own analytic IK

Open **Analytic IK solver** (`</>` in the right rail). Your code is the body of a function:

```js
// T: target flange pose (4x4) in the chain's base frame — base and tool already removed
// P: your parameters (P.L1, ...)
// h: helpers — atan2, sqrt, acos, hypot, wrap, mul, transpose, rotation, fk(qPartial), ...
const { L1, L2 } = P;
const x = T[0][3], y = T[1][3];
const c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
if (Math.abs(c2) > 1) return [];
return [1, -1].map((s) => {
  const q2 = s * h.acos(c2);
  const q1 = h.atan2(y, x) - h.atan2(L2 * h.sin(q2), L1 + L2 * h.cos(q2));
  return [q1, q2];
});
```

Hit **Test on current pose**, or use **Analytic** in the IK panel to solve for the target and click a branch to apply it.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` | New / open / save / save as |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Q` / `W` / `E` | Select / move IK target / rotate IK target |
| `F` | Toggle coordinate frames |
| `H` | Home pose |
| `Delete` | Delete the selected joint |
| `Esc` | Clear selection |

## Built with

Electron, [three.js](https://threejs.org) (vendored), and no other runtime dependencies. UI strings live in
`renderer/js/i18n.js`: English text is the key, so adding a language means adding one dictionary. The kinematics core
(`renderer/js/core`) is plain ES modules with no DOM access, so it runs under Node for the self-test.

## License

MIT
