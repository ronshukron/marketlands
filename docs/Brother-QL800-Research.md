# Brother QL-800 — research notes for station label printing

Context for later planning and implementation. Not a design or implementation plan.

**Target use:** attach a QL-800 to packing stations so that when a worker starts an order, the station prints a label with order number, customer name, community, and room to add fields later. Prefer the largest readable type the printer can physically produce.

**App context:** packing stations run this React UI **inside Electron** (`electron/main.js`, contextIsolation + preload). Hardware already follows that pattern: the scale is a main-process service (`electron/services/scaleService.js`) exposed as `window.electron.scale`. Label printing should be the same shape, not a browser USB workaround. Delivery V7 stations already have a stable `deliveryV7::stationId` in `localStorage`. There is no existing print/label code.

---

## 1. What this printer is

The QL-800 is a **USB-only desktop thermal label printer**. Direct thermal: no ink, toner, or ribbon for black-on-white DK paper. It prints on Brother **DK rolls** (die-cut labels or continuous tape), 12–62 mm wide, with a built-in full cutter.

| Item | QL-800 |
| --- | --- |
| Connectivity | USB 2.0 Full Speed, Type B only. **No Wi-Fi, LAN, Bluetooth, or AirPrint.** |
| Print head | 300 dpi, **720 pins** |
| Resolution | 300×300 dpi standard; 300×600 dpi high-res (feed direction only) |
| Max print width | **58 mm** (marketing); raster tables use **58.9 mm / 696 dots** on 62 mm tape |
| Max print length | **1000 mm / 11,811 dots** at 300 dpi (continuous tape) |
| Print speed | Up to 148 mm/s black; **24 mm/s** if black+red |
| Cutter | Automatic full cut |
| Size / weight | 125.3 × 213 × 142 mm, 1.15 kg |
| In the box | USB cable, power, starter **DK-11201** (29×90 mm address, 100 labels), starter **DK-22251** (62 mm black+red continuous, 5 m) |

**Series trap:** QL-810W and QL-820NWB look similar but add Wi-Fi / LAN / Bluetooth, AirPrint, onboard fonts, ESC/P, and P-touch Template. **Do not copy those APIs for this model.** Official Brother USA developer page lists QL-800 tools as **b-PAC SDK + Android SDK** only. Raster is still the real wire protocol (see §4).

---

## 2. Critical hardware facts for software

### 2.1 No onboard fonts (GDI / bitmap printer)

Brother datasheets list **Internal fonts: none** for QL-800. Same class as QL-700: the printer does not store typefaces or barcodes. Every character is rendered on the host as a bitmap and sent as raster dots.

Implication for “biggest font available in this printer”:

- There is **no printer font size menu** to max out.
- Maximum type size = **fill the printable area** with a host-rendered TrueType/OpenType face (including Hebrew).
- P-touch Editor can use any Windows TrueType font. Raster libraries do the same via canvas / PIL / Skia.

### 2.2 Editor Lite mode (will silently block printing)

Front panel has an **Editor Lite** button and green LED. When the LED is on, the printer re-enumerates as a **USB mass-storage drive** with a tiny P-touch Editor Lite. Raster print jobs are **discarded**. This cannot be flipped from software.

**Station SOP:** hold Editor Lite until the green LED is **off** before using the printer with the app or a driver.

### 2.3 USB identity

| | |
| --- | --- |
| Vendor ID | `0x04F9` (Brother) |
| Product ID (printer mode) | `0x209B` |
| Endpoints | Bulk OUT (print data), Bulk IN (32-byte status), max packet 64 bytes |
| Device URI (community drivers) | `usb://0x04f9:0x209b` |

Mass-storage PID while Editor Lite is on is not well documented for QL-800; treat “device looks like a flash drive” as Editor Lite.

### 2.4 QL-800 firmware limits vs later QL-8xx

From Brother *Raster Command Reference QL-800/810W/820NWB v1.01*:

- **No TIFF/PackBits compression** (`M 02` / `Z` blank-line opcode). Send uncompressed raster. Later QL-810W/820NWB do support compression.
- **Two-color** black+red is supported (`w` opcode), only with **DK-22251**.
- If DK-22251 is loaded and the job does **not** set the two-color bit, firmware returns **replace media** even for a black-only image. Set two-color mode whenever that roll is in the printer.
- Invalidate padding: manual specifies **400** leading `0x00` bytes for this chassis (community drivers often use 200; 400 is safer on QL-800).

---

## 3. Media (what to load at stations)

Two families: **die-cut** (fixed size, sensor finds the gap) and **continuous** (cutter sets length, up to 1 m).

### 3.1 Most relevant rolls

