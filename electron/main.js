// Ứng dụng Windows: chạy máy chủ render bên trong app và mở giao diện trong cửa sổ riêng.
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.quit(); }

process.env.H2V_APP_VERSION = app.getVersion();
process.env.H2V_DATA = app.getPath('userData');
// Piper (giọng đọc offline) đóng gói kèm app
try {
  const pp = path.join(process.resourcesPath || '', 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
  if (app.isPackaged && require('fs').existsSync(pp)) process.env.PIPER_PATH = pp;
} catch (e) {}
let win = null, server = null;

function send(state) { if (win && !win.isDestroyed()) win.webContents.send('h2v-update', state); }

function setupUpdater() {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return null; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', i => send({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('download-progress', p => send({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', i => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', e => send({ state: 'error', message: String((e && e.message) || e) }));
  return autoUpdater;
}

async function createWindow() {
  server = require(path.join(__dirname, '..', 'server.js'));
  let port;
  try { port = await server.start(0, '127.0.0.1'); }
  catch (e) { dialog.showErrorBox('HTML Video Studio', 'Không khởi động được máy chủ render:\n' + e.message); app.quit(); return; }

  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#0e0f13', title: 'HTML → Video Studio', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  win.once('ready-to-show', () => win.show());
  const home = `http://127.0.0.1:${port}/`;
  win.loadURL(home);

  // Liên kết ngoài mở bằng trình duyệt mặc định, không mở trong app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(home)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });

  // Lưu video: hỏi nơi lưu, gợi ý thư mục Videos
  win.webContents.session.on('will-download', (e, item) => {
    const name = item.getFilename(), ext = (path.extname(name).slice(1) || '').toLowerCase();
    const kinds = { mp4: ['Video MP4', 'videos'], srt: ['Phụ đề SRT', 'documents'], txt: ['Văn bản', 'documents'], json: ['JSON', 'documents'], md: ['Markdown', 'documents'] };
    const k = kinds[ext] || ['Tệp', 'downloads'];
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath(k[1]), name), filters: ext ? [{ name: k[0], extensions: [ext] }] : [] });
  });
}

const updater = app.isPackaged ? setupUpdater() : null;
ipcMain.handle('h2v:version', () => app.getVersion());
ipcMain.handle('h2v:check', async () => {
  if (!updater) { send({ state: 'error', message: 'Chỉ bản cài đặt (.exe) mới tự cập nhật được.' }); return; }
  try { await updater.checkForUpdates(); } catch (e) { send({ state: 'error', message: e.message }); }
});
ipcMain.handle('h2v:install', () => { if (updater) setImmediate(() => updater.quitAndInstall(false, true)); });

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await createWindow();
  if (updater) {
    setTimeout(() => updater.checkForUpdates().catch(() => {}), 3000);
    setInterval(() => updater.checkForUpdates().catch(() => {}), 4 * 3600 * 1000);
  }
});
app.on('window-all-closed', async () => { try { if (server) await server.stop(); } catch (e) {} app.quit(); });
