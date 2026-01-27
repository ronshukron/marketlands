const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const ScaleService = require('./services/scaleService');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;
let scaleService = null;

// Determine if we're in development mode
const isDev = !app.isPackaged;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../build/favicon.ico'),
    show: false, // Don't show until ready
  });

  // Load the app
  if (isDev) {
    // In development, load from React dev server
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  // Show window when ready to avoid visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (scaleService) {
      scaleService.disconnect();
    }
  });

  // Setup application menu
  setupMenu();

  // Initialize auto-updater (production only)
  if (!isDev) {
    initAutoUpdater();
  }
}

// Helper function to navigate to a route
function navigateTo(route) {
  if (mainWindow) {
    if (isDev) {
      mainWindow.loadURL(`http://localhost:3000${route}`);
    } else {
      // For production, we need to handle client-side routing
      mainWindow.webContents.executeJavaScript(`window.location.hash = ''; window.history.pushState({}, '', '${route}'); window.dispatchEvent(new PopStateEvent('popstate'));`);
    }
  }
}

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Home',
          accelerator: 'CmdOrCtrl+H',
          click: () => navigateTo('/')
        },
        { type: 'separator' },
        {
          label: 'Admin Panel',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => navigateTo('/admin')
        },
        {
          label: 'Delivery V5 (Weighing)',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => navigateTo('/admin/delivery-v5')
        },
        {
          label: 'Delivery V4',
          click: () => navigateTo('/admin/delivery-v4')
        },
        {
          label: 'Delivery V3',
          click: () => navigateTo('/admin/delivery-v3')
        },
        {
          label: 'Weekly Summary',
          click: () => navigateTo('/admin/weekly-summary')
        },
        {
          label: 'Weekly Summary V2',
          click: () => navigateTo('/admin/weekly-summary-v2')
        },
        {
          label: 'Refunds',
          click: () => navigateTo('/admin/refunds')
        },
        {
          label: 'Deliveries',
          click: () => navigateTo('/admin/deliveries')
        },
        {
          label: 'Analytics',
          click: () => navigateTo('/admin/analytics')
        },
        {
          label: 'Customer Insights',
          click: () => navigateTo('/admin/customers')
        },
        {
          label: 'Abandoned Carts',
          click: () => navigateTo('/admin/abandoned-carts')
        },
        {
          label: 'Independent Orders',
          click: () => navigateTo('/admin/independent-orders')
        },
        { type: 'separator' },
        {
          label: 'Dashboard',
          click: () => navigateTo('/dashboard')
        },
        {
          label: 'My Orders',
          click: () => navigateTo('/my-orders')
        },
        {
          label: 'Ongoing Orders',
          click: () => navigateTo('/ongoing-orders')
        },
        { type: 'separator' },
        {
          label: 'Business Dashboard',
          click: () => navigateTo('/Business-DashBoard')
        },
        {
          label: 'Business Products',
          click: () => navigateTo('/Business-Products')
        },
        {
          label: 'Independent Orders Dashboard',
          click: () => navigateTo('/independent-orders')
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Scale',
      submenu: [
        {
          label: 'Reconnect Scale',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('scale:reconnect-requested');
            }
          }
        },
        {
          label: 'Disconnect Scale',
          click: () => {
            if (scaleService) {
              scaleService.disconnect();
              if (mainWindow) {
                mainWindow.webContents.send('scale:disconnected');
              }
            }
          }
        }
      ]
    }
  ];

  // Add DevTools in development
  if (isDev) {
    template.push({
      label: 'Developer',
      submenu: [
        { role: 'toggleDevTools' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('Update available. Downloading...');
  });

  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('App is up to date.');
  });

  autoUpdater.on('error', (err) => {
    sendStatusToWindow('Error in auto-updater: ' + err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let message = `Download speed: ${progressObj.bytesPerSecond}`;
    message += ` - Downloaded ${progressObj.percent}%`;
    sendStatusToWindow(message);
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('Update downloaded. Will install on restart.');
    if (mainWindow) {
      mainWindow.webContents.send('update:downloaded', info);
    }
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
}

function sendStatusToWindow(text) {
  if (mainWindow) {
    mainWindow.webContents.send('update:status', text);
  }
}

// Initialize scale service and setup IPC handlers
function setupScaleIPC() {
  scaleService = new ScaleService();

  // List available serial ports
  ipcMain.handle('scale:list-ports', async () => {
    try {
      return await scaleService.listPorts();
    } catch (error) {
      console.error('Error listing ports:', error);
      return { error: error.message };
    }
  });

  // Connect to serial port scale
  ipcMain.handle('scale:connect-serial', async (event, { port, baudRate = 9600, dataBits = 8, stopBits = 1, parity = 'none' }) => {
    try {
      await scaleService.connectSerial(port, { baudRate, dataBits, stopBits, parity });
      return { success: true };
    } catch (error) {
      console.error('Serial connection error:', error);
      return { error: error.message };
    }
  });

  // Connect to TCP/WiFi scale
  ipcMain.handle('scale:connect-tcp', async (event, { host, port }) => {
    try {
      await scaleService.connectTCP(host, port);
      return { success: true };
    } catch (error) {
      console.error('TCP connection error:', error);
      return { error: error.message };
    }
  });

  // Disconnect scale
  ipcMain.handle('scale:disconnect', async () => {
    try {
      scaleService.disconnect();
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Get current connection status
  ipcMain.handle('scale:status', () => {
    return scaleService.getStatus();
  });

  // Send command to scale
  ipcMain.handle('scale:send-command', async (event, command) => {
    try {
      await scaleService.sendCommand(command);
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Zero the scale (Beaver Z command)
  ipcMain.handle('scale:zero', async () => {
    try {
      await scaleService.zeroScale();
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Set tare value
  ipcMain.handle('scale:set-tare', async (event, value) => {
    try {
      await scaleService.setTare(value);
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Clear tare
  ipcMain.handle('scale:clear-tare', async () => {
    try {
      await scaleService.clearTare();
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Request firmware identifier
  ipcMain.handle('scale:firmware-id', async () => {
    try {
      await scaleService.requestFirmwareId();
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Set polling rate
  ipcMain.handle('scale:set-polling-rate', async (event, rateMs) => {
    try {
      scaleService.setPollingRate(rateMs);
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Subscribe to weight updates
  scaleService.onWeight((weight) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scale:weight', weight);
    }
  });

  // Subscribe to connection events
  scaleService.onConnectionChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scale:connection-status', status);
    }
  });

  // Subscribe to errors
  scaleService.onError((error) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('scale:error', error);
    }
  });
}

// App lifecycle events
app.whenReady().then(() => {
  setupScaleIPC();
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On Windows, quit the app when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Cleanup scale connection before quitting
  if (scaleService) {
    scaleService.disconnect();
  }
});

// Handle IPC for auto-updater
ipcMain.handle('update:check', async () => {
  if (!isDev) {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, result };
    } catch (error) {
      return { error: error.message };
    }
  }
  return { message: 'Updates disabled in development mode' };
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
});

