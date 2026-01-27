import React, { useState, useEffect } from 'react';
import { useWeightScale, isElectron } from '../../hooks/useWeightScale';

/**
 * ScaleConnectionPanel - UI component for managing weight scale connections
 * 
 * This component provides:
 * - Serial port selection and connection
 * - TCP/WiFi connection configuration
 * - Real-time weight display
 * - Connection status indicators
 * 
 * Usage:
 * <ScaleConnectionPanel onWeightChange={(weight) => console.log(weight)} />
 */
const ScaleConnectionPanel = ({ onWeightChange, className = '' }) => {
  // Scale hook
  const {
    isElectron: isDesktop,
    isConnected,
    connectionType,
    weight,
    lastStableWeight,
    error,
    availablePorts,
    isLoading,
    listPorts,
    connectSerial,
    connectTCP,
    disconnect,
    zero,        // Beaver Z command - zeros when stable
    clearTare,   // Clear tare value
    clearError,
  } = useWeightScale();

  // Local state for connection form
  const [connectionMode, setConnectionMode] = useState('serial'); // 'serial' or 'tcp'
  const [selectedPort, setSelectedPort] = useState('');
  const [baudRate, setBaudRate] = useState(9600);
  const [tcpHost, setTcpHost] = useState('');
  const [tcpPort, setTcpPort] = useState(4001);

  // Load available ports on mount
  useEffect(() => {
    if (isDesktop) {
      listPorts();
    }
  }, [isDesktop, listPorts]);

  // Notify parent of weight changes
  useEffect(() => {
    if (weight && onWeightChange) {
      onWeightChange(weight);
    }
  }, [weight, onWeightChange]);

  // Handle serial connection
  const handleSerialConnect = async () => {
    if (!selectedPort) {
      return;
    }
    await connectSerial(selectedPort, { baudRate });
  };

  // Handle TCP connection
  const handleTCPConnect = async () => {
    if (!tcpHost || !tcpPort) {
      return;
    }
    await connectTCP(tcpHost, tcpPort);
  };

  // If not running in Electron, show informational message
  if (!isDesktop) {
    return (
      <div className={`scale-panel ${className}`} style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>משקל דיגיטלי</h3>
        </div>
        <div style={styles.webMessage}>
          <p>חיבור למשקל זמין רק באפליקציית הדסקטופ</p>
          <p style={styles.smallText}>
            להורדת גרסת הדסקטופ, פנה למנהל המערכת
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`scale-panel ${className}`} style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>משקל דיגיטלי</h3>
        <div style={{
          ...styles.statusDot,
          backgroundColor: isConnected ? '#4CAF50' : '#f44336'
        }} />
      </div>

      {/* Error Display */}
      {error && (
        <div style={styles.error}>
          <span>{error}</span>
          <button onClick={clearError} style={styles.errorClose}>×</button>
        </div>
      )}

      {/* Weight Display */}
      <div style={styles.weightDisplay}>
        <div style={styles.weightValue}>
          {weight ? (
            weight.status === 'overweight' ? 'H' :
            weight.status === 'underweight' ? 'L' :
            weight.value !== null ? weight.value.toFixed(3) : '---'
          ) : '---'}
        </div>
        <div style={styles.weightUnit}>
          {weight?.status === 'overweight' ? 'עומס יתר' :
           weight?.status === 'underweight' ? 'משקל שלילי' :
           weight ? weight.unit : 'kg'}
        </div>
        {weight && (
          <div style={{
            ...styles.stabilityIndicator,
            color: weight.status === 'overweight' ? '#f44336' :
                   weight.status === 'underweight' ? '#f44336' :
                   weight.stable ? '#4CAF50' : '#ff9800'
          }}>
            {weight.status === 'overweight' ? 'עומס יתר!' :
             weight.status === 'underweight' ? 'משקל שלילי!' :
             weight.status === 'zero' ? 'אפס' :
             weight.stable ? 'יציב' : 'לא יציב'}
          </div>
        )}
      </div>

      {/* Last Stable Weight */}
      {lastStableWeight && (
        <div style={styles.lastStable}>
          משקל יציב אחרון: {lastStableWeight.value.toFixed(2)} {lastStableWeight.unit}
        </div>
      )}

      {/* Connection Controls */}
      {!isConnected ? (
        <div style={styles.connectionForm}>
          {/* Connection Mode Tabs */}
          <div style={styles.tabs}>
            <button
              style={{
                ...styles.tab,
                ...(connectionMode === 'serial' ? styles.activeTab : {})
              }}
              onClick={() => setConnectionMode('serial')}
            >
              USB / RS232
            </button>
            <button
              style={{
                ...styles.tab,
                ...(connectionMode === 'tcp' ? styles.activeTab : {})
              }}
              onClick={() => setConnectionMode('tcp')}
            >
              WiFi / רשת
            </button>
          </div>

          {/* Serial Connection Form */}
          {connectionMode === 'serial' && (
            <div style={styles.formSection}>
              <div style={styles.formGroup}>
                <label style={styles.label}>יציאה:</label>
                <div style={styles.portRow}>
                  <select
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">בחר יציאה...</option>
                    {availablePorts.map((port) => (
                      <option key={port.path} value={port.path}>
                        {port.path} {port.manufacturer !== 'Unknown' ? `(${port.manufacturer})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={listPorts}
                    style={styles.refreshButton}
                    disabled={isLoading}
                  >
                    ↻
                  </button>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>קצב שידור:</label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  style={styles.select}
                >
                  <option value={9600}>9600</option>
                  <option value={19200}>19200</option>
                  <option value={38400}>38400</option>
                  <option value={57600}>57600</option>
                  <option value={115200}>115200</option>
                </select>
              </div>

              <button
                onClick={handleSerialConnect}
                disabled={!selectedPort || isLoading}
                style={styles.connectButton}
              >
                {isLoading ? 'מתחבר...' : 'התחבר'}
              </button>
            </div>
          )}

          {/* TCP Connection Form */}
          {connectionMode === 'tcp' && (
            <div style={styles.formSection}>
              <div style={styles.formGroup}>
                <label style={styles.label}>כתובת IP:</label>
                <input
                  type="text"
                  value={tcpHost}
                  onChange={(e) => setTcpHost(e.target.value)}
                  placeholder="192.168.1.100"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>פורט:</label>
                <input
                  type="number"
                  value={tcpPort}
                  onChange={(e) => setTcpPort(Number(e.target.value))}
                  style={styles.input}
                />
              </div>

              <button
                onClick={handleTCPConnect}
                disabled={!tcpHost || !tcpPort || isLoading}
                style={styles.connectButton}
              >
                {isLoading ? 'מתחבר...' : 'התחבר'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={styles.connectedActions}>
          <div style={styles.connectionInfo}>
            מחובר באמצעות {connectionType === 'serial' ? 'USB/RS232' : 'WiFi/רשת'}
          </div>
          <div style={styles.buttonRow}>
            <button onClick={zero} style={styles.zeroButton}>
              איפוס (Zero)
            </button>
            <button onClick={clearTare} style={styles.tareButton}>
              נקה טרה
            </button>
            <button onClick={disconnect} style={styles.disconnectButton}>
              התנתק
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Inline styles
const styles = {
  container: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '16px',
    direction: 'rtl',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    borderBottom: '1px solid #eee',
    paddingBottom: '8px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    color: '#333',
  },
  statusDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  webMessage: {
    textAlign: 'center',
    padding: '20px',
    color: '#666',
  },
  smallText: {
    fontSize: '12px',
    color: '#999',
    marginTop: '8px',
  },
  error: {
    backgroundColor: '#ffebee',
    color: '#c62828',
    padding: '8px 12px',
    borderRadius: '4px',
    marginBottom: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorClose: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#c62828',
  },
  weightDisplay: {
    textAlign: 'center',
    padding: '20px 0',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  weightValue: {
    fontSize: '48px',
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'monospace',
  },
  weightUnit: {
    fontSize: '18px',
    color: '#666',
  },
  stabilityIndicator: {
    marginTop: '8px',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  lastStable: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#666',
    marginBottom: '16px',
  },
  connectionForm: {
    marginTop: '16px',
  },
  tabs: {
    display: 'flex',
    marginBottom: '16px',
    borderBottom: '1px solid #ddd',
  },
  tab: {
    flex: 1,
    padding: '8px 16px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  activeTab: {
    color: '#1976d2',
    borderBottomColor: '#1976d2',
  },
  formSection: {
    padding: '8px 0',
  },
  formGroup: {
    marginBottom: '12px',
  },
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '14px',
    color: '#555',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
    direction: 'ltr',
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
    direction: 'ltr',
    boxSizing: 'border-box',
  },
  portRow: {
    display: 'flex',
    gap: '8px',
  },
  refreshButton: {
    padding: '8px 12px',
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  connectButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  connectedActions: {
    textAlign: 'center',
  },
  connectionInfo: {
    marginBottom: '12px',
    color: '#4CAF50',
    fontSize: '14px',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
  },
  zeroButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tareButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#2196F3',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  disconnectButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#f44336',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};

export default ScaleConnectionPanel;


