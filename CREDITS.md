# Credits & third-party notices

BeanyIK is made by **GreenyBeany** ([@greenythebeany](https://github.com/greenythebeany)).

## Logo & artwork

- **App logo / icon**: concept and art direction by GreenyBeany; the image was
  generated with **Google Gemini** (AI image generation) and then cropped and
  exported to the icon sizes the app uses (`icon.png`, `build/icon.ico`,
  `renderer/logo.png`, `thumbnail.png`).
- **UI icons**: drawn for BeanyIK as inline SVG (`renderer/js/icons.js`), in the
  style of Adobe Spectrum outline icons. No icon set is redistributed.
- **Download button** (`download_icon.png`) and **installer artwork** (`build/installerSidebar.bmp`,
  `build/installerHeader.bmp`): made for this project from the logo.
- **Screenshots and demo animations** in `docs/` and on the website: captured from the app itself.
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
| [React](https://react.dev/) and [Vite](https://vitejs.dev/) | MIT | Website only (`website/`). |
| [shields.io](https://shields.io/) | CC0 | Badges in the README. |

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

## URDF samples (web version)

The web version lists five robots to try the URDF import with
(`website/app-samples/`). Only the kinematics are used, the meshes they point to
are not included. Each file keeps the license of the project it comes from:

| File | Source |
| --- | --- |
| `ur5.urdf` | Universal Robots UR5, generated from [ros-industrial/universal_robot](https://github.com/ros-industrial/universal_robot), via [urdf_files_dataset](https://github.com/Daniella1/urdf_files_dataset) |
| `kuka_iiwa.urdf` | KUKA LBR iiwa, from the [pybullet data](https://github.com/bulletphysics/bullet3/tree/master/data/kuka_iiwa) in bullet3 |
| `kuka_lwr.urdf` | KUKA LWR, from the [pybullet data](https://github.com/bulletphysics/bullet3/tree/master/data/kuka_lwr) in bullet3 |
| `franka_panda.urdf` | Franka Emika Panda, from the [pybullet data](https://github.com/bulletphysics/bullet3/tree/master/examples/pybullet/gym/pybullet_data/franka_panda) in bullet3 |
| `xarm6.urdf` | UFACTORY xArm6, from the [pybullet data](https://github.com/bulletphysics/bullet3/tree/master/examples/pybullet/gym/pybullet_data/xarm) in bullet3 |

### Robot photos on the website

The sample cards on the website show freely licensed photos from Wikimedia Commons, cropped to
800×600 and saved as WebP in `website/public/robots/`. The crops are adaptations under the same
license as the original.

| Website file | Robot | Author | License | Source |
| --- | --- | --- | --- | --- |
| `robots/kuka_iiwa.webp` | KUKA LBR iiwa (DLR stand at ILA 2014) | DLR German Aerospace Center | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | [Leichtbauroboter - Lightweight robots (14235555984).jpg](https://commons.wikimedia.org/wiki/File:Leichtbauroboter_-_Lightweight_robots_(14235555984).jpg) |
| `robots/franka_panda.webp` | Franka Emika Panda | Ims | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Franka_Emika1.jpg](https://commons.wikimedia.org/wiki/File:Franka_Emika1.jpg) |
| `robots/ur5.webp` | Universal Robots UR5 | GrowSkills Robotics | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Cobot.jpg](https://commons.wikimedia.org/wiki/File:Cobot.jpg) |

No freely licensed photo was found for the UFACTORY xArm 6 or the KUKA LWR 4 (checked Wikimedia
Commons and Openverse, which also covers CC licensed Flickr photos), so those cards link to a product page instead.
