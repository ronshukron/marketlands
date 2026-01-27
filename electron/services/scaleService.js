const net = require('net');
const EventEmitter = require('events');

/**
 * ScaleService - Handles communication with weight scales via Serial, Bluetooth, or TCP/WiFi
 * 
 * Supported connection types:
 * 1. Serial (RS232/USB) - Using 'serialport' package
 * 2. TCP/WiFi - Using Node.js 'net' module
 * 3. Bluetooth - Can be added later using 'bluetooth-serial-port' package
 * 
 * Supports SHEKEL Beaver Protocol (Basic, Advanced 1, Advanced 2)
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
    
    // Protocol mode: 'beaver-basic', 'beaver-advanced1', 'beaver-advanced2', 'generic'
    this.protocolMode = 'beaver-advanced1'; // Default to Advanced 1 (most common)
    
    // Polling interval for continuous weight reading
    this.pollingInterval = null;
    this.pollingRate = 200; // ms between weight requests
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
    const { DelimiterParser } = require('@serialport/parser-delimiter');

    // SHEKEL Beaver default: 9600 baud, 8 data bits, 1 stop bit, no parity
    const serialOptions = {
      path: portPath,
      baudRate: options.baudRate || 9600,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || 'none',
      autoOpen: false,
    };

    // Set protocol mode if specified
    if (options.protocol) {
      this.protocolMode = options.protocol;
    }

    return new Promise((resolve, reject) => {
      try {
        this.connection = new SerialPort(serialOptions);
        
        // Setup parser - Beaver protocol uses CR (\r) as start and LF (\n) as end
        // We'll parse on LF and handle CR in the data
        const parser = this.connection.pipe(new DelimiterParser({ delimiter: '\n' }));

        // Handle incoming data
        parser.on('data', (data) => {
          // Convert buffer to string and remove CR if present
          const dataStr = data.toString().replace(/\r/g, '').trim();
          if (dataStr) {
            this.handleData(dataStr);
          }
        });

        // Handle connection open
        this.connection.on('open', () => {
          this.isConnected = true;
          this.connectionType = 'serial';
          this.emitConnectionChange({ connected: true, type: 'serial', port: portPath });
          
          // Start polling for weight data
          this.startPolling();
          
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
          this.stopPolling();
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
   * @param {object} options - Connection options
   */
  async connectTCP(host, port, options = {}) {
    // Disconnect existing connection if any
    this.disconnect();

    // Set protocol mode if specified
    if (options.protocol) {
      this.protocolMode = options.protocol;
    }

    return new Promise((resolve, reject) => {
      this.connection = new net.Socket();
      this.tcpBuffer = '';

      // Handle connection success
      this.connection.on('connect', () => {
        this.isConnected = true;
        this.connectionType = 'tcp';
        this.emitConnectionChange({ connected: true, type: 'tcp', host, port });
        
        // Start polling for weight data
        this.startPolling();
        
        resolve();
      });

      // Handle incoming data
      this.connection.on('data', (data) => {
        this.tcpBuffer += data.toString();
        
        // Process complete messages (ending with LF)
        const messages = this.tcpBuffer.split('\n');
        this.tcpBuffer = messages.pop(); // Keep incomplete message in buffer
        
        messages.forEach(msg => {
          const cleanMsg = msg.replace(/\r/g, '').trim();
          if (cleanMsg) {
            this.handleData(cleanMsg);
          }
        });
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
        this.stopPolling();
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
   * Start polling for weight updates
   */
  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    // Request weight immediately
    this.requestWeight();
    
    // Then poll at regular intervals
    this.pollingInterval = setInterval(() => {
      this.requestWeight();
    }, this.pollingRate);
  }

  /**
   * Stop polling for weight updates
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Request current weight from scale (Beaver W command)
   */
  requestWeight() {
    if (this.isConnected && this.connection) {
      try {
        // Beaver protocol: Send 'W' to request weight
        const command = 'W';
        if (this.connectionType === 'serial' && this.connection.isOpen) {
          this.connection.write(command + '\r\n');
        } else if (this.connectionType === 'tcp') {
          this.connection.write(command + '\r\n');
        }
      } catch (error) {
        console.error('Error requesting weight:', error);
      }
    }
  }

  /**
   * Handle incoming data from scale
   * @param {string} data - Raw data from scale (without CR/LF)
   */
  handleData(data) {
    console.log('Scale data received:', data, '| Hex:', Buffer.from(data).toString('hex'));
    
    // Parse based on protocol mode
    const weight = this.parseBeaverProtocol(data);
    
    if (weight !== null) {
      this.emitWeight(weight);
    }
  }

  /**
   * Parse SHEKEL Beaver protocol response
   * @param {string} data - Data string from scale
   * @returns {object|null} - Parsed weight object or null
   */
  parseBeaverProtocol(data) {
    if (!data || data.length < 1) return null;

    // Check for special responses
    if (data === 'H') {
      // Overweight
      return {
        value: null,
        unit: 'kg',
        stable: true,
        status: 'overweight',
        raw: data,
        timestamp: Date.now(),
      };
    }
    
    if (data === 'L') {
      // Underweight/Negative
      return {
        value: null,
        unit: 'kg',
        stable: true,
        status: 'underweight',
        raw: data,
        timestamp: Date.now(),
      };
    }

    if (data === 'F') {
      // Command failed
      this.emitError({ type: 'command', message: 'Command failed' });
      return null;
    }

    // Advanced protocol format: Status + Weight + optional checksum
    // Status letters: W (stable new), R (repeated), U (unstable), E (zero), L (negative), H (overweight)
    const advancedMatch = data.match(/^([WRUEH])\s*([-]?\d+\.?\d*)\s*(\d)?$/);
    if (advancedMatch) {
      const status = advancedMatch[1];
      const value = parseFloat(advancedMatch[2]);
      
      if (isNaN(value)) return null;

      let stable = false;
      let statusText = 'unknown';
      
      switch (status) {
        case 'W': // New stable weight
          stable = true;
          statusText = 'stable';
          break;
        case 'R': // Repeated weight (stable, no change)
          stable = true;
          statusText = 'repeated';
          break;
        case 'U': // Unstable
          stable = false;
          statusText = 'unstable';
          break;
        case 'E': // Zero
          stable = true;
          statusText = 'zero';
          break;
        case 'H': // Overweight
          stable = true;
          statusText = 'overweight';
          break;
      }

      return {
        value,
        unit: 'kg', // Beaver scales typically use kg
        stable,
        status: statusText,
        raw: data,
        timestamp: Date.now(),
      };
    }

    // Basic protocol format: Just the weight value (6 digits with decimal)
    // Example: "12.345" or " 12.345" (may have leading spaces)
    const basicMatch = data.match(/^\s*([-]?\d+\.?\d*)\s*(\d)?$/);
    if (basicMatch) {
      const value = parseFloat(basicMatch[1]);
      
      if (isNaN(value)) return null;

      return {
        value,
        unit: 'kg',
        stable: true, // Basic protocol only sends on stability
        status: 'stable',
        raw: data,
        timestamp: Date.now(),
      };
    }

    // Zero command response: "Z" followed by optional weight
    const zeroMatch = data.match(/^Z\s*([-]?\d+\.?\d*)?/);
    if (zeroMatch) {
      console.log('Zero command acknowledged');
      return null; // Don't emit as weight, just acknowledge
    }

    // Tare command response: "T" followed by tare value
    const tareMatch = data.match(/^T\s*([-]?\d+\.?\d*)?/);
    if (tareMatch) {
      console.log('Tare command acknowledged:', tareMatch[1]);
      return null;
    }

    // Firmware identifier response
    if (data.match(/^I?\s*\d{5}$/)) {
      console.log('Firmware identifier:', data);
      return null;
    }

    // Reboot response
    if (data.toLowerCase().includes('reboot')) {
      console.log('Scale rebooting');
      return null;
    }

    // If nothing matches, try generic number extraction
    const genericMatch = data.match(/([-]?\d+\.?\d*)/);
    if (genericMatch) {
      const value = parseFloat(genericMatch[1]);
      if (!isNaN(value)) {
        return {
          value,
          unit: 'kg',
          stable: true,
          status: 'unknown',
          raw: data,
          timestamp: Date.now(),
        };
      }
    }

    console.log('Could not parse scale data:', data);
    return null;
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
      // Commands should end with CR (0x0D) for Beaver protocol
      const data = command + '\r';
      
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
   * Zero the scale (Beaver Z command)
   * The scale will zero when weight stabilizes (up to 3 second timeout)
   */
  async zeroScale() {
    return this.sendCommand('Z');
  }

  /**
   * Set tare value (Beaver tare command)
   * @param {number} value - Tare value (4 digits, e.g., 0100 for 1.00)
   */
  async setTare(value = 0) {
    // Format tare value as 4 digits
    const tareValue = String(Math.round(value * 100)).padStart(4, '0');
    // Send CR + tare value + LF
    return this.sendCommand(tareValue);
  }

  /**
   * Clear tare (set tare to 0)
   */
  async clearTare() {
    return this.setTare(0);
  }

  /**
   * Request firmware identifier (Beaver I command)
   */
  async requestFirmwareId() {
    return this.sendCommand('I');
  }

  /**
   * Reboot the scale (Beaver R command)
   */
  async rebootScale() {
    return this.sendCommand('R');
  }

  /**
   * Set unit price for price calculation (Beaver P command)
   * @param {number} price - Unit price
   */
  async setUnitPrice(price) {
    return this.sendCommand(`P${price}`);
  }

  /**
   * Request total price (Beaver S command)
   * Returns unit price * current weight
   */
  async requestTotalPrice() {
    return this.sendCommand('S');
  }

  /**
   * Set polling rate for weight updates
   * @param {number} rateMs - Polling rate in milliseconds
   */
  setPollingRate(rateMs) {
    this.pollingRate = rateMs;
    if (this.isConnected) {
      this.stopPolling();
      this.startPolling();
    }
  }

  /**
   * Set protocol mode
   * @param {string} mode - 'beaver-basic', 'beaver-advanced1', 'beaver-advanced2', 'generic'
   */
  setProtocolMode(mode) {
    this.protocolMode = mode;
  }

  /**
   * Disconnect from the scale
   */
  disconnect() {
    this.stopPolling();
    
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
    this.tcpBuffer = '';
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      type: this.connectionType,
      protocol: this.protocolMode,
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
}

module.exports = ScaleService;
