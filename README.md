# fotobooth. receipt kiosk

A single-file browser kiosk for a receipt-style photo booth. Runs on an **Android tablet** in Chrome, captures photos, converts them to dithered black-and-white, and prints them silently to a **Citizen CT-S4000** thermal printer over USB. Includes a PIN-locked admin panel, real scannable QR codes, and daily analytics that persist across restarts.

## Files

- `index.html` — the entire kiosk app (the Playfair font is embedded, so it needs no internet for fonts)
- `sw.js` — the service worker that caches the app on the tablet for offline use (upload alongside `index.html`)
- `fotobooth-relay.js` — optional Node relay, only for the LAN/relay print mode (not needed for USB)

## Why Android (not iPad)

Silent USB printing from a browser needs the **WebUSB API**, which Android Chrome supports and iOS Safari does not. On the iPad the only silent option is a networked printer (WebPRNT) or a small relay box. On Android, the printer plugs straight into the tablet and prints with no dialog and no network.

## Deploy to GitHub Pages

WebUSB only works over **https** (or localhost), so the page can't be opened off the tablet's file system — host it:

1. Create a new GitHub repo (e.g. `fotobooth-kiosk`).
2. Upload **both `index.html` and `sw.js`** to the repo root (the service worker must sit next to the app).
3. Repo **Settings → Pages → Source: `main` branch, `/root`** → Save.
4. Wait ~1 minute; your kiosk is live at `https://<username>.github.io/fotobooth-kiosk/`.
5. (Optional) Add a `kiosk.fotobooth.biz` subdomain via a CNAME, same as your main site.

## Offline use (no network at the venue)

The booth is built to run with **no internet connection**:

- The Playfair Display font is embedded directly in `index.html`, so the design looks right offline (the utility text falls back to the system monospace).
- `sw.js` caches the whole app on the tablet the first time it loads online. After that it opens fully offline — even if you reload or relaunch with no signal.

**One-time setup while you still have internet:** open the kiosk URL on the tablet once, let it load completely, then open it a second time (or reload) so the service worker finishes caching. After that, airplane mode / dead venue Wi-Fi is fine — the app loads and runs from the tablet. Everything (photos, printing, settings) already works without a connection.

**When you update the app:** upload the new `index.html`, then on the tablet reload **twice** while online — once to fetch the new version, once for the service worker to cache it. If you ever see a stale version, that second reload (or clearing the site data in Chrome) fixes it.

## Hardware setup

- **Tablet:** any current-Chrome Android tablet (Samsung Galaxy Tab A/S, Lenovo Tab). Avoid Amazon Fire tablets — their browser doesn't support WebUSB.
- **Cable:** USB-C (tablet) → USB-B (printer).
- **Power:** a **powered USB-C hub** so the tablet charges while the printer is connected all day.
- **Printer:** Citizen CT-S4000, loaded with 112 mm thermal paper.

## First run

1. On the tablet, open your GitHub Pages URL in Chrome.
2. Tap the ⚙ (top-right) → enter PIN (**default `1234`** — change it in admin).
3. Under **Printing**, keep mode on **"Silent · USB direct"**.
4. Tap **Connect printer**, pick the Citizen device in Chrome's prompt, grant access.
5. Tap **Test print** to confirm. Status turns green.
6. Set event name, upload a logo, choose photo count / countdown / dithering.
7. Tap **Done**. Add the page to the home screen and use Android screen-pinning (Settings → Security → Screen pinning) to lock guests into the app.

After the first grant, the app auto-reconnects to the printer on reload — no repeat prompt in normal use.

---

# Admin panel guide

Everything is configured from one place: the admin panel. This section walks through opening it and explains every setting.

## Getting in and out

- **Open:** tap the ⚙ gear icon in the top-right corner of the attract screen.
- **PIN:** enter your PIN (default **`1234`**). The panel fills the whole screen — the attract screen is hidden behind it.
- **Close:** tap **Done** at the top. You return to the attract screen, ready for the next guest.
- Every change saves automatically and survives a tablet restart or browser reload. There's no separate "save" button.

## The settings, in order

### Camera
Chooses and tests the camera guests are photographed with.
- **Camera dropdown** — pick which camera to use. "Default camera" uses the front-facing one, which is what you want on a tablet. The dropdown only shows named cameras *after* you've granted permission once (tap Test camera first).
- **Test camera** — opens a live square preview of the feed and triggers the browser's permission prompt. Always tap this before an event to confirm the camera works and access is granted. The status line below turns green when it's working, or tells you exactly what's wrong (permission denied, no camera, or camera busy in another app).
- **Stop preview** — closes the test feed so it isn't holding the camera open.

### Photos per print
How many photos each guest session captures.
- **1 photo** — a single square photo fills the receipt.
- **4 photos (2×2)** — four photos in a two-by-two grid. Everything else on the receipt stays identical.

### Countdown length
How many seconds the on-screen countdown runs before each photo is taken (1–5 seconds). Longer gives guests more time to pose; 3 is a good default.

### Paper width
Fixed at **112 mm** for the Citizen CT-S4000 — not adjustable. Shown here for reference (104 mm printable, 832 dots at 203 dpi).