| SKU | Kind | Size | Why it matters |
| --- | --- | --- | --- |
| **DK-22205** | Continuous paper | 62 mm × 30.48 m | Best default for “big type + more fields later”. Length is free. |
| **DK-11202** | Die-cut shipping | 62 × 100 mm | Fixed large label, consistent size, 300/roll. |
| DK-22251 | Continuous 2-color | 62 mm | Box starter. Black+red. Slower. Two-color flag required. |
| DK-11201 | Die-cut address | 29 × 90 mm | Box starter. Too narrow for huge type + 3 fields. |
| DK-44205 | Continuous removable | 62 mm | Same geometry as DK-22205, easier to peel/reposition. |

Printable width on 62 mm stock: **696 dots** (~58.9 mm), with **12 pins** left and right unused on the 720-pin head.

### 3.2 Raster geometry (300 dpi)

Continuous tape printable widths (print-area pins):

| Tape | Left margin pins | Print pins | Right margin pins | Bytes/row |
| --- | --- | --- | --- | --- |
| 12 mm | 585 | 106 | 29 | 90 |
| 29 mm | 408 | 306 | 6 | 90 |
| 38 mm | 295 | 413 | 12 | 90 |
| 50 mm | 154 | 554 | 12 | 90 |
| 54 mm | 130 | 590 | 0 | 90 |
| **62 mm** | **12** | **696** | **12** | **90** |

Continuous length:

- Min ~12.7 mm / 150 dots
- Max **1000 mm / 11,811 dots**
- End margins (feed): min **3 mm / 35 dots**, max 127 mm / 1500 dots. Typical jobs use ~35 dots so the cutter can land.

Die-cut length is fixed; send margin amount `0`.

Media IDs used by raster “print information” and by `@thermal-label` / `brother_ql`: **259** = 62 mm continuous. Die-cut 62×100 mm is commonly **362**. Confirm against the library’s `MEDIA` table at implementation time.

---

## 4. How printing actually works

The printer defaults to ESC/P command mode. Raster jobs must send `ESC i a 01` first. A job is a byte stream on USB Bulk OUT:

1. Invalidate (`0x00` × ~400)
2. Switch to raster mode + initialize
3. Per page: media/size (`ESC i z`), autocut, expanded mode, feed margin
4. One raster row per dot-row (`g` = black, or `w` black then `w` red)
5. `FF` (`0x0C`) between pages; **`Control-Z` (`0x1A`) on the last page** (ending with `FF` leaves the last page unprinted)

Status is a **32-byte** reply to `ESC i S`. Useful bits: no media, cover open, cutter jam, wrong media, media width/type (so the app can detect 62 mm vs 29 mm). Model code in the status frame for QL-800 is `0x38` (`'8'`).

Official manual:

- [Raster Command Reference QL-800/810W/820NWB v1.01 (PDF)](https://download.brother.com/welcome/docp100278/cv_ql800_eng_raster_101.pdf)
- Readable protocol summary: [thermal-label QL raster protocol](https://thermal-label.github.io/brother-ql/protocol/ql)

Community note: the manual and field drivers disagree on which `ESC i K` bit enables 300×600 dpi (manual bit 6 vs observed bit 4). Prefer a maintained encoder (`@thermal-label/brother-ql-core` or `brother_ql`) instead of hand-rolling high-res.

---

## 5. “Biggest font” — practical limits

Because the host draws the bitmap:

| Axis | Limit at 300 dpi | Rough type size |
| --- | --- | --- |
| Across the tape (62 mm) | 696 dots ≈ 58.9 mm | ~**164 pt** if a glyph is as tall as the tape |
| Along the tape | up to 11,811 dots ≈ 1000 mm | essentially unlimited for a few words |

**Largest readable packing label:** use **62 mm continuous**, treat the **58.9 mm print width as the text height**, and let the cutter set length from the text width (rotate 90° relative to the tape). Order number can then be ~50–58 mm tall. Name and community go on extra lines at a smaller size, or after the number along the length.

If the label must stay “portrait” (tape width = label width, feed = label height), the order number cannot exceed ~58 mm in the *width* of the label; height is then whatever length we cut.

Hebrew: raster is pixels, so RTL is a **rendering** problem (canvas / `direction: rtl` / a Hebrew-capable face such as Rubik), not a printer problem. QL-800 will not help with shaping or bidi.

High-res 300×600 only doubles resolution **along the feed**. It does not make type wider across the tape. Skip it unless small barcodes look muddy.

---

## 6. Integration path for this Electron app

Stations already run Electron. The renderer is sandboxed (`nodeIntegration: false`, `contextIsolation: true`), so **the React UI still cannot open USB itself**. The **main process can**, the same way the scale does today.

**We do not need** WebUSB in Chrome, a separate localhost print agent, or Brother b-PAC / `.lbx` templates. Electron’s main process *is* the print agent.

Recommended shape (mirrors the scale):

1. `electron/services/labelPrinterService.js` — find the QL-800 (`VID 0x04F9` / `PID 0x209B`), render a 300 dpi bitmap, send Brother raster, cut.
2. IPC in `electron/main.js` — e.g. `printer:print-label`, `printer:status`.
3. `electron/preload.js` — `window.electron.printer.printLabel({ orderNumber, name, community })`.
4. A React hook in the station UI, used when a worker starts an order. No-op / hide the button when not in Electron.

Library to prefer in main: [`@thermal-label/brother-ql-node`](https://www.npmjs.com/package/@thermal-label/brother-ql-node) (QL-800 USB verified). It talks **USB printer class**, not a COM port.

**The QL-800 is not like the Shekel scale.** The scale is USB-serial (`serialport` / `COMx`). The QL-800 is a USB printer (`usb` / libusb). `SerialPort.list()` will not show it as a usable COM device for raster printing.

Windows USB caveat (only remaining ops issue):

- If the official Brother driver is installed, it can **claim the USB interface** and block Node `usb` / libusb (`LIBUSB_ERROR_BUSY` / device not listed).
- Raw raster from Electron then needs WinUSB (Zadig) **or** not installing the Brother driver.
- Alternative we should **not** default to: `webContents.print({ silent: true, deviceName: 'Brother QL-800' })`. That uses the Windows spooler and HTML page sizes. Margins, 62 mm width, and autocut are unreliable for this printer.

Editor Lite LED off still applies. Close P-touch Editor so it does not hold the USB device.

Do not use: AirPrint, onboard ESC/P text (no fonts), P-touch Template-in-printer mode.

---

## 7. Station mapping (product, not printer)

Delivery V7 already identifies a physical PC as a station (`deliveryV7::stationId`). Label printing should key off that:

- One QL-800 **USB-attached to that PC**, not selected from a cloud printer list.
- Pair/connect once per station via Electron main-process USB (persist last device id if more than one QL is ever plugged in).
- Print trigger: “worker starts / claims a new order” — after we know order number, name, community.
- Later fields (route, fridge, item count, barcode) are extra raster lines or a longer continuous cut; no firmware change.

Do not assume one printer is shared across stations. USB-only means **one printer per station PC**.

---

## 8. Suggested first label (research recommendation)

Not a locked design; a sane default given the hardware:

- Media: **DK-22205 62 mm continuous** (or leftover DK-22251 with two-color enabled).
- Orientation: **rotated** so order number uses most of the 696-dot width.
- Content, large → small: order number, name, community.
- Autocut every label; ~3 mm feed margins.
- Render Hebrew + Latin on a canvas at 300 dpi, then send raster.

Starter DK-11201 (29×90) is usable for a prototype but will look small. Switch to 62 mm before packing-floor rollout.

---

## 9. Ops checklist (will bite during implementation)

1. Editor Lite LED **off**.
2. Confirm loaded roll width (status byte or a test print) matches the job media ID.
3. DK-22251 → two-color flag on.
4. Do not leave P-touch Editor open (USB exclusive).
5. Electron main-process USB on Windows: official Brother driver **or** WinUSB (Zadig), not both. The packaged app needs the native `usb` module rebuilt for Electron (`electron-builder install-app-deps` already runs on postinstall).
6. Renderer never talks USB; only `window.electron.printer` IPC.
7. Thermal paper: avoid long sunlight/heat; not archival.

---

## 10. Official and community links

| Resource | URL |
| --- | --- |
| EU datasheet (series comparison, DK catalog) | https://www.brother.eu/-/media/product-downloads/devices/label-printers/ql/ql-800/en/ql-800-datasheet.pdf |
| US specs | https://support.brother.com/g/b/spec.aspx?c=us&lang=en&prod=lpql800eus |
| Raster command PDF | https://download.brother.com/welcome/docp100278/cv_ql800_eng_raster_101.pdf |
| Command reference index | https://support.brother.com/g/s/es/dev/en/command/reference/index.html |
| Brother developer / b-PAC | https://support.brother.com/g/s/es/dev/en/bpac/download/index.html |
| Brother USA labelling developer program | https://developerprogram.brother-usa.com/labelling-and-mobile-developer-program |
| DK consumables list | https://support.brother.com/g/b/colist.aspx?c=eu_ot&cao=roll&lang=en&prod=lpql800euk |
| QL-800 hardware (thermal-label, verified) | https://thermal-label.github.io/hardware/brother-ql/ql-800 |
| WebUSB guide | https://thermal-label.github.io/brother-ql/web |
| Troubleshooting (Editor Lite, Windows drivers) | https://thermal-label.github.io/brother-ql/troubleshooting |

---

## 11. Open questions for planning (do not block this research file)

- Which roll will stations stock long-term (DK-22205 vs DK-11202 vs leftover DK-22251)?
- Auto-detect the USB QL-800 vs a one-time “Connect printer” in station settings?
- Exact fields on v1 vs later (barcode, route, date)?
- Hebrew-only, or mixed Hebrew/English names?

---

*Researched August 2026. Specs from Brother datasheet/manuals and thermal-label verification of QL-800 USB (`0x04f9:0x209b`). Firmware and SKUs can change; re-check the raster PDF and `MEDIA` tables before coding.*
