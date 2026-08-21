const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Platform detection
  isElectron: true,
  platform: process.platform,

  // Scale API - SHEKEL Beaver Protocol Support
  scale: {
    // List available serial ports
    listPorts: () => ipcRenderer.invoke('scale:list-ports'),

    // Connect to a serial port scale (RS232/USB)
    connectSerial: (config) => ipcRenderer.invoke('scale:connect-serial', config),

    // Connect to a TCP/WiFi scale
    connectTCP: (config) => ipcRenderer.invoke('scale:connect-tcp', config),

    // Disconnect from the current scale
    disconnect: () => ipcRenderer.invoke('scale:disconnect'),

    // Get current connection status
    getStatus: () => ipcRenderer.invoke('scale:status'),

    // Send a raw command to the scale
    sendCommand: (command) => ipcRenderer.invoke('scale:send-command', command),

    // Beaver Protocol Specific Commands:
    
    // Zero the scale (Z command - zeros when weight stabilizes, 3s timeout)
    zero: () => ipcRenderer.invoke('scale:zero'),

    // Set tare value (value in kg, e.g., 0.5 for 500g)
    setTare: (value) => ipcRenderer.invoke('scale:set-tare', value),

    // Clear tare (set tare to 0)
    clearTare: () => ipcRenderer.invoke('scale:clear-tare'),

    // Request firmware identifier
    getFirmwareId: () => ipcRenderer.invoke('scale:firmware-id'),

    // Set polling rate for weight updates (in milliseconds)
    setPollingRate: (rateMs) => ipcRenderer.invoke('scale:set-polling-rate', rateMs),

    // Subscribe to weight updates
    onWeight: (callback) => {
      const listener = (event, weight) => callback(weight);
      ipcRenderer.on('scale:weight', listener);
      // Return unsubscribe function
      return () => ipcRenderer.removeListener('scale:weight', listener);
    },

    // Subscribe to connection status changes
    onConnectionChange: (callback) => {
      const listener = (event, status) => callback(status);
      ipcRenderer.on('scale:connection-status', listener);
      return () => ipcRenderer.removeListener('scale:connection-status', listener);
    },

    // Subscribe to scale errors
    onError: (callback) => {
      const listener = (event, error) => callback(error);
      ipcRenderer.on('scale:error', listener);
      return () => ipcRenderer.removeListener('scale:error', listener);
    },

    // Listen for reconnect requests from menu
    onReconnectRequested: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('scale:reconnect-requested', listener);
      return () => ipcRenderer.removeListener('scale:reconnect-requested', listener);
    },

    // Listen for disconnect events from menu
    onDisconnected: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('scale:disconnected', listener);
      return () => ipcRenderer.removeListener('scale:disconnected', listener);
    },
  },

  printer: {
    getStatus: () => ipcRenderer.invoke('printer:status'),
    print: (payload) => ipcRenderer.invoke('printer:print', payload),
    onError: (callback) => {
      const listener = (event, error) => callback(error);
      ipcRenderer.on('printer:error', listener);
      return () => ipcRenderer.removeListener('printer:error', listener);
    },
  },

  // Auto-updater API
  updater: {
    // Check for updates
    checkForUpdates: () => ipcRenderer.invoke('update:check'),

    // Install downloaded update
    installUpdate: () => ipcRenderer.invoke('update:install'),

    // Subscribe to update status messages
    onStatus: (callback) => {
      const listener = (event, message) => callback(message);
      ipcRenderer.on('update:status', listener);
      return () => ipcRenderer.removeListener('update:status', listener);
    },

    // Subscribe to update downloaded event
    onUpdateDownloaded: (callback) => {
      const listener = (event, info) => callback(info);
      ipcRenderer.on('update:downloaded', listener);
      return () => ipcRenderer.removeListener('update:downloaded', listener);
    },
  },
});

// Log that preload script has been loaded
console.log('Electron preload script loaded');


