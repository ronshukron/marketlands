const {
  encodeRasterJob,
  parseStatus,
  interpretPrintProgress,
} = require('../../electron/services/ql800Raster');

function statusFrame({
  error1 = 0,
  error2 = 0,
  mediaWidthMm = 62,
  mediaType = 0x0A,
  statusType = 0x00,
  phaseType = 0x00,
  twoColor = false,
} = {}) {
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
  raw[10] = mediaWidthMm;
  raw[11] = mediaType;
  raw[14] = 0x3F;
  raw[18] = statusType;
  raw[19] = phaseType;
  if (twoColor) raw[25] = 0x80;
  return raw;
}

describe('parseStatus', () => {
  test('treats short or unframed USB replies as status_short', () => {
    expect(parseStatus(Buffer.from([0x80, 0x20])).error).toBe('status_short');
    expect(parseStatus(Buffer.alloc(32, 1)).error).toBe('status_short');
  });

  test('reads 62 mm black-only continuous tape', () => {
    const parsed = parseStatus(statusFrame());
    expect(parsed).toMatchObject({
      ready: true,
      mediaLoaded: true,
      mediaWidthMm: 62,
      mediaType: 0x0A,
      statusType: 0,
      twoColor: false,
      errors: [],
      error: null,
    });
  });

  test('detects two-color tape and communication errors', () => {
    expect(parseStatus(statusFrame({ twoColor: true })).twoColor).toBe(true);
    expect(parseStatus(statusFrame({ error2: 0x04, statusType: 0x02 }))).toMatchObject({
      error: 'communication_error',
      errors: ['communication_error'],
      statusType: 2,
    });
  });
});

describe('interpretPrintProgress', () => {
  test('does not treat an error frame as print success', () => {
    const errored = parseStatus(statusFrame({ statusType: 0x02 }));
    expect(interpretPrintProgress(errored)).toEqual({
      action: 'error',
      code: 'print_failed',
    });
  });

  test('waits through phase-change and finishes on printing completed', () => {
    expect(interpretPrintProgress(parseStatus(statusFrame({
      statusType: 0x06,
      phaseType: 0x01,
    })))).toEqual({ action: 'wait' });
    expect(interpretPrintProgress(parseStatus(statusFrame({
      statusType: 0x01,
    })))).toEqual({ action: 'ok' });
  });

  test('waits on truncated USB reads instead of failing the job', () => {
    expect(interpretPrintProgress(parseStatus(Buffer.alloc(4)))).toEqual({ action: 'wait' });
  });
});

describe('encodeRasterJob', () => {
  function pixel(r, g, b, a = 255) {
    return Uint8Array.from([r, g, b, a]);
  }

  test('uses black-only g rows unless two-color mode is on', () => {
    const black = encodeRasterJob({ width: 1, height: 1, data: pixel(0, 0, 0), twoColor: false });
    const color = encodeRasterJob({ width: 1, height: 1, data: pixel(0, 0, 0), twoColor: true });
    expect(black.includes(Buffer.from([0x67, 0x00, 90]))).toBe(true);
    expect(black.includes(Buffer.from([0x77, 0x01, 90]))).toBe(false);
    expect(black[black.length - 1]).toBe(0x1A);
    expect(color.includes(Buffer.from([0x77, 0x01, 90]))).toBe(true);
    expect(black.includes(Buffer.from([0x1B, 0x69, 0x4B, 0x08]))).toBe(true);
    expect(color.includes(Buffer.from([0x1B, 0x69, 0x4B, 0x09]))).toBe(true);
  });

  test('enables automatic status notifications', () => {
    const job = encodeRasterJob({ width: 1, height: 1, data: pixel(0, 0, 0) });
    expect(job.includes(Buffer.from([0x1B, 0x69, 0x21, 0x00]))).toBe(true);
  });
});
