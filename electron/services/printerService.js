const EventEmitter = require('events');
const { encodeRasterJob, parseStatus, interpretPrintProgress, STATUS_REQUEST } = require('./ql800Raster');

const QL800_VID = 0x04f9;
const QL800_PID = 0x209b;
const TRANSFER_CHUNK = 4096;
const TRANSFER_TIMEOUT_MS = 30000;

function log(...args) {
  console.error('[QL-800]', ...args);
}

function transferOut(endpoint, data) {
  return new Promise((resolve, reject) => {
    endpoint.transfer(data, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function transferIn(endpoint, length) {
  return new Promise((resolve, reject) => {
    endpoint.transfer(length, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}

async function transferOutChunked(endpoint, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  for (let offset = 0; offset < buf.length; offset += TRANSFER_CHUNK) {
    await transferOut(endpoint, buf.subarray(offset, Math.min(offset + TRANSFER_CHUNK, buf.length)));
  }
}

function errorText(error) {
  if (!error) return '';
  return [
    error.message,
    error.errno,
    error.code,
    error.cause && error.cause.message,
  ].filter((part) => part != null && part !== '').join(' | ');
}

function mapUsbError(error) {
  const message = errorText(error).toLowerCase();
  const rawCode = String(error?.errno || error?.code || '');
  if (error?.code === 'no_printer' || error?.code === 'no_usb_module' || error?.code === 'need_winusb') {
    return { code: error.code, error: error.message || error.code };
  }
  if (message.includes('not_supported') || rawCode === '-12' || message.includes('libusb_error_not_supported')) {
    return { code: 'need_winusb', error: errorText(error) };
  }
  if (
    message.includes('not_found')
    || message.includes('no device')
    || message.includes('no_device')
    || rawCode === '-4'
    || rawCode === '-5'
  ) {
    return { code: 'no_printer', error: errorText(error) };
  }
  if (
    message.includes('busy')
    || message.includes('access')
    || message.includes('could not claim')
    || rawCode === '-3'
    || rawCode === '-6'
    || rawCode === 'EBUSY'
  ) {
    return { code: 'busy', error: errorText(error) };
  }
  if (message.includes('timeout') || rawCode === '-7') {
    return { code: 'timeout', error: errorText(error) };
  }
  if (message.includes('pipe') || rawCode === '-9') {
    return { code: 'print_failed', error: errorText(error) };
  }
  return { code: 'print_failed', error: errorText(error) || 'unknown USB error' };
}

function coerceImageData(data) {
  if (!data) return Buffer.alloc(0);
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  if (data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
  if (typeof data === 'object' && data.length) {
    try {
      return Buffer.from(Uint8Array.from(data));
    } catch {
      return Buffer.alloc(0);
    }
  }
  return Buffer.alloc(0);
}

function isBulk(endpoint) {
  const type = endpoint.transferType;
  return type === 2 || type === 'bulk' || String(type).toLowerCase() === 'bulk';
}

function fatalPrintErrors(status) {
  return (status?.errors || []).filter((code) => code !== 'busy' && code !== 'status_short');
}

class PrinterService extends EventEmitter {
  constructor() {
    super();
    this.device = null;
    this.iface = null;
    this.outEndpoint = null;
    this.inEndpoint = null;
    this.usb = null;
    this.opQueue = Promise.resolve();
  }

  runExclusive(work) {
    const run = this.opQueue.then(work, work);
    this.opQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  loadUsb() {
    if (this.usb) return this.usb;
    try {
      this.usb = require('usb');
    } catch (error) {
      log('native usb module failed to load', error);
      const wrapped = new Error(
        `USB module failed: ${error.message}. Rebuild with: npx electron-builder install-app-deps`,
      );
      wrapped.cause = error;
      wrapped.code = 'no_usb_module';
      throw wrapped;
    }
    return this.usb;
  }

  listBrotherDevices() {
    try {
      const usb = this.loadUsb();
      const list = typeof usb.getDeviceList === 'function' ? usb.getDeviceList() : [];
      return list.map((candidate) => {
        const descriptor = candidate.deviceDescriptor || {};
        return {
          vendorId: descriptor.idVendor,
          productId: descriptor.idProduct,
          brother: descriptor.idVendor === QL800_VID,
          ql800: descriptor.idVendor === QL800_VID && descriptor.idProduct === QL800_PID,
        };
      }).filter((row) => row.brother);
    } catch (error) {
      log('getDeviceList failed', error);
      return [];
    }
  }

  emitError(payload) {
    log('error', payload);
    this.emit('error', payload);
    if (this.errorCallback) this.errorCallback(payload);
  }

  onError(callback) {
    this.errorCallback = callback;
  }

  async ensureOpen() {
    if (this.outEndpoint && this.inEndpoint) return;
    const usb = this.loadUsb();
    const findByIds = usb.findByIds || usb.usb?.findByIds;
    let device = typeof findByIds === 'function'
      ? findByIds(QL800_VID, QL800_PID)
      : null;
    if (!device && typeof usb.getDeviceList === 'function') {
      device = usb.getDeviceList().find((candidate) => {
        const descriptor = candidate.deviceDescriptor || {};
        return descriptor.idVendor === QL800_VID && descriptor.idProduct === QL800_PID;
      }) || null;
    }
    if (!device) {
      const brothers = this.listBrotherDevices();
      log('QL-800 PID 209B not found. Brother USB devices:', brothers);
      const err = new Error(
        brothers.length
          ? `QL-800 printer-mode PID 209B not found. Brother devices: ${JSON.stringify(brothers)}. If Editor Lite LED is green, hold the button until it turns off.`
          : 'QL-800 not found on USB. Check cable and Editor Lite (green LED must be off).',
      );
      err.code = 'no_printer';
      throw err;
    }
    device.open();
    try {
      if (typeof device.setConfiguration === 'function') {
        await new Promise((resolve) => {
          device.setConfiguration(1, () => resolve());
        });
      }
    } catch (error) {
      log('setConfiguration skipped', error && error.message);
    }
    const iface = device.interfaces && device.interfaces[0];
    if (!iface) {
      const err = new Error('QL-800 USB interface 0 is missing.');
      err.code = 'no_printer';
      throw err;
    }
    try {
      if (typeof iface.isKernelDriverActive === 'function' && iface.isKernelDriverActive()) {
        iface.detachKernelDriver();
      }
    } catch (error) {
      log('detachKernelDriver skipped', error && error.message);
    }
    try {
      iface.claim();
    } catch (error) {
      log('claim interface failed', error);
      const mapped = mapUsbError(error);
      const err = new Error(mapped.error);
      err.code = mapped.code;
      throw err;
    }
    const outEndpoint = iface.endpoints.find((endpoint) => endpoint.direction === 'out' && isBulk(endpoint))
      || iface.endpoints.find((endpoint) => endpoint.direction === 'out');
    const inEndpoint = iface.endpoints.find((endpoint) => endpoint.direction === 'in' && isBulk(endpoint))
      || iface.endpoints.find((endpoint) => endpoint.direction === 'in');
    if (!outEndpoint || !inEndpoint) {
      log('endpoints', iface.endpoints.map((endpoint) => ({
        direction: endpoint.direction,
        transferType: endpoint.transferType,
        address: endpoint.address,
      })));
      const err = new Error('QL-800 bulk endpoints were not found.');
      err.code = 'no_printer';
      throw err;
    }
    outEndpoint.timeout = TRANSFER_TIMEOUT_MS;
    inEndpoint.timeout = TRANSFER_TIMEOUT_MS;
    this.device = device;
    this.iface = iface;
    this.outEndpoint = outEndpoint;
    this.inEndpoint = inEndpoint;
    log('opened', { out: outEndpoint.address, in: inEndpoint.address });
  }

  async close() {
    const iface = this.iface;
    const device = this.device;
    this.outEndpoint = null;
    this.inEndpoint = null;
    this.iface = null;
    this.device = null;
    try {
      if (iface && typeof iface.release === 'function') {
        await new Promise((resolve) => {
          iface.release(true, () => resolve());
        });
      }
    } catch {
      // ignore
    }
    try {
      if (device && typeof device.close === 'function') device.close();
    } catch {
      // ignore
    }
  }

  async drainIn(maxReads = 8) {
    if (!this.inEndpoint) return;
    const previous = this.inEndpoint.timeout;
    this.inEndpoint.timeout = 80;
    try {
      for (let i = 0; i < maxReads; i += 1) {
        try {
          const raw = await transferIn(this.inEndpoint, 32);
          if (!raw || raw.length === 0) break;
          log('drained leftover status', raw.length, Buffer.from(raw).toString('hex'));
        } catch {
          break;
        }
      }
    } finally {
      this.inEndpoint.timeout = previous;
    }
  }

  logStatus(parsed, raw) {
    log('status', {
      ...parsed,
      rawHex: raw && raw.length ? Buffer.from(raw).toString('hex') : '',
    });
  }

  async requestStatus() {
    await transferOut(this.outEndpoint, STATUS_REQUEST);
    const raw = await transferIn(this.inEndpoint, 32);
    const parsed = parseStatus(raw);
    this.logStatus(parsed, raw);
    return parsed;
  }

  async readStatus() {
    await this.ensureOpen();
    let parsed = await this.requestStatus();
    if (parsed.errors.includes('status_short')) {
      log('status_short, draining and retrying');
      await this.drainIn();
      parsed = await this.requestStatus();
    }
    return parsed;
  }

  async getStatus() {
    return this.runExclusive(() => this.getStatusLocked());
  }

  async getStatusLocked() {
    try {
      let status = await this.readStatus();
      if (status.errors.includes('status_short')) {
        await this.close();
        status = await this.readStatus();
      }
      return {
        connected: true,
        mediaLoaded: status.mediaLoaded,
        mediaWidthMm: status.mediaWidthMm,
        twoColor: status.twoColor,
        editorLite: false,
        error: fatalPrintErrors(status)[0] || null,
        errors: status.errors,
        ready: status.ready,
        statusType: status.statusType,
        message: null,
      };
    } catch (error) {
      const mapped = mapUsbError(error);
      const brothers = this.listBrotherDevices();
      this.emitError({ code: mapped.code, error: mapped.error, devices: brothers });
      return {
        connected: false,
        mediaLoaded: false,
        mediaWidthMm: 0,
        twoColor: false,
        editorLite: mapped.code === 'no_printer',
        error: mapped.code,
        errors: [mapped.code],
        message: mapped.error,
        devices: brothers,
      };
    }
  }

  async waitForPrintComplete() {
    const deadline = Date.now() + 20000;
    const previous = this.inEndpoint.timeout;
    let sawPhaseChange = false;
    try {
      while (Date.now() < deadline) {
        this.inEndpoint.timeout = Math.min(2000, Math.max(100, deadline - Date.now()));
        try {
          const raw = await transferIn(this.inEndpoint, 32);
          const status = parseStatus(raw);
          this.logStatus(status, raw);
          if (status.statusType === 0x06) sawPhaseChange = true;
          const progress = interpretPrintProgress(status);
          if (progress.action === 'ok') return { ok: true, status };
          if (progress.action === 'error') {
            return { ok: false, code: progress.code || 'print_failed', status };
          }
        } catch (error) {
          log('wait status', errorText(error));
        }
      }
      if (sawPhaseChange) {
        log('print completed status not received, phase change was seen');
        return { ok: true, status: { errors: [] } };
      }
      return { ok: false, code: 'timeout', status: { errors: ['timeout'] } };
    } finally {
      if (this.inEndpoint) this.inEndpoint.timeout = previous;
    }
  }

  async print(payload) {
    return this.runExclusive(() => this.printLocked(payload || {}));
  }

  async printLocked({ width, height, data }) {
    try {
      const pixels = coerceImageData(data);
      log('print start', { width, height, bytes: pixels.length });
      await this.ensureOpen();
      await this.drainIn();
      let status;
      try {
        status = await this.readStatus();
      } catch (error) {
        log('pre-print status failed, continuing', errorText(error));
        status = { twoColor: false, errors: [] };
      }
      const preFatals = fatalPrintErrors(status);
      if (preFatals.includes('no_media')) {
        return { ok: false, code: 'no_media', error: 'no_media', message: 'No DK roll loaded' };
      }
      if (preFatals.includes('cover_open')) {
        return { ok: false, code: 'cover_open', error: 'cover_open', message: 'Cover is open' };
      }

      const send = async (twoColor) => {
        const job = encodeRasterJob({
          width,
          height,
          data: pixels,
          twoColor,
        });
        log('sending raster bytes', job.length, 'twoColor', twoColor);
        await this.drainIn();
        await transferOutChunked(this.outEndpoint, job);
        return this.waitForPrintComplete();
      };

      const useTwoColor = !!status.twoColor;
      log('media twoColor', useTwoColor, 'mediaType', status.mediaType);
      let finished = await send(useTwoColor);
      if (!finished.ok && finished.code === 'wrong_media') {
        log('wrong media for color mode, retry', !useTwoColor);
        finished = await send(!useTwoColor);
      }
      if (!finished.ok) {
        return {
          ok: false,
          code: finished.code || 'print_failed',
          error: finished.code || 'print_failed',
          message: `Printer status error: ${finished.code}`,
        };
      }
      return { ok: true };
    } catch (error) {
      log('print threw', error);
      const mapped = mapUsbError(error);
      this.emitError(mapped);
      return {
        ok: false,
        code: mapped.code,
        error: mapped.code,
        message: mapped.error,
      };
    } finally {
      await this.close();
    }
  }
}

module.exports = PrinterService;
