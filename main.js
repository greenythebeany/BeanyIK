const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { checkForUpdates } = require('./update-checker');

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
    frame: false,
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
  mainWindow.setContentSize(1600, 940);
  mainWindow.show();
  await new Promise((r) => setTimeout(r, 1500));
  if (process.env.BEANYIK_SNAPSHOT_JS) {
    await mainWindow.webContents.executeJavaScript(fs.readFileSync(process.env.BEANYIK_SNAPSHOT_JS, 'utf8'));
    await new Promise((r) => setTimeout(r, 1500));
  }
  const img = await mainWindow.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  app.quit();
}

app.whenReady().then(() => {
  const rendererRoot = path.join(__dirname, 'renderer');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.normalize(path.join(rendererRoot, relative));
    if (!filePath.startsWith(rendererRoot)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  // default menu eats Ctrl+W / Ctrl+R, we use those ourselves
  Menu.setApplicationMenu(null);
  createWindow();

  // check github for a newer release, stay quiet otherwise
  setTimeout(() => {
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
ipcMain.on('shell:openExternal', (e, url) => {
  if (/^https:\/\//i.test(url)) shell.openExternal(url);
});

// files
const ROBOT_FILTERS = [{ name: 'BeanyIK robot', extensions: ['robot.json', 'json'] }];

// Documents\BeanyIK, so the dialogs don't open in some random folder
function robotsDir() {
  const dir = path.join(app.getPath('documents'), 'BeanyIK');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* whatever, windows picks */ }
  return dir;
}

ipcMain.handle('file:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { defaultPath: robotsDir(), properties: ['openFile'], filters: ROBOT_FILTERS });
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
