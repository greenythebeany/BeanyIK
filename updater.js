// update checks + in-app download/install from github releases
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = 'greenythebeany/BeanyIK';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'BeanyIK-updater' };

function parseSemver(str) {
  const m = String(str || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function isNewer(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

// set by electron-builder's portable launcher
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;

// BEANYIK_PRETEND_VERSION lets you test the updater from a dev build
const currentVersion = () => process.env.BEANYIK_PRETEND_VERSION || app.getVersion();

let lastRelease = null;

async function checkForUpdates() {
  const res = await fetch(API_URL, { headers: HEADERS });
  if (res.status === 404) return { status: 'up-to-date', current: currentVersion() };
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
  const release = await res.json();

  const latest = parseSemver(release.tag_name) || parseSemver(release.name);
  const current = parseSemver(currentVersion());
  if (!latest || !current || !isNewer(latest, current)) return { status: 'up-to-date', current: currentVersion() };

  const assets = release.assets || [];
  // windows updates in place, anything else gets the download page
  const want = isPortable() ? /portable.*\.exe$/i : /setup.*\.exe$/i;
  const asset = process.platform === 'win32' ? assets.find((a) => want.test(a.name)) : null;
  const yml = assets.find((a) => a.name === 'latest.yml');
  lastRelease = { asset, yml, version: latest.join('.') };

  return {
    status: 'available',
    version: latest.join('.'),
    current: currentVersion(),
    url: release.html_url,
    notes: release.body || '',
    publishedAt: release.published_at,
    // only installs in place when packaged and there's a matching file to grab
    canInstall: app.isPackaged && !!asset,
    portable: isPortable(),
    size: asset?.size || 0,
  };
}

// sha512 for the installer from electron-builder's latest.yml, if published
async function expectedSha512(name) {
  if (!lastRelease?.yml) return null;
  try {
    const text = await (await fetch(lastRelease.yml.browser_download_url, { headers: { 'User-Agent': HEADERS['User-Agent'] } })).text();
    const block = text.split(/\n(?=\s*- url:)/).find((b) => b.includes(name));
    const m = /sha512:\s*(\S+)/.exec(block || text);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

let downloading = null;

async function downloadUpdate(onProgress) {
  if (!lastRelease?.asset) throw new Error('No update file found for this build');
  if (downloading) return downloading;
  const { asset } = lastRelease;
  downloading = (async () => {
    const dir = isPortable() ? process.env.PORTABLE_EXECUTABLE_DIR : path.join(app.getPath('temp'), 'BeanyIK-update');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, asset.name);
    const partial = `${target}.part`;

    const res = await fetch(asset.browser_download_url, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
    const total = Number(res.headers.get('content-length')) || asset.size || 0;
    const hash = crypto.createHash('sha512');
    const out = fs.createWriteStream(partial);
    let received = 0;
    let lastSent = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      hash.update(value);
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      const now = Date.now();
      if (now - lastSent > 100) { lastSent = now; onProgress?.({ received, total }); }
    }
    await new Promise((r, j) => out.end((err) => (err ? j(err) : r())));
    onProgress?.({ received, total });

    if (asset.size && received !== asset.size) {
      fs.rmSync(partial, { force: true });
      throw new Error('Downloaded file is incomplete');
    }
    const sha = await expectedSha512(asset.name);
    if (sha && hash.digest('base64') !== sha) {
      fs.rmSync(partial, { force: true });
      throw new Error('Downloaded file failed the checksum check');
    }
    fs.rmSync(target, { force: true });
    fs.renameSync(partial, target);
    return { file: target, verified: !!sha };
  })();
  try {
    return await downloading;
  } finally {
    downloading = null;
  }
}

// start the installer (or new portable exe) and get out of its way
function installAndQuit(file) {
  if (!file || !fs.existsSync(file)) throw new Error('Update file is missing');
  const child = spawn(file, [], { detached: true, stdio: 'ignore', cwd: path.dirname(file) });
  child.unref();
  setTimeout(() => app.quit(), 300);
}

module.exports = { checkForUpdates, downloadUpdate, installAndQuit, isPortable };
