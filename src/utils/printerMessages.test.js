import { CARTON_PRINT_TEXT, PRINTER_MESSAGES, printerErrorText } from './printerMessages';

const { readFileSync } = require('fs');
const path = require('path');

// Every code the Electron side can hand back to the screen.
const SERVICE_CODES = [
  'no_printer', 'busy', 'need_winusb', 'no_usb_module', 'no_media', 'cover_open', 'timeout', 'print_failed',
  'wrong_media', 'media_end', 'cutter_jam', 'buffer_full', 'system_error', 'turned_off', 'communication_error',
  'already_printing', 'no_electron', 'editor_lite',
];


test('every printer code has a Hebrew and a Thai message', () => {
  SERVICE_CODES.forEach((code) => {
    expect(PRINTER_MESSAGES.he[code]).toBeTruthy();
    expect(PRINTER_MESSAGES.th[code]).toBeTruthy();
  });
  expect(Object.keys(PRINTER_MESSAGES.th).sort()).toEqual(Object.keys(PRINTER_MESSAGES.he).sort());
});

test('codes the raster module and the service emit are all covered', () => {
  const root = path.join(__dirname, '..', '..', 'electron', 'services');
  const raster = readFileSync(path.join(root, 'ql800Raster.js'), 'utf8');
  const service = readFileSync(path.join(root, 'printerService.js'), 'utf8');
  // Status bits (errors.push('x')), progress results ({action: 'error', code: 'x'}), and the service's {code: 'x'} returns.
  const emitted = [
    ...[...raster.matchAll(/errors\.push\('([a-z_]+)'\)/g)].map((match) => match[1]),
    ...[...raster.matchAll(/code: '([a-z_]+)'/g)].map((match) => match[1]),
    ...[...service.matchAll(/code: '([a-z_]+)'/g)].map((match) => match[1]),
    ...[...service.matchAll(/err\.code = '([a-z_]+)'/g)].map((match) => match[1]),
  ];
  const codes = [...new Set(emitted)];
  expect(codes.length).toBeGreaterThan(10);
  codes.forEach((code) => {
    expect({ code, he: Boolean(PRINTER_MESSAGES.he[code]), th: Boolean(PRINTER_MESSAGES.th[code]) })
      .toEqual({ code, he: true, th: true });
  });
});

test('unknown codes fall back, and the service detail is appended', () => {
  expect(printerErrorText('he', 'something_new')).toBe(PRINTER_MESSAGES.he.print_failed);
  expect(printerErrorText('th', 'no_media', 'No DK roll loaded')).toBe(`${PRINTER_MESSAGES.th.no_media} — No DK roll loaded`);
  expect(printerErrorText('he', 'timeout', 'timeout')).toBe(PRINTER_MESSAGES.he.timeout);
});

test('station texts exist in both languages', () => {
  expect(Object.keys(CARTON_PRINT_TEXT.th).sort()).toEqual(Object.keys(CARTON_PRINT_TEXT.he).sort());
  expect(CARTON_PRINT_TEXT.he.labelOutQuestion(3)).toContain('קרטון 3#');
  expect(CARTON_PRINT_TEXT.th.labelOutQuestion(3)).toContain('3#');
});
