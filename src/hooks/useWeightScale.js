import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for interacting with weight scales in Electron
 * Provides a React-friendly interface to the scale hardware
 * 
 * Features:
 * - Automatic connection management
 * - Real-time weight updates
 * - Connection status tracking
 * - Error handling
 * - Graceful fallback when running in web browser
 */

// Check if running in Electron
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electron !== undefined;
};

/**
 * useWeightScale - React hook for scale integration
 * @param {object} options - Configuration options
 * @param {boolean} options.autoConnect - Whether to auto-connect on mount (default: false)
 * @param {object} options.connectionConfig - Default connection configuration
 * @returns {object} Scale state and control methods
 */
export function useWeightScale(options = {}) {
  const { autoConnect = false, connectionConfig = null } = options;

  // State
  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState(null);
  const [weight, setWeight] = useState(null);
  const [lastStableWeight, setLastStableWeight] = useState(null);
  const [error, setError] = useState(null);
  const [availablePorts, setAvailablePorts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for cleanup
  const unsubscribersRef = useRef([]);

  // Check if scale API is available
  const scaleAPI = isElectron() ? window.electron.scale : null;

  /**
   * List available serial ports
   */
  const listPorts = useCallback(async () => {
    if (!scaleAPI) {
      setError('Scale API not available - running in browser mode');
      return [];
    }

    try {
      setIsLoading(true);
      const result = await scaleAPI.listPorts();
      if (result.error) {
        setError(result.error);
        return [];
      }
      setAvailablePorts(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [scaleAPI]);

  /**
   * Connect to a serial port scale
   * @param {string} port - Serial port path (e.g., 'COM3')
   * @param {object} serialOptions - Serial port options
   */
  const connectSerial = useCallback(async (port, serialOptions = {}) => {
    if (!scaleAPI) {
      setError('Scale API not available - running in browser mode');
      return false;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await scaleAPI.connectSerial({
        port,
        baudRate: serialOptions.baudRate || 9600,
        dataBits: serialOptions.dataBits || 8,
        stopBits: serialOptions.stopBits || 1,
        parity: serialOptions.parity || 'none',
      });

      if (result.error) {
        setError(result.error);
        return false;
      }

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [scaleAPI]);

  /**
   * Connect to a TCP/WiFi scale
   * @param {string} host - Scale IP address or hostname
   * @param {number} port - Port number
   */
  const connectTCP = useCallback(async (host, port) => {
    if (!scaleAPI) {
      setError('Scale API not available - running in browser mode');
      return false;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await scaleAPI.connectTCP({ host, port });

      if (result.error) {
        setError(result.error);
        return false;
      }

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [scaleAPI]);

  /**
   * Disconnect from the scale
   */
  const disconnect = useCallback(async () => {
    if (!scaleAPI) return;

    try {
      await scaleAPI.disconnect();
      setWeight(null);
    } catch (err) {
      setError(err.message);
    }
  }, [scaleAPI]);

  /**
   * Send a command to the scale
   * @param {string} command - Command to send
   */
  const sendCommand = useCallback(async (command) => {
    if (!scaleAPI) {
      setError('Scale API not available');
      return false;
    }

    try {
      const result = await scaleAPI.sendCommand(command);
      if (result.error) {
        setError(result.error);
        return false;
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [scaleAPI]);

  /**
   * Zero the scale (Beaver Z command)
   * The scale will zero when weight stabilizes (up to 3 second timeout)
   */
  const zero = useCallback(async () => {
    if (!scaleAPI) {
      setError('Scale API not available');
      return false;
    }

    try {
      const result = await scaleAPI.zero();
      if (result.error) {
        setError(result.error);
        return false;
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [scaleAPI]);

  /**
   * Set tare value
   * @param {number} value - Tare value in kg (e.g., 0.5 for 500g)
   */
  const setTare = useCallback(async (value) => {
    if (!scaleAPI) {
      setError('Scale API not available');
      return false;
    }

    try {
      const result = await scaleAPI.setTare(value);
      if (result.error) {
        setError(result.error);
        return false;
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [scaleAPI]);

  /**
   * Clear tare (set tare to 0)
   */
  const clearTare = useCallback(async () => {
    if (!scaleAPI) {
      setError('Scale API not available');
      return false;
    }

    try {
      const result = await scaleAPI.clearTare();
      if (result.error) {
        setError(result.error);
        return false;
      }
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [scaleAPI]);

  /**
   * Legacy tare function (calls zero for backward compatibility)
   */
  const tare = useCallback(async () => {
    return zero();
  }, [zero]);

  /**
   * Clear current error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!scaleAPI) return;

    // Subscribe to weight updates
    const unsubWeight = scaleAPI.onWeight((weightData) => {
      setWeight(weightData);
      if (weightData.stable) {
        setLastStableWeight(weightData);
      }
    });
    unsubscribersRef.current.push(unsubWeight);

    // Subscribe to connection status changes
    const unsubConnection = scaleAPI.onConnectionChange((status) => {
      setIsConnected(status.connected);
      setConnectionType(status.connected ? status.type : null);
      if (!status.connected) {
        setWeight(null);
      }
    });
    unsubscribersRef.current.push(unsubConnection);

    // Subscribe to errors
    const unsubError = scaleAPI.onError((errorData) => {
      setError(errorData.message || 'Unknown error');
    });
    unsubscribersRef.current.push(unsubError);

    // Subscribe to menu reconnect requests
    const unsubReconnect = scaleAPI.onReconnectRequested(() => {
      // Trigger reconnect with stored config if available
      if (connectionConfig) {
        if (connectionConfig.type === 'serial') {
          connectSerial(connectionConfig.port, connectionConfig);
        } else if (connectionConfig.type === 'tcp') {
          connectTCP(connectionConfig.host, connectionConfig.port);
        }
      }
    });
    unsubscribersRef.current.push(unsubReconnect);

    // Subscribe to menu disconnect events
    const unsubDisconnect = scaleAPI.onDisconnected(() => {
      setIsConnected(false);
      setConnectionType(null);
      setWeight(null);
    });
    unsubscribersRef.current.push(unsubDisconnect);

    // Get initial status
    scaleAPI.getStatus().then((status) => {
      setIsConnected(status.connected);
      setConnectionType(status.type);
    });

    // Cleanup on unmount
    return () => {
      unsubscribersRef.current.forEach((unsub) => {
        if (typeof unsub === 'function') {
          unsub();
        }
      });
      unsubscribersRef.current = [];
    };
  }, [scaleAPI, connectionConfig, connectSerial, connectTCP]);

  // Auto-connect on mount if configured
  useEffect(() => {
    if (autoConnect && connectionConfig && scaleAPI) {
      if (connectionConfig.type === 'serial' && connectionConfig.port) {
        connectSerial(connectionConfig.port, connectionConfig);
      } else if (connectionConfig.type === 'tcp' && connectionConfig.host && connectionConfig.port) {
        connectTCP(connectionConfig.host, connectionConfig.port);
      }
    }
  }, [autoConnect, connectionConfig, scaleAPI, connectSerial, connectTCP]);

  return {
    // State
    isElectron: !!scaleAPI,
    isConnected,
    connectionType,
    weight,
    lastStableWeight,
    error,
    availablePorts,
    isLoading,

    // Methods
    listPorts,
    connectSerial,
    connectTCP,
    disconnect,
    sendCommand,
    
    // Beaver Protocol Commands
    zero,        // Zero the scale (Z command)
    setTare,     // Set tare value
    clearTare,   // Clear tare
    tare,        // Legacy tare (calls zero)
    
    clearError,
  };
}

/**
 * useAutoUpdater - React hook for Electron auto-updates
 * @returns {object} Update state and control methods
 */
export function useAutoUpdater() {
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  const updaterAPI = isElectron() ? window.electron.updater : null;

  // Subscribe to update events
  useEffect(() => {
    if (!updaterAPI) return;

    const unsubscribers = [];

    // Status updates
    const unsubStatus = updaterAPI.onStatus((message) => {
      setUpdateStatus(message);
      if (message.includes('available')) {
        setUpdateAvailable(true);
      }
    });
    unsubscribers.push(unsubStatus);

    // Update downloaded
    const unsubDownloaded = updaterAPI.onUpdateDownloaded((info) => {
      setUpdateDownloaded(true);
      setUpdateInfo(info);
    });
    unsubscribers.push(unsubDownloaded);

    return () => {
      unsubscribers.forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [updaterAPI]);

  const checkForUpdates = useCallback(async () => {
    if (!updaterAPI) return null;
    return updaterAPI.checkForUpdates();
  }, [updaterAPI]);

  const installUpdate = useCallback(() => {
    if (!updaterAPI) return;
    updaterAPI.installUpdate();
  }, [updaterAPI]);

  return {
    isElectron: !!updaterAPI,
    updateStatus,
    updateAvailable,
    updateDownloaded,
    updateInfo,
    checkForUpdates,
    installUpdate,
  };
}

export default useWeightScale;


