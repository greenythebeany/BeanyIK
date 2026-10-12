// copies the desktop app's renderer into the website as the web version
// (website/dist/app), with the URDF samples. run by the website build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'website', 'dist', 'app'));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'renderer'), out, { recursive: true, filter: (src) => !src.endsWith('package.json') });
fs.cpSync(path.join(root, 'website', 'app-samples'), path.join(out, 'samples'), { recursive: true, filter: (src) => !src.endsWith('.md') });

const web = path.join(out, 'web.js');
fs.writeFileSync(web, fs.readFileSync(web, 'utf8').replace('__BEANYIK_VERSION__', version));
console.log(`web version ${version} -> ${path.relative(root, out)}`);
