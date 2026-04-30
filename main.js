const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

const dev = !app.isPackaged;

app.whenReady().then(() => {
  if (dev) {
    // In dev mode, use Next.js programmatic API
    const next = require('next');
    const dir = app.getAppPath();
    const nextApp = next({ dev, dir });
    const handle = nextApp.getRequestHandler();

    nextApp.prepare().then(() => {
      const server = http.createServer((req, res) => handle(req, res));
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        createWindow(`http://127.0.0.1:${port}/tools/room-acoustics`);
      });
    });
  } else {
    // In production, spawn the standalone server
    const serverPath = path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js');
    const port = 3000; // Standalone server defaults to 3000, but we can set env
    serverProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: port.toString()
      }
    });

    // Wait a brief moment for the server to start, then create window
    setTimeout(() => {
      createWindow(`http://127.0.0.1:${port}/tools/room-acoustics`);
    }, 2000);
  }
});

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Neuracoust Room Simulator",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(url);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
