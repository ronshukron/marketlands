const net = require('net');
const EventEmitter = require('events');

/**
 * ScaleService - Handles communication with weight scales via Serial, Bluetooth, or TCP/WiFi
 * 
 * Supported connection types:
 * 1. Serial (RS232/USB) - Using 'serialport' package
 * 2. TCP/WiFi - Using Node.js 'net' module
 * 3. Bluetooth - Can be added later using 'bluetooth-serial-port' package
 */
class ScaleService extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.connectionType = null;
    this.isConnected = false;
    this.buffer = '';
    this.weightCallback = null;
    this.connectionCallback = null;
    this.errorCallback = null;
    
    // Weight parsing configuration (adjust based on your scale)
    this.weightPattern = /[-+]?\d+\.?\d*/; // Default: extract numbers
  }

  /**
   * List available serial ports
   */
  async listPorts() {
    try {
      const { SerialPort } = require('serialport');
      const ports = await SerialPort.list();
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unknown',
        serialNumber: port.serialNumber || '',
        vendorId: port.vendorId || '',
        productId: port.productId || '',
      }));
    } catch (error) {
      console.error('Error listing serial ports:', error);
      return [];
    }
  }

  /**
   * Connect to a serial port scale (RS232/USB)
   * @param {string} portPath - The serial port path (e.g., 'COM3')
   * @param {object} options - Serial port options
   */
  async connectSerial(portPath, options = {}) {
    // Disconnect existing connection if any
    this.disconnect();

    const { SerialPort } = require('serialport');
    const { ReadlineParser } = require('@serialport/parser-readline');

    const serialOptions = {
      path: portPath,
      baudRate: options.baudRate || 9600,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || 'none',
      autoOpen: false,
    };

    return new Promise((resolve, reject) => {
      try {
        this.connection = new SerialPort(serialOptions);
        
        // Setup parser for line-based communication
        const parser = this.connection.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        // Handle incoming data
        parser.on('data', (data) => {
          this.handleData(data);
        });

        // Handle connection open
        this.connection.on('open', () => {
          this.isConnected = true;
          this.connectionType = 'serial';
          this.emitConnectionChange({ connected: true, type: 'serial', port: portPath });
          resolve();
        });

        // Handle errors
        this.connection.on('error', (error) => {
          console.error('Serial port error:', error);
          this.emitError({ type: 'serial', message: error.message });
          if (!this.isConnected) {
            reject(error);
          }
        });

        // Handle close
        this.connection.on('close', () => {
          this.isConnected = false;
          this.emitConnectionChange({ connected: false, type: 'serial' });
        });

        // Open the connection
        this.connection.open();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Connect to a TCP/WiFi scale
   * @param {string} host - The scale's IP address or hostname
   * @param {number} port - The port number
   */
  async connectTCP(host, port) {
    // Disconnect existing connection if any
    this.disconnect();

    return new Promise((resolve, reject) => {
      this.connection = new net.Socket();

      // Handle connection success
      this.connection.on('connect', () => {
        this.isConnected = true;
        this.connectionType = 'tcp';
        this.emitConnectionChange({ connected: true, type: 'tcp', host, port });
        resolve();
      });

      // Handle incoming data
      this.connection.on('data', (data) => {
        this.handleData(data.toString());
      });

      // Handle errors
      this.connection.on('error', (error) => {
        console.error('TCP connection error:', error);
        this.emitError({ type: 'tcp', message: error.message });
        if (!this.isConnected) {
          reject(error);
        }
      });

      // Handle close
      this.connection.on('close', () => {
        this.isConnected = false;
        this.emitConnectionChange({ connected: false, type: 'tcp' });
      });

      // Handle timeout
      this.connection.setTimeout(10000);
      this.connection.on('timeout', () => {
        this.emitError({ type: 'tcp', message: 'Connection timeout' });
        this.connection.destroy();
      });

      // Connect to the scale
      this.connection.connect(port, host);
    });
  }

  /**
   * Handle incoming data from scale
   * @param {string} data - Raw data from scale
   */
  handleData(data) {
    // Add data to buffer
    this.buffer += data;

    // Try to parse weight from buffer
    const weight = this.parseWeight(this.buffer);
    
    if (weight !== null) {
      this.emitWeight(weight);
      // Clear buffer after successful parse
      this.buffer = '';
    }

    // Prevent buffer overflow
    if (this.buffer.length > 1000) {
      this.buffer = this.buffer.slice(-500);
    }
  }

  /**
   * Parse weight value from scale data
   * Override this method for custom scale protocols
   * @param {string} data - Data string from scale
   * @returns {object|null} - Parsed weight object or null
   */
  parseWeight(data) {
    // Common scale output formats:
    // "ST,GS,  123.45 kg" - Stable, gross weight
    // "US,GS,  123.45 kg" - Unstable
    // "  123.45 kg"
    // "123.45"
    
    const lines = data.split(/[\r\n]+/).filter(line => line.trim());
    if (lines.length === 0) return null;

    const lastLine = lines[lines.length - 1].trim();
    
    // Try to extract weight value
    const match = lastLine.match(this.weightPattern);
    if (!match) return null;

    const value = parseFloat(match[0]);
    if (isNaN(value)) return null;

    // Detect unit (default to kg)
    let unit = 'kg';
    if (/lb/i.test(lastLine)) unit = 'lb';
    else if (/oz/i.test(lastLine)) unit = 'oz';
    else if (/g(?!r)/i.test(lastLine)) unit = 'g';

    // Detect stability
    const stable = /\bST\b/i.test(lastLine) || !/\bUS\b/i.test(lastLine);

    return {
      value,
      unit,
      stable,
      raw: lastLine,
      timestamp: Date.now(),
    };
  }

  /**
   * Send a command to the scale
   * @param {string} command - Command to send
   */
  async sendCommand(command) {
    if (!this.connection || !this.isConnected) {
      throw new Error('Not connected to scale');
    }

    return new Promise((resolve, reject) => {
      const data = command + '\r\n';
      
      if (this.connectionType === 'serial') {
        this.connection.write(data, (error) => {
          if (error) reject(error);
          else resolve();
        });
      } else if (this.connectionType === 'tcp') {
        this.connection.write(data, (error) => {
          if (error) reject(error);
          else resolve();
        });
      } else {
        reject(new Error('Unknown connection type'));
      }
    });
  }

  /**
   * Disconnect from the scale
   */
  disconnect() {
    if (this.connection) {
      if (this.connectionType === 'serial') {
        if (this.connection.isOpen) {
          this.connection.close();
        }
      } else if (this.connectionType === 'tcp') {
        this.connection.destroy();
      }
      this.connection = null;
    }
    this.isConnected = false;
    this.connectionType = null;
    this.buffer = '';
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      type: this.connectionType,
    };
  }

  /**
   * Register weight update callback
   * @param {function} callback - Function to call with weight updates
   */
  onWeight(callback) {
    this.weightCallback = callback;
  }

  /**
   * Register connection change callback
   * @param {function} callback - Function to call on connection changes
   */
  onConnectionChange(callback) {
    this.connectionCallback = callback;
  }

  /**
   * Register error callback
   * @param {function} callback - Function to call on errors
   */
  onError(callback) {
    this.errorCallback = callback;
  }

  // Internal emit methods
  emitWeight(weight) {
    if (this.weightCallback) {
      this.weightCallback(weight);
    }
    this.emit('weight', weight);
  }

  emitConnectionChange(status) {
    if (this.connectionCallback) {
      this.connectionCallback(status);
    }
    this.emit('connection', status);
  }

  emitError(error) {
    if (this.errorCallback) {
      this.errorCallback(error);
    }
    this.emit('error', error);
  }

  /**
   * Set custom weight parsing pattern
   * @param {RegExp} pattern - Regex pattern to extract weight value
   */
  setWeightPattern(pattern) {
    this.weightPattern = pattern;
  }
}

module.exports = ScaleService;


