const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { checkForUpdates, downloadUpdate, installAndQuit } = require('./updater');

let autoUpdateCheck = true; // renderer turns this off if the user disabled it

// app:// instead of file:// so ES modules + the import map work
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 640,
    // mac keeps its traffic lights, windows/linux get our own buttons
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 16 } }
      : { frame: false }),
    show: false,
    backgroundColor: '#f3f3f3',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL('app://bundle/index.html');
  mainWindow.once('ready-to-show', () => {
    if (process.env.BEANYIK_SNAPSHOT) return snapshotAndQuit(process.env.BEANYIK_SNAPSHOT);
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:state', 'maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:state', 'normal'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// screenshots for the readme: BEANYIK_SNAPSHOT=out.png BEANYIK_SNAPSHOT_JS=setup.js npm start
async function snapshotAndQuit(out) {
  const env = process.env;
  mainWindow.setContentSize(Number(env.BEANYIK_W) || 1600, Number(env.BEANYIK_H) || 940);
  mainWindow.show();
  await new Promise((r) => setTimeout(r, 1500));
  if (env.BEANYIK_SNAPSHOT_JS) {
    await mainWindow.webContents.executeJavaScript(fs.readFileSync(env.BEANYIK_SNAPSHOT_JS, 'utf8'));
    await new Promise((r) => setTimeout(r, Number(env.BEANYIK_WAIT) || 1500));
  }
  // BEANYIK_FRAMES=n captures n frames (out-001.png ...) for animations
  const frames = Number(env.BEANYIK_FRAMES) || 1;
  for (let i = 0; i < frames; i++) {
    const t0 = Date.now();
    const img = await mainWindow.webContents.capturePage();
    const file = frames > 1 ? out.replace(/\.png$/, `-${String(i + 1).padStart(3, '0')}.png`) : out;
    fs.writeFileSync(file, img.toPNG());
    const left = (Number(env.BEANYIK_FRAME_MS) || 80) - (Date.now() - t0);
    if (left > 0) await new Promise((r) => setTimeout(r, left));
  }
  app.quit();
}

// clean profile for screenshots
if (process.env.BEANYIK_PROFILE) app.setPath('userData', process.env.BEANYIK_PROFILE);

app.whenReady().then(() => {
  const rendererRoot = path.join(__dirname, 'renderer');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.normalize(path.join(rendererRoot, relative));
    if (!filePath.startsWith(rendererRoot)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // default menu eats Ctrl+W / Ctrl+R, we use those ourselves. mac needs a
  // menu for Cmd+Q, copy/paste etc, so it gets a minimal one there
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();

  // check github for a newer release, stay quiet otherwise
  setTimeout(() => {
    if (!autoUpdateCheck || process.env.BEANYIK_SNAPSHOT) return;
    checkForUpdates()
      .then((result) => {
        if (result.status === 'available' && mainWindow) mainWindow.webContents.send('update:available', result);
      })
      .catch(() => {});
  }, 4000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// window controls
ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('update:check', async () => {
  try {
    return await checkForUpdates();
  } catch (e) {
    return { status: 'error', error: e.message };
  }
});
ipcMain.handle('update:download', async (e) => {
  try {
    const res = await downloadUpdate((p) => {
      if (!e.sender.isDestroyed()) e.sender.send('update:progress', p);
      if (mainWindow && p.total) mainWindow.setProgressBar(p.received / p.total);
    });
    if (mainWindow) mainWindow.setProgressBar(-1);
    return { ok: true, ...res };
  } catch (err) {
    if (mainWindow) mainWindow.setProgressBar(-1);
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('update:install', (e, file) => {
  try {
    installAndQuit(file);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
ipcMain.on('update:setAutoCheck', (e, on) => { autoUpdateCheck = on !== false; });
ipcMain.on('shell:openExternal', (e, url) => {
  if (/^https:\/\//i.test(url)) shell.openExternal(url);
});

// files
const ROBOT_FILTERS = [{ name: 'BeanyIK robot', extensions: ['robot.json', 'json'] }];
const URDF_FILTERS = [{ name: 'URDF', extensions: ['urdf', 'xml'] }];
const OPEN_FILTERS = [{ name: 'Robot files', extensions: ['json', 'urdf', 'xml'] }, ...ROBOT_FILTERS, ...URDF_FILTERS];

// Documents\BeanyIK, so the dialogs don't open in some random folder
function robotsDir() {
  const dir = path.join(app.getPath('documents'), 'BeanyIK');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* whatever, windows picks */ }
  return dir;
}

ipcMain.handle('file:open', async (e, kind) => {
  const filters = kind === 'urdf' ? URDF_FILTERS : OPEN_FILTERS;
  const res = await dialog.showOpenDialog(mainWindow, { defaultPath: robotsDir(), properties: ['openFile'], filters });
  if (res.canceled || !res.filePaths[0]) return null;
  const filePath = res.filePaths[0];
  return { filePath, content: fs.readFileSync(filePath, 'utf8') };
});

ipcMain.handle('file:read', async (e, filePath) => {
  try {
    return { filePath, content: fs.readFileSync(filePath, 'utf8') };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('file:save', async (e, { content, filePath, suggestedName, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const res = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(robotsDir(), suggestedName || 'robot.robot.json'),
      filters: ROBOT_FILTERS,
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  fs.writeFileSync(target, content, 'utf8');
  return { filePath: target };
});

ipcMain.handle('file:export', async (e, { content, suggestedName, filters }) => {
  const res = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(robotsDir(), suggestedName || 'export'), filters });
  if (res.canceled || !res.filePath) return null;
  fs.writeFileSync(res.filePath, content, 'utf8');
  return { filePath: res.filePath };
});
