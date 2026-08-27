# fotobooth. receipt kiosk

A single-file browser kiosk for a receipt-style photo booth. Runs on an **Android tablet** in
Chrome, captures photos, converts them to dithered black-and-white, and prints them silently to
a **Citizen CT-S4000** thermal printer over USB. Includes a PIN-locked admin panel, real
scannable QR codes, a live cloud photo gallery, and daily analytics that persist across restarts.

Live at **https://kiosk.fotobooth.biz**.

## Files

- `index.html` — the entire kiosk app. The Playfair font and the QR code generator are both
  embedded directly in the file, so the booth needs no internet connection to look or function
  correctly once loaded (see **Offline use** below).
- `sw.js` — the service worker that caches the app on the tablet for offline use. Must sit next
  to `index.html` in this repo for offline mode to work.

The Cloudflare gallery Worker (`worker.js`, `wrangler.toml`) is a **separate project**, deployed
independently to Cloudflare — it does not live in this repo. See **Cloud gallery** below.

## Why Android (not iPad)

Silent USB printing from a browser needs the **WebUSB API**, which Android Chrome supports and
iOS Safari does not. On the iPad the only silent option is a networked printer (WebPRNT) or a
small relay box. On Android, the printer plugs straight into the tablet and prints with no
dialog and no network.

## Hosting

Hosted on **GitHub Pages** from the `main` branch, `/root` folder, with the custom domain
`kiosk.fotobooth.biz` (set in **Settings → Pages**, backed by a `CNAME` file in this repo and a
DNS CNAME record `kiosk` → `<username>.github.io` at Namecheap).

The kiosk was originally on the root domain (`fotobooth.biz`) but was moved to
`kiosk.fotobooth.biz` to free up the root domain for the **booking site** (separate repo — see
its own README). The two sites are fully independent: nothing about one can break the other.

WebUSB only works over **https** (or localhost), so the page can't be opened off the tablet's
file system — it must be served over https, which GitHub Pages provides.

To update the app: upload the new `index.html` (and `sw.js` if changed), commit to `main`, and
GitHub Pages rebuilds within about a minute.

## Offline use (no network at the venue)

The booth is built to run with **no internet connection**:

- The Playfair Display font is embedded directly in `index.html`.
- The QR code generator (both the printed website QR and the on-screen gallery QR) is a
  self-contained library embedded in `index.html` — no internet needed to generate scannable
  codes.
- `sw.js` caches the whole app on the tablet the first time it loads online. After that it opens
  fully offline — even if you reload or relaunch with no signal.

**One-time setup while you still have internet:** open the kiosk URL on the tablet once, let it
load completely, then open it a second time (or reload) so the service worker finishes caching.
After that, airplane mode / dead venue Wi-Fi is fine for capturing and printing. The **Cloud
gallery** (below) is the one feature that needs a live connection at the moment of use — without
internet, the booth just prints normally with no gallery QR.

**When you update the app:** upload the new `index.html`, then on the tablet reload **twice**
while online — once to fetch the new version, once for the service worker to cache it. If you
ever see a stale version, that second reload (or clearing the site data in Chrome) fixes it.

## Hardware setup

- **Tablet:** any current-Chrome Android tablet (currently a Samsung Galaxy Tab S9 FE). Avoid
  Amazon Fire tablets — their browser doesn't support WebUSB.
- **Cable:** USB-C (tablet) → USB-B (printer).
- **Power:** a **powered USB-C hub** so the tablet charges while the printer is connected all day.

## Admin panel

Open the admin panel with the on-screen gesture/PIN. From there:

- **Countdown, copies, camera** — capture behavior.
- **Brightness / contrast / dithering style** — how photos convert to black-and-white for the
  thermal printer. **Floyd–Steinberg** (the default) gives the most photographic result and is
  the recommended setting for faces; **Atkinson** is a crisper, higher-contrast alternative worth
  trying if prints look too dark or muddy. Screen colors are only an approximation of the
  thermal output — judge dithering on a physical test print, not the screen.
- **Printed QR** — small, bottom-center on the receipt, linking to the main website
  (`fotobooth.biz` by default). Independent of the gallery QR below.
- **Share button** — the on-screen "Get digital copy" button (Auto / Always on / Off). Uses the
  tablet's own share sheet. Once the Cloud gallery is reliable at your events, this is usually
  set to **Off**, since the gallery QR replaces it.
- **Cloud gallery** — see below.

Settings persist on the tablet across restarts.

## Cloud gallery

Guests scan a QR on the result screen to view and download their own photos from that session —
separate from the small printed QR, which always points to the website.

- **Status:** deployed and live.
- **Backend:** a Cloudflare Worker + R2 storage bucket (`fotobooth-gallery`), currently reachable
  at `https://fotobooth-gallery.fotobooth-biz.workers.dev` (a Cloudflare-provided address; the
  domain's DNS is at Namecheap, not Cloudflare, so the prettier `gallery.fotobooth.biz` address
  is not yet attached — see the gallery project's own README for what that would take).
- **How it works:** when **Cloud gallery** is toggled on in admin and the tablet has internet,
  each session uploads its photos to the Worker and the result screen shows a real QR linking to
  a private gallery page for that session, where the guest picks which images to download.
  Photos are grouped by the **event name** set in admin.
- **Auto-delete:** photos are removed automatically after 30 days.
- **Downloading a whole event yourself:** visit
  `https://fotobooth-gallery.fotobooth-biz.workers.dev/export/<event-name>?key=YOUR_EXPORT_KEY`
  to get a zip of every photo from that event. The export key was set during deployment — keep
  it private.
- **Requires internet on the tablet.** With no connection, the booth just prints normally and no
  gallery QR appears — nothing breaks.

## Troubleshooting notes (things that have come up)

- **Camera shows a black screen:** usually means the video stream started but never actually
  played — the app explicitly calls `play()` and falls back to the default camera if a saved
  camera selection fails, to guard against this.
- **QR codes:** the app uses a proven, standard QR-generation library. An earlier hand-written
  version worked for short URLs (like the printed website link) but produced malformed,
  unscannable codes for longer URLs (like gallery links) — this was replaced, and both QR types
  are now verified scannable.
