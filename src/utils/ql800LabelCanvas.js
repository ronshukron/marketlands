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

/**
 * 62 mm QL-800 label:
 *   [order number huge]     [community]
 *   קרטון 1#
 *   [name huge, white on red]
 */
export function renderQl800Label({
  customerNumber,
  name,
  community,
  crateIndex,
} = {}) {
  const width = QL800_PRINT_WIDTH;
  const pad = 12;
  const communityColW = 220;
  const numberText = String(customerNumber == null || customerNumber === '' ? '-' : customerNumber);
  const nameText = String(name || '-');
  const communityText = String(community || '-');
  const cartonText = cartonLabelText(crateIndex);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 560;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D is not available');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.textBaseline = 'middle';

  const topH = 190;
  const cartonH = 78;
  const nameMaxW = width - pad * 2;

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  const numberSize = fitFontSize(ctx, numberText, width - communityColW - pad * 2, 176, 80);
  ctx.font = `900 ${numberSize}px ${FONT_STACK}`;
  ctx.fillText(numberText, pad, pad + topH / 2);

  ctx.textAlign = 'right';
  const communitySize = fitFontSize(ctx, communityText, communityColW, 64, 36, '700');
  ctx.font = `700 ${communitySize}px ${FONT_STACK}`;
  ctx.fillText(ellipsize(ctx, communityText, communityColW), width - pad, pad + topH / 2);

  const cartonY = topH + cartonH / 2;
  ctx.textAlign = 'center';
  const cartonSize = fitFontSize(ctx, cartonText, nameMaxW, 72, 40, '800');
  ctx.font = `800 ${cartonSize}px ${FONT_STACK}`;
  ctx.fillStyle = '#000000';
  ctx.fillText(cartonText, width / 2, cartonY);

  ctx.textAlign = 'center';
  const nameSize = fitFontSize(ctx, nameText, nameMaxW - 20, 118, 52);
  ctx.font = `900 ${nameSize}px ${FONT_STACK}`;
  const fittedName = ellipsize(ctx, nameText, nameMaxW - 20);
  const nameW = Math.min(nameMaxW, Math.max(ctx.measureText(fittedName).width + 40, width * 0.88));
  const nameH = nameSize + 40;
  const nameBoxX = pad + (nameMaxW - nameW) / 2;
  const nameBoxY = topH + cartonH + 8;
  ctx.fillStyle = '#E00000';
  fillRoundRect(ctx, nameBoxX, nameBoxY, nameW, nameH, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fittedName, nameBoxX + nameW / 2, nameBoxY + nameH / 2 + 2);

  const height = Math.min(canvas.height, nameBoxY + nameH + pad);
  const imageData = ctx.getImageData(0, 0, width, height);
  const mirrored = mirrorHorizontal(imageData.data, width, height);
  return {
    width,
    height,
    data: Uint8Array.from(mirrored),
  };
}