### Copies printed automatically
How many identical copies print per session (1–4). Set to 2 if you want both the guest and the host to keep one. Each copy cuts separately.

### Header — event / collaborator PNG
Controls the top of every receipt.
- The **fotobooth.** wordmark is permanent and can't be changed.
- Upload a **transparent PNG** of an event or business name and it prints beside the wordmark as `fotobooth. | your event`. Use the **Clear** button to remove it and print the wordmark alone.
- Best results: a wide transparent-background PNG with dark artwork (it's printed in black on white paper).

### Brightness / Contrast
Two sliders that adjust the photo *before* it's converted to black-and-white. Because thermal printing is pure black or white with no grey, getting these right matters more than on a screen. If prints come out too dark or muddy, raise brightness; if they look flat, raise contrast. Test on real paper — the on-screen preview is only an approximation.

### QR code
A toggle plus two fields that control the QR block in the footer.
- **On** — the QR prints in the footer linking to the address you set, and the event PNG (if any) sits up top beside the wordmark.
- **Off** — no QR. The event PNG moves down into the footer, printed larger, and the header shows the wordmark alone.
- **QR link** — where the QR sends people. The same on every receipt (your website or socials). No upload or internet needed; change it anytime.
- **QR caption** — the small text printed under the QR (default `MADE BY fotobooth.`). Leave blank for none.

### Share button
Controls the on-screen "Get digital copy" button on the result screen.
- **Auto** — shows the button only when the tablet has an internet connection; hides it when offline. Good default.
- **Always on** — always shows the button.
- **Off** — hides it entirely. Useful once the Cloud gallery QR is doing the job of digital delivery, or for a clean print-only booth.

When a guest taps **Get digital copy**, they choose: **everything** (the full receipt design plus the photos), **just the receipt design**, or **just the photo(s)**. For a 4-photo session the photos come as both a 2×2 grid and the four separate images. The booth then opens the tablet's native share sheet (or downloads the files if sharing isn't available).

**Share button vs. Cloud gallery QR:** these are two separate ways to hand over digital copies. The **share button** works from the tablet's own share sheet (sends to apps/accounts on the tablet). The **Cloud gallery** (below) is the scan-your-own-QR path that delivers straight to any guest's phone. Once the gallery is running, you'll likely set the share button to **Off** and let the QR do the work.

### Dithering style
How photos are converted to black-and-white for thermal printing. Each handles the "no grey" limitation differently:
- **Floyd–Steinberg (photo)** — smoothest, most photographic. Best default for faces.
- **Atkinson (crisp)** — higher contrast, cleaner, slightly more stylized. Good in bright light.
- **Hard threshold (graphic)** — pure black/white with no dithering. Bold and graphic; loses detail in faces. Best for logos or high-contrast shots.

Try all three on real prints — they look different on paper than on screen.

### Printing — Citizen CT-S4000
Selects how receipts reach the printer, with connect/test controls.
- **Silent · USB direct** — the normal mode. Printer cabled to the Android tablet, prints with no dialog. Use **Connect printer** to grant access once, then **Test print** to confirm (status turns green). The app auto-reconnects on reload afterward.
- **Silent · Citizen WebPRNT (LAN)** — for a printer with the Ethernet/WebPRNT board on the network. Enter its IP and Test.
- **Silent · local relay** — printer plugged into a Mac/PC/Pi running `fotobooth-relay.js`. Enter that computer's IP and Test.
- **Browser print dialog** — universal fallback that works with any driver but shows a print dialog (one tap per print, not silent).

### Today
Live counts for the current day — **Receipts** printed, **Sessions** run, and **Photos** taken. **Reset today's counts** zeroes them. Counts reset on their own each calendar day.

### Change admin PIN
Sets the code that unlocks this panel (4–6 digits). **Change the default `1234` before your first event** so guests can't get into settings. If you forget it, clearing the browser's site data resets everything to defaults.

---

## Print modes (admin → Printing)

| Mode | Use when | Silent |
|---|---|---|
| USB direct (WebUSB) | printer cabled to the Android tablet | yes |
| Citizen WebPRNT (LAN) | printer has the Ethernet/WebPRNT board | yes |
| Local relay | printer on USB to a Mac/PC/Pi running `fotobooth-relay.js` | yes |
| Browser dialog | fallback / any driver | no (one tap) |

## Notes

- **Persistence:** all settings and today's counts are stored in the browser (localStorage) and survive restarts. Clearing the site's browser data resets everything (including the PIN) to defaults.
- **Privacy / offline:** photos never leave the tablet, and the QR points at a fixed link rather than a per-guest gallery. The booth is fully self-contained and needs no internet at the event — only for the initial page load.
- **Kiosk lockdown:** after setup, add the page to the home screen and turn on Android screen-pinning (Settings → Security → Screen pinning) so guests stay in the app.

## Later: digital gallery

Currently the receipt is the keepsake and the QR points at your site/socials — no photos are stored off-device. If you ever want guests to download their photos, that needs the photos to be uploaded somewhere (cloud storage + a gallery page + reliable venue internet). It's a separate, larger piece; the current design deliberately avoids it for offline reliability. When you're ready, the QR link is already editable in admin, so pointing it at a gallery later is a one-field change.
