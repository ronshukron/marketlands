const PrinterService = require('../../electron/services/printerService');

// The Electron printer service against a fake QL-800 on a fake USB bus.
// The printer answers a status request with a status frame, and answers a
// finished raster job (it ends with the 0x1A print command) per scenario.

function statusFrame({ error1 = 0, error2 = 0, statusType = 0x00, phaseType = 0x00 } = {}) {
  const raw = Buffer.alloc(32, 0);
  raw[0] = 0x80;
  raw[1] = 0x20;
  raw[2] = 0x42;
  raw[3] = 0x34;
  raw[4] = 0x38;
  raw[5] = 0x30;
  raw[6] = 0x30;
  raw[8] = error1;
  raw[9] = error2;
  raw[10] = 62;
  raw[11] = 0x0A;
  raw[14] = 0x3F;
  raw[18] = statusType;
  raw[19] = phaseType;
  return raw;
}

const STATUS_REQUEST = [0x1B, 0x69, 0x53];

function fakeUsb({ afterJob = [], failJobTransfer = false } = {}) {
  const replies = [];
  const events = [];
  const sent = { jobs: 0, statusRequests: 0 };
  const outEndpoint = {
    direction: 'out',
    transferType: 2,
    transfer(data, callback) {
      const bytes = Buffer.from(data);
      if (bytes.length === 3 && STATUS_REQUEST.every((value, index) => bytes[index] === value)) {
        sent.statusRequests += 1;
        replies.push(statusFrame());
      } else if (bytes[bytes.length - 1] === 0x1A) {
        if (failJobTransfer) {
          setTimeout(() => callback(Object.assign(new Error('LIBUSB_ERROR_PIPE'), { errno: -9 })), 0);
          return;
        }
        sent.jobs += 1;
        events.push('job');
        replies.push(...afterJob);
      }
      setTimeout(() => callback(null), 0);
    },
  };
  const inEndpoint = {
    direction: 'in',
    transferType: 2,
    transfer(length, callback) {
      const next = replies.shift();
      if (next) setTimeout(() => callback(null, next), 0);
      else setTimeout(() => callback(Object.assign(new Error('LIBUSB_ERROR_TIMEOUT'), { errno: -7 })), 2);
    },
  };
  const iface = {
    endpoints: [outEndpoint, inEndpoint],
    claim() {},
    release(_force, callback) { if (callback) callback(); },
    isKernelDriverActive: () => false,
  };
  const device = {
    open() {},
    close() {},
    interfaces: [iface],
    setConfiguration(_value, callback) { callback(); },
    deviceDescriptor: { idVendor: 0x04f9, idProduct: 0x209b },
  };
  return { usb: { findByIds: () => device, getDeviceList: () => [device] }, device, sent, events };
}

const image = { width: 8, height: 4, data: new Uint8Array(8 * 4 * 4).fill(255) };

function serviceWith(fake) {
  const service = new PrinterService();
  service.usb = fake.usb;
  service.printWaitMs = 60;
  service.on('error', () => {});
  return service;
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

test('printer confirms the label: ok, data sent', async () => {
  const fake = fakeUsb({ afterJob: [statusFrame({ statusType: 0x06, phaseType: 0x01 }), statusFrame({ statusType: 0x01 })] });
  const result = await serviceWith(fake).print(image);
  expect(result).toEqual({ ok: true, dataSent: true });
  expect(fake.sent.jobs).toBe(1);
});

test('no answer after the whole job was sent: timeout, and the station is told the data went out', async () => {
  const fake = fakeUsb({ afterJob: [] });
  const result = await serviceWith(fake).print(image);
  expect(result).toEqual(expect.objectContaining({ ok: false, code: 'timeout', dataSent: true }));
  expect(fake.sent.jobs).toBe(1);
});

test('the job transfer itself failed: not sent, so the station does not ask', async () => {
  const fake = fakeUsb({ failJobTransfer: true });
  const result = await serviceWith(fake).print(image);
  expect(result).toEqual(expect.objectContaining({ ok: false, dataSent: false }));
  expect(fake.sent.jobs).toBe(0);
});

test('an error status after the job (roll ended) is reported with its code', async () => {
  const fake = fakeUsb({ afterJob: [statusFrame({ statusType: 0x02, error1: 0x02 })] });
  const result = await serviceWith(fake).print(image);
  expect(result).toEqual(expect.objectContaining({ ok: false, code: 'media_end' }));
});

test('two prints at once run one after the other, never interleaved', async () => {
  const fake = fakeUsb({ afterJob: [statusFrame({ statusType: 0x01 })] });
  const { device } = fake;
  const close = device.close;
  device.close = () => { fake.events.push('close'); close(); };
  const service = serviceWith(fake);
  const [first, second] = await Promise.all([service.print(image), service.print(image)]);
  expect(first).toEqual({ ok: true, dataSent: true });
  expect(second).toEqual({ ok: true, dataSent: true });
  expect(fake.events.filter((event) => event === 'job' || event === 'close')).toEqual(['job', 'close', 'job', 'close']);
});
