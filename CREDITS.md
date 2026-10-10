# Credits & third-party notices

BeanyIK is made by **GreenyBeany** ([@greenythebeany](https://github.com/greenythebeany)).

## Logo & artwork

- **App logo / icon**: concept and art direction by GreenyBeany; the image was
  generated with **Google Gemini** (AI image generation) and then cropped and
  exported to the icon sizes the app uses (`icon.png`, `build/icon.ico`,
  `renderer/logo.png`, `thumbnail.png`).
- **UI icons**: drawn for BeanyIK as inline SVG (`renderer/js/icons.js`), in the
  style of Adobe Spectrum outline icons. No icon set is redistributed.
- **Download button** (`download_icon.png`): made for this project.
- The layout is inspired by Adobe Acrobat's current interface (tab bar, *All tools*
  panel, quick-tools rail, right-hand panel rail). BeanyIK is not affiliated with
  or endorsed by Adobe.

## Fonts

BeanyIK does **not** bundle or redistribute any font files. It uses fonts that
are already installed with the operating system:

| Use | Font | Owner / licence |
| --- | --- | --- |
| Interface text | Segoe UI / Segoe UI Variable (falls back to the system UI font) | Microsoft, included with Windows |
| Mathematical notation (θᵢ, matrices, DH table) | Cambria Math (fallbacks: STIX Two Math, Latin Modern Math) | Microsoft, included with Windows |
| Code editor, numeric fields | Cascadia Code / Cascadia Mono (fallback: Consolas) | Microsoft, SIL Open Font License 1.1 |

The font stack also names "Adobe Clean". It is only used if you already have it
installed, and it is not included in the app.

## Software

| Component | Licence | Notes |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | MIT | Desktop runtime; bundles Chromium (BSD-3-Clause and others) and Node.js (MIT). Full notices ship with the app as `LICENSES.chromium.html`. |
| [three.js](https://threejs.org/) r170 | MIT | 3D viewport. Vendored in `renderer/vendor/three/` with its `LICENSE`. Includes `OrbitControls` and `TransformControls` from the three.js examples. |
| [electron-builder](https://www.electron.build/) | MIT | Build/packaging only (not shipped inside the app). |

## Kinematics references

The conventions follow the standard robotics literature:

- J. Denavit, R. S. Hartenberg, *A kinematic notation for lower-pair mechanisms
  based on matrices*, ASME J. Applied Mechanics, 1955: standard DH parameters.
- J. J. Craig, *Introduction to Robotics: Mechanics and Control*: modified (proximal) DH.
- B. Siciliano, L. Sciavicco, L. Villani, G. Oriolo, *Robotics: Modelling, Planning
  and Control*: anthropomorphic arm with spherical wrist, inverse kinematics.
- M. W. Spong, S. Hutchinson, M. Vidyasagar, *Robot Modeling and Control*: Euler
  angle wrist solution, Jacobian.
- C. W. Wampler, *Manipulator inverse kinematic solutions based on vector
  formulations and damped least-squares methods*, IEEE Trans. SMC, 1986: damped
  least squares IK.
- T. Yoshikawa, *Manipulability of robotic mechanisms*, IJRR, 1985: the
  manipulability measure.
