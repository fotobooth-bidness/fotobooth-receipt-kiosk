# fotobooth. cloud gallery — setup

This is the optional cloud piece that lets guests **scan a QR and download their own photos**.
It runs on Cloudflare (R2 storage + a Worker) under `gallery.fotobooth.biz`. The booth works
fully without it — this only adds scan-to-download when you have internet at the venue.

## What it does

- The tablet uploads each session (receipt design + photos) to your R2 bucket.
- Each session gets a short link like `https://gallery.fotobooth.biz/g/ab3x9k`.
- The result screen shows that as a QR; the guest scans, sees their photos, and picks which to download.
- Photos **auto-delete after 30 days** (an R2 lifecycle rule).
- You can download a **zip of an entire event** from a private link.

## One-time setup

You'll need the free Cloudflare CLI, `wrangler`. Install Node, then in this `gallery/` folder:

```
npm install -g wrangler
wrangler login
```

### 1. Create the R2 bucket
```
wrangler r2 bucket create fotobooth-gallery
```
(The name matches `wrangler.toml`. If you change it, change it in both places.)

### 2. Set your private export key
This protects the "download whole event" link so only you can use it. Pick a long random string.
```
wrangler secret put EXPORT_KEY
```
Paste your secret when prompted. Keep it somewhere safe.

### 3. Deploy the Worker
```
wrangler deploy
```

### 4. Point gallery.fotobooth.biz at the Worker
In the Cloudflare dashboard: **Workers & Pages → fotobooth-gallery → Settings → Domains & Routes
→ Add → Custom domain →** enter `gallery.fotobooth.biz`. Cloudflare creates the DNS automatically
(fotobooth.biz is already on Cloudflare, so this is a couple of clicks).

### 5. Turn on 30-day auto-delete
Dashboard: **R2 → fotobooth-gallery → Settings → Object lifecycle rules → Add rule →**
delete objects **30 days** after creation. Apply to the whole bucket.

## Turn it on in the booth

In the kiosk admin panel (**Cloud gallery** section):
1. Toggle **Cloud gallery** on.
2. Confirm the URLs (pre-filled):
   - Upload URL: `https://gallery.fotobooth.biz/upload`
   - Gallery base URL: `https://gallery.fotobooth.biz/g/`
3. Set the **Event name** for the event you're running (e.g. `priya-marcus`). This groups the
   photos and names your export zip.

Now, when the tablet has internet, each session uploads and the guest gets a scan-to-download QR.
With no internet (or the toggle off), the booth just prints — no QR, no error.

## Your live gallery address

This gallery is currently deployed at:
```
https://fotobooth-gallery.fotobooth-biz.workers.dev
```
(This is a Cloudflare-provided address. The prettier `gallery.fotobooth.biz` isn't attached yet
because that requires the domain's DNS to be managed by Cloudflare — it's currently at
Namecheap. The gallery works fully on the address above; the custom domain is a cosmetic
upgrade for later, not something guests need.)

## Browse an event yourself (thumbnail view)

Visit this private link (needs your EXPORT_KEY):
```
https://fotobooth-gallery.fotobooth-biz.workers.dev/browse/<event-name>?key=YOUR_EXPORT_KEY
```
e.g. `https://fotobooth-gallery.fotobooth-biz.workers.dev/browse/priya-marcus?key=xxxxxxxx`

Shows every session from that event as a thumbnail grid, newest first. Tap any thumbnail to open
that session's own guest gallery page, where you can view full-size and download individual
photos. This page isn't linked anywhere public — only reachable with your export key.

## Download a whole event as a zip (for you)

Visit this private link (needs your EXPORT_KEY):
```
https://fotobooth-gallery.fotobooth-biz.workers.dev/export/<event-name>?key=YOUR_EXPORT_KEY
```
e.g. `https://fotobooth-gallery.fotobooth-biz.workers.dev/export/priya-marcus?key=xxxxxxxx`

It streams back `priya-marcus.zip` with every photo and receipt from that event, organized into
two folders:

```
priya-marcus.zip
├── Receipts/
│   ├── ab3x9k.png            (the printed receipt design for that session)
│   ├── ab3x9k-grid.png       (2×2 grid, only for 4-photo sessions)
│   └── ...one pair per session
└── Photos/
    ├── ab3x9k-1.png          (individual photo(s) from that session)
    ├── ab3x9k-2.png
    └── ...one set per session
```

Each file is tagged with its session id so photos from different sessions never collide or
overwrite each other, even once they're all sitting together in one folder. Keep the key
private — anyone with the link can download that event.

## Costs

R2 free tier: 10 GB storage and no egress fees. At photo-booth volumes you'll almost certainly
stay at $0/month. Photos auto-clear at 30 days, so storage stays small.

## Notes / limits

- Uploading full-size photos over a venue hotspot can be slow; the booth uploads in the background
  and simply skips the QR if the upload doesn't complete, so a bad connection never blocks a guest.
- The export zip is "stored" (uncompressed) because PNGs are already compressed — this keeps it
  streaming with flat memory, so even large events export reliably.
- To wipe an event early, delete its folder (`events/<event>/`) in the R2 dashboard.
