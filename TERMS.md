# BeanyIK Terms of Use & Privacy

_Last updated: 10 October 2026_

[Slovenská verzia](TERMS.sk.md)

These terms apply to the BeanyIK desktop application ("the app") published by
GreenyBeany ("the author") at <https://github.com/greenythebeany/BeanyIK>.
By installing or using the app you agree to them.

## 1. Licence

BeanyIK is free and open-source software released under the [MIT License](LICENSE).
You may use, copy, modify and redistribute it under that licence. Third-party
components keep their own licences (see [CREDITS.md](CREDITS.md)).

## 2. Intended use: education and design aid

BeanyIK is a learning and prototyping tool for robot kinematics: building
kinematic chains, computing forward and inverse kinematics, Jacobians and
workspaces.

- Results are **numerical approximations**. Numerical IK may converge to a local
  solution, miss solutions, or fail near singularities; analytic solvers are only
  as correct as the equations entered into them.
- The app does **not** model dynamics, collisions, joint torques, cable routing,
  safety zones or any real controller behaviour.
- **Do not use BeanyIK as the sole basis for commanding real hardware.** Always
  verify joint values, limits and trajectories with your robot's own tools and
  appropriate safety measures before running anything on a physical machine.
- When you use the app for coursework, follow your institution's rules on tools
  and cite it where required.

## 3. Your content and custom code

- Robots you create (`.robot.json` files, parameters, notes) belong to you.
- The **Analytic IK solver** panel runs JavaScript **you** type in, locally,
  inside the app. Only paste code you understand and trust. Robot files from
  other people can contain solver code; review it before you press *Analytic* or
  *Test*.

## 4. Privacy

BeanyIK has no accounts, no analytics and no telemetry.

- Your robots, the open tabs, recent-file list and preferences (theme, language,
  last panel) are stored **only on your computer**: in the files you save, and in
  the app's local storage inside your user profile.
- The only network request the app makes on its own is an **update check**. On
  start-up it asks the public GitHub API
  (`api.github.com/repos/greenythebeany/BeanyIK/releases/latest`) whether a newer
  version exists. You can turn this off in the *About* dialog. If you accept an
  update, the installer is downloaded from the project's GitHub releases. These
  requests send the usual HTTP metadata (your IP address, a user-agent string) to
  GitHub and nothing about your robots. See
  [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- Links you click (GitHub, this document) open in your normal web browser.

## 5. No warranty

THE APP IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NON-INFRINGEMENT. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE AUTHOR IS NOT LIABLE
FOR ANY CLAIM, DAMAGE OR OTHER LIABILITY, INCLUDING DAMAGE TO EQUIPMENT, PROPERTY
OR PERSONS, ARISING FROM THE USE OF THE APP OR OF RESULTS PRODUCED WITH IT.

## 6. Unsigned builds

Windows builds are not code-signed, so Windows SmartScreen may warn on first launch
("Windows protected your PC"). Click *More info*, then *Run anyway*. Only download
BeanyIK from the official GitHub releases page linked above.

## 7. Changes

These terms may be updated with new releases; the version in the repository is
the current one. Continuing to use a newer version means you accept its terms.

## 8. Contact

Questions, bugs or requests: open an issue at
<https://github.com/greenythebeany/BeanyIK/issues>.
