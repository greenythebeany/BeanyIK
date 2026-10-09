// Copies the three.js files the renderer needs into renderer/vendor so the
// app runs (and packages) without touching node_modules at runtime.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'renderer', 'vendor', 'three');
fs.mkdirSync(path.join(out, 'controls'), { recursive: true });

const copies = [
  ['node_modules/three/build/three.module.js', 'three.module.js'],
  ['node_modules/three/examples/jsm/controls/OrbitControls.js', 'controls/OrbitControls.js'],
  ['node_modules/three/examples/jsm/controls/TransformControls.js', 'controls/TransformControls.js'],
  ['node_modules/three/LICENSE', 'LICENSE'],
];
for (const [from, to] of copies) {
  fs.copyFileSync(path.join(root, from), path.join(out, to));
  console.log(`vendored ${to}`);
}
