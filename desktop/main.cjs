const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
app.setName('嚼槟榔模拟器');
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'fullscreen' && wc.getURL().startsWith('file://')));
  const window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 760, minHeight: 650,
    title: '嚼槟榔模拟器', backgroundColor: '#f7f8f4',
    icon: path.join(__dirname, '../app/assets/icon.png'),
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.loadFile(path.join(__dirname, '../app/index.html'));
});
app.on('window-all-closed', () => app.quit());
