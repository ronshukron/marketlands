# Brother QL-800 — station setup

This printer talks to **B2C Desktop** (Electron) over USB. Do **not** treat it like a normal Windows printer.

One QL-800 per packing PC. You can unplug it and move it to another station; the app finds it by USB id (`VID 04F9` / `PID 209B`). No COM port setup.

## 1. Do not install the Brother Windows driver

The official Brother driver claims the USB interface and **blocks** the desktop app (`LIBUSB_ERROR_BUSY`).

- Skip Brother’s installer / P-touch Editor. They are not needed for station labels.
- If a PC already has the driver:
  1. Settings → Bluetooth & devices → Printers & scanners → Brother QL-800 → Remove.
  2. Or Device Manager → Printers → uninstall the QL-800 device.

## 2. Hardware

1. Power the printer and connect USB.
2. **Editor Lite green LED must be off.** Hold the Editor Lite button (P-touch icon) until the light goes out. If Windows opens a USB flash drive, Editor Lite is still on and labels will not print.
3. Load **62 mm** tape:
   - **DK-22205** (black on white continuous) — preferred
   - **DK-22251** (black + red starter roll) — also works; printing is slower
   - The 29×90 mm address starter roll works but the type will look small
4. Close P-touch Editor if it is open.

Even without Brother’s own installer, **Windows often binds a generic USB printer driver** (`usbprint.sys`) as soon as it sees a printer-class device. That still blocks Electron. If the app says USB is busy / not supported:

1. Download [Zadig](https://zadig.akeo.ie/).
2. Options → List All Devices.
3. Select the QL-800.
4. Target driver: **WinUSB** → Replace Driver.

Do this on every packing PC. You still should **not** install Brother’s P-touch driver.

## 4. App

1. Install or update **B2C Desktop**.
2. Navigate → **Delivery V7 (Stations)** (`Ctrl+Shift+V`).
3. Select an order. The carton number starts at `1` and can be edited.
4. Tap the large **הדפס מדבקה** square. Each tap prints `קרטון 1#`, then `קרטון 2#`, and so on. Edit the number to reprint.
5. Use **הצג מדפסת** for status and a test print.

## Moving the printer

Plug into the next PC, Editor Lite off, same app. No extra pairing beyond Windows allowing the USB device.

## If nothing prints

| Symptom | Fix |
| --- | --- |
| Green Editor Lite LED | Hold the button until it is off |
| “Printer busy” / access error | Remove Brother driver; Zadig WinUSB if needed |
| Printer not found | Cable, power, Editor Lite off |
| Cover open / no media | Close cover; load a DK roll |
