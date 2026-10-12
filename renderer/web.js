// browser stand-in for the electron bridge (preload.js). in the desktop app
// window.api already exists and this does nothing. the website build copies
// the renderer to /app/ and fills in the version below. the web version
// can't save or export, and phones get a note instead of the app.
(function () {
  if (window.api) return;
  var VERSION = '__BEANYIK_VERSION__';
  var SAMPLES = [
    ['samples/ur5.urdf', 'UR5 (URDF sample)'],
    ['samples/kuka_iiwa.urdf', 'KUKA iiwa (URDF sample)'],
    ['samples/franka_panda.urdf', 'Franka Panda (URDF sample)'],
    ['samples/xarm6.urdf', 'xArm6 (URDF sample)'],
    ['samples/kuka_lwr.urdf', 'KUKA LWR (URDF sample)'],
  ];
  // files you open are kept here so the recent list can reopen them
  var FILES_KEY = 'beanyik_web_files';

  document.documentElement.classList.add('web');
  var style = document.createElement('style');
  style.textContent = '.win-buttons, #btn-save, [data-menu="save"], [data-menu="saveas"], [data-menu="export-matlab"], '
    + '[data-menu="export-csv"], [data-act="export-matlab"], [data-act="export-csv"] { display: none !important; }'
    + '.web-phone { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; '
    + 'background: #f3f3f3; color: #1d1d1d; font: 16px/1.5 system-ui, sans-serif; text-align: center; }'
    + '.web-phone div { max-width: 340px; display: grid; gap: 14px; justify-items: center; }'
    + '.web-phone h1 { font-size: 20px; margin: 0; } .web-phone p { margin: 0; color: #555; }'
    + '.web-phone a { color: #fff; background: #1473e6; padding: 10px 20px; border-radius: 20px; text-decoration: none; }';
  document.head.appendChild(style);

  // the editor needs a mouse and a wide screen, phones get pointed to the desktop app
  var narrow = Math.min(screen.width, screen.height) < 600 || window.innerWidth < 700;
  if (narrow && window.matchMedia('(pointer: coarse)').matches) {
    var sk = /^sk|^cs/i.test(navigator.language || '');
    document.addEventListener('DOMContentLoaded', function () {
      var el = document.createElement('div');
      el.className = 'web-phone';
      el.innerHTML = '<div><img src="logo.png" alt="" width="64" height="64"><h1>'
        + (sk ? 'BeanyIK potrebuje počítač' : 'BeanyIK needs a computer')
        + '</h1><p>' + (sk ? 'Webovú verziu otvor na počítači alebo si stiahni aplikáciu pre Windows alebo macOS.'
          : 'Open the web version on a computer, or download the app for Windows or macOS.')
        + '</p><a href="../">' + (sk ? 'Späť na stránku' : 'Back to the website') + '</a></div>';
      document.body.appendChild(el);
    });
  }

  function readFiles() {
    try { return JSON.parse(localStorage.getItem(FILES_KEY) || '{}'); } catch (e) { return {}; }
  }
  function remember(name, content) {
    var files = readFiles();
    files[name] = content;
    try { localStorage.setItem(FILES_KEY, JSON.stringify(files)); } catch (e) { /* full, the file just won't reopen */ }
  }

  // samples go to the bottom of the recent list once
  try {
    var recent = JSON.parse(localStorage.getItem('beanyik_recent') || '[]');
    var have = {};
    recent.forEach(function (r) { have[r.filePath] = true; });
    var now = Date.now();
    SAMPLES.forEach(function (s, i) {
      if (!have[s[0]]) recent.push({ filePath: s[0], name: s[1], time: now - (i + 1) * 60000 });
    });
    localStorage.setItem('beanyik_recent', JSON.stringify(recent.slice(0, 12)));
  } catch (e) { /* no storage, the samples are still in the open dialog */ }

  function pick(accept) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.addEventListener('cancel', function () { resolve(null); });
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return resolve(null);
        f.text().then(function (content) {
          remember(f.name, content);
          resolve({ filePath: f.name, content: content });
        });
      };
      input.click();
    });
  }

  window.api = {
    platform: 'web',
    minimize: function () {},
    maximize: function () {},
    close: function () {},
    onWindowState: function () {},
    getAppVersion: function () { return Promise.resolve(VERSION.indexOf('__') === 0 ? 'web' : VERSION); },
    // the website always serves the newest version
    checkForUpdates: function () { return Promise.resolve({ status: 'up-to-date' }); },
    downloadUpdate: function () { return Promise.resolve({ ok: false, error: 'Not available in the browser' }); },
    installUpdate: function () { return Promise.resolve({ ok: false, error: 'Not available in the browser' }); },
    onUpdateProgress: function () {},
    setAutoUpdateCheck: function () {},
    onUpdateAvailable: function () {},
    openExternal: function (url) { if (/^https:\/\//i.test(url)) window.open(url, '_blank', 'noopener'); },

    openRobot: function (kind) { return pick(kind === 'urdf' ? '.urdf,.xml' : '.json,.urdf,.xml'); },
    readRobot: function (filePath) {
      var files = readFiles();
      if (files[filePath] !== undefined) return Promise.resolve({ filePath: filePath, content: files[filePath] });
      if (!/^samples\//.test(filePath)) return Promise.resolve({ error: 'open the file again, the browser no longer has it' });
      return fetch(filePath)
        .then(function (r) { if (!r.ok) throw new Error('sample not found'); return r.text(); })
        .then(function (content) { return { filePath: filePath, content: content }; }, function (e) { return { error: e.message }; });
    },
    // no saving or exporting in the browser, the buttons are hidden above
    saveRobot: function () { return Promise.resolve(null); },
    exportText: function () { return Promise.resolve(null); },
  };
})();
