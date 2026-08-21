/**
 * Brother QL-800 raster job encoder (GDI / no onboard fonts).
 * Uncompressed 720-pin rows. See docs/Brother-QL800-Research.md.
 */

const INVALIDATE_BYTES = 400;
const ROW_BYTES = 90;
const TOTAL_PINS = 720;
const PRINT_PINS = 696;
const LEFT_MARGIN_PINS = 12;
const FEED_MARGIN_DOTS = 35;

function toByteArray(data) {
  if (!data) return new Uint8Array(0);
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return Uint8Array.from(data);
}

function pixelPlane(r, g, b, a) {
  if (a < 128) return null;
  const isRed = r >= 150 && r > g + 50 && r > b + 50;
  if (isRed) return 'red';
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 200) return 'black';
  return null;
}

function pinForX(x) {
  return LEFT_MARGIN_PINS + x;
}

function setPin(row, pin) {
  if (pin < 0 || pin >= TOTAL_PINS) return;
  const byteIndex = Math.floor(pin / 8);
  const bit = 7 - (pin % 8);
  row[byteIndex] |= (1 << bit);
}

function rgbaToRasterPlanes(width, height, rgba) {
  const src = toByteArray(rgba);
  const blackRows = [];
  const redRows = [];
  const printWidth = Math.min(width, PRINT_PINS);
  for (let y = 0; y < height; y += 1) {
    const black = Buffer.alloc(ROW_BYTES, 0);
    const red = Buffer.alloc(ROW_BYTES, 0);
    for (let x = 0; x < printWidth; x += 1) {
      const i = (y * width + x) * 4;
      if (i + 3 >= src.length) break;
      const plane = pixelPlane(src[i], src[i + 1], src[i + 2], src[i + 3]);
      if (!plane) continue;
      const pin = pinForX(x);
      if (plane === 'red') setPin(red, pin);
      else setPin(black, pin);
    }
    blackRows.push(black);
    redRows.push(red);
  }
  return { blackRows, redRows };
}

function printInfoCommand(rasterCount) {
  const buf = Buffer.alloc(13);
  buf[0] = 0x1B;
  buf[1] = 0x69;
  buf[2] = 0x7A;
  buf[3] = 0x02 | 0x04 | 0x08 | 0x80;
  buf[4] = 0x0A;
  buf[5] = 62;
  buf[6] = 0x00;
  buf.writeUInt32LE(rasterCount >>> 0, 7);
  buf[11] = 0x00;
  buf[12] = 0x00;
  return buf;
}

/**
 * @param {{ width: number, height: number, data: Uint8Array|Buffer|number[], twoColor?: boolean }} opts
 * @returns {Buffer}
 */
function encodeRasterJob({ width, height, data, twoColor = false }) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const { blackRows, redRows } = rgbaToRasterPlanes(w, h, data);
  const parts = [
    Buffer.alloc(INVALIDATE_BYTES, 0),
    Buffer.from([0x1B, 0x69, 0x61, 0x01]),
    Buffer.from([0x1B, 0x40]),
    printInfoCommand(blackRows.length),
    Buffer.from([0x1B, 0x69, 0x4D, 0x40]),
    Buffer.from([0x1B, 0x69, 0x41, 0x01]),
    Buffer.from([0x1B, 0x69, 0x4B, twoColor ? 0x09 : 0x08]),
    Buffer.from([0x1B, 0x69, 0x64, FEED_MARGIN_DOTS, 0x00]),
  ];
  blackRows.forEach((black, index) => {
    if (twoColor) {
      parts.push(Buffer.concat([Buffer.from([0x77, 0x01, ROW_BYTES]), black]));
      parts.push(Buffer.concat([Buffer.from([0x77, 0x02, ROW_BYTES]), redRows[index]]));
    } else {
      const merged = Buffer.from(black);
      const red = redRows[index];
      for (let i = 0; i < ROW_BYTES; i += 1) merged[i] |= red[i];
      parts.push(Buffer.concat([Buffer.from([0x67, 0x00, ROW_BYTES]), merged]));
    }
  });
  parts.push(Buffer.from([0x1A]));
  return Buffer.concat(parts);
}

function parseStatus(bytes) {
  const raw = toByteArray(bytes);
  if (raw.length < 32) {
    return {
      ready: false,
      mediaLoaded: false,
      mediaWidthMm: 0,
      twoColor: false,
      editorLite: false,
      errors: ['status_short'],
      error: 'status_short',
    };
  }
  const error1 = raw[8];
  const error2 = raw[9];
  const mediaWidthMm = raw[10];
  const mediaType = raw[11];
  const statusType = raw[18];
  const errors = [];
  if (error1 & 0x01) errors.push('no_media');
  if (error1 & 0x02) errors.push('media_end');
  if (error1 & 0x04) errors.push('cutter_jam');
  if (error1 & 0x10) errors.push('busy');
  if (error2 & 0x01) errors.push('wrong_media');
  if (error2 & 0x10) errors.push('cover_open');
  if (error2 & 0x40) errors.push('media_end');
  if (error2 & 0x80) errors.push('system_error');
  const twoColor = !!(raw[25] & 0x80);
  return {
    ready: errors.filter((code) => code !== 'busy').length === 0,
    mediaLoaded: mediaType !== 0,
    mediaWidthMm,
    mediaType,
    statusType,
    twoColor,
    editorLite: false,
    errors,
    error: errors.filter((code) => code !== 'busy')[0] || null,
  };
}

module.exports = {
  PRINT_PINS,
  encodeRasterJob,
  parseStatus,
  STATUS_REQUEST: Buffer.from([0x1B, 0x69, 0x53]),
};
