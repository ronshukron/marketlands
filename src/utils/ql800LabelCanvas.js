import { cartonLabelText } from './crateLabelCounter';

export const QL800_PRINT_WIDTH = 696;
const FONT_STACK = '"Segoe UI", "Arial Hebrew", Tahoma, sans-serif';

function ellipsize(ctx, text, maxWidth) {
  const value = String(text || '').trim() || '-';
  if (ctx.measureText(value).width <= maxWidth) return value;
  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}…`;
}

function fitFontSize(ctx, text, maxWidth, startSize, minSize, weight = '900') {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }
  return size;
}

function fillRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
}

function drawCrateSymbol(ctx, cx, cy, large) {
  const w = large ? 78 : 40;
  const h = large ? 58 : 30;
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = large ? 8 : 6;
  ctx.lineJoin = 'miter';
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2 + h * 0.32);
  ctx.lineTo(cx + w / 2, cy - h / 2 + h * 0.32);
  ctx.stroke();
  ctx.restore();
}

function drawRecycleSymbol(ctx, cx, cy, radius) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = 7;
  ctx.lineCap = 'butt';
  for (let i = 0; i < 3; i += 1) {
    const start = ((i * 120) - 18) * (Math.PI / 180);
    const end = ((i * 120) + 78) * (Math.PI / 180);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.stroke();
    const tipX = cx + radius * Math.cos(end);
    const tipY = cy + radius * Math.sin(end);
    const dir = end + Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(tipX + 16 * Math.cos(dir), tipY + 16 * Math.sin(dir));
    ctx.lineTo(tipX + 14 * Math.cos(dir + 2.4), tipY + 14 * Math.sin(dir + 2.4));
    ctx.lineTo(tipX + 6 * Math.cos(dir - 0.7), tipY + 6 * Math.sin(dir - 0.7));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawCrateMarks(ctx, cx, cy, { reusable = false, large = false } = {}) {
  const boxW = large ? 78 : 40;
  if (!reusable) {
    drawCrateSymbol(ctx, cx, cy, large);
    return;
  }
  const gap = 28;
  const total = boxW + gap + 64;
  drawCrateSymbol(ctx, cx - total / 2 + boxW / 2, cy, large);
  drawRecycleSymbol(ctx, cx + total / 2 - 32, cy, 26);
}

function mirrorHorizontal(data, width, height) {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const si = (y * width + x) * 4;
      const di = (y * width + (width - 1 - x)) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return out;
}

export const LABEL_NAME_MAX_CHARS = 16;
export const LABEL_COMMUNITY_MAX_CHARS = 12;

// Cut by characters (not UTF-16 units) so a name is never split mid-character.
function cutText(value, maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return Array.from(text).slice(0, maxChars).join('').trim();
}

export function labelNameText(name) {
  return cutText(name, LABEL_NAME_MAX_CHARS) || '-';
}

export function labelCommunityText(community) {
  return cutText(community, LABEL_COMMUNITY_MAX_CHARS) || '-';
}

/** 0501234567 / +972501234567 -> 050-1234567. Anything else is printed as typed. */
export function labelPhoneText(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  if (/^0\d{9}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (/^0\d{8}$/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return raw.slice(0, 20);
}

/**
 * 62 mm QL-800 label:
 *   [order number huge]          [קרטון 1#]
 *   [community, medium, up to 12 chars]
 *   [N]  (black strip with the community loading number, only when loadingOrder is set)
 *   [crate size symbol, recycle symbol when reused]
 *   [name huge, white on red, up to 16 chars]
 *   [phone, small]
 */
function drawLoadingOrderStrip(ctx, x, y, w, h, loadingOrder) {
  ctx.save();
  ctx.fillStyle = '#000000';
  fillRoundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const numberText = String(loadingOrder);
  const numberSize = fitFontSize(ctx, numberText, w - 24, h - 8, 40);
  ctx.font = `900 ${numberSize}px ${FONT_STACK}`;
  ctx.fillText(numberText, x + w / 2, y + h / 2 + 2);
  ctx.restore();
}

export function renderQl800Label({
  customerNumber,
  name,
  phone = '',
  community,
  crateIndex,
  crateMark = null,
  loadingOrder = null,
} = {}) {
  const width = QL800_PRINT_WIDTH;
  const pad = 12;
  const contentW = width - pad * 2;
  const numberText = String(customerNumber == null || customerNumber === '' ? '-' : customerNumber);
  const nameText = labelNameText(name);
  const communityText = labelCommunityText(community);
  const phoneText = labelPhoneText(phone);
  const cartonText = cartonLabelText(crateIndex);
  const showMarks = crateMark && typeof crateMark === 'object';
  const showLoadingOrder = Number.isFinite(Number(loadingOrder)) && Number(loadingOrder) > 0;

  const topH = 166;
  const communityH = 104;
  const loadH = showLoadingOrder ? 92 : 0;
  const typeH = showMarks ? 78 : 0;
  const phoneH = phoneText ? 52 : 0;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = pad * 2 + topH + communityH + loadH + typeH + 220 + phoneH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D is not available');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';

  // Row 1: customer number (left) and carton counter (right).
  let y = pad;
  ctx.font = `800 64px ${FONT_STACK}`;
  const cartonSize = fitFontSize(ctx, cartonText, 250, 64, 40, '800');
  ctx.font = `800 ${cartonSize}px ${FONT_STACK}`;
  const cartonW = ctx.measureText(cartonText).width;
  ctx.textAlign = 'right';
  ctx.fillText(cartonText, width - pad, y + topH / 2);

  ctx.textAlign = 'left';
  const numberSize = fitFontSize(ctx, numberText, contentW - cartonW - 24, 176, 80);
  ctx.font = `900 ${numberSize}px ${FONT_STACK}`;
  ctx.fillText(numberText, pad, y + topH / 2);
  y += topH;

  // Row 2: community on its own line so it can be read from a distance.
  ctx.textAlign = 'center';
  const communitySize = fitFontSize(ctx, communityText, contentW, 92, 48, '800');
  ctx.font = `800 ${communitySize}px ${FONT_STACK}`;
  ctx.fillText(ellipsize(ctx, communityText, contentW), width / 2, y + communityH / 2);
  y += communityH;

  if (showLoadingOrder) {
    drawLoadingOrderStrip(ctx, pad, y + 4, contentW, loadH - 12, Math.floor(Number(loadingOrder)));
    y += loadH;
  }

  if (showMarks) {
    drawCrateMarks(ctx, width / 2, y + typeH / 2, crateMark);
    y += typeH;
  }

  // Name: as large as the 16-character cap allows, white on red.
  ctx.textAlign = 'center';
  const nameSize = fitFontSize(ctx, nameText, contentW - 24, 148, 60);
  ctx.font = `900 ${nameSize}px ${FONT_STACK}`;
  const fittedName = ellipsize(ctx, nameText, contentW - 24);
  const nameH = nameSize + 36;
  const nameBoxY = y + 8;
  ctx.fillStyle = '#E00000';
  fillRoundRect(ctx, pad, nameBoxY, contentW, nameH, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fittedName, width / 2, nameBoxY + nameH / 2 + 2);
  y = nameBoxY + nameH;

  if (phoneText) {
    ctx.save();
    // Digits must stay left-to-right even when the page direction is RTL.
    ctx.direction = 'ltr';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    const phoneSize = fitFontSize(ctx, phoneText, contentW, 40, 28, '700');
    ctx.font = `700 ${phoneSize}px ${FONT_STACK}`;
    ctx.fillText(phoneText, width / 2, y + phoneH / 2 + 2);
    ctx.restore();
    y += phoneH;
  }

  const height = Math.min(canvas.height, Math.ceil(y + pad));
  const imageData = ctx.getImageData(0, 0, width, height);
  const mirrored = mirrorHorizontal(imageData.data, width, height);
  return {
    width,
    height,
    data: Uint8Array.from(mirrored),
  };
}
