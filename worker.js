/* ============================================================
   fotobooth. gallery Worker  (Cloudflare Workers + R2)
   ------------------------------------------------------------
   Routes:
     POST /upload            tablet uploads one session; returns { id }
     GET  /g/<id>            guest gallery page (pick & download)
     GET  /photo/<id>/<name> serves an individual stored image
     GET  /export/<event>?key=SECRET   streaming ZIP of a whole event (private)

   Storage layout in R2:
     events/<event>/<id>/receipt.png
     events/<event>/<id>/grid.png            (only for 4-photo sessions)
     events/<event>/<id>/photo-1.png ...
     index/<id>.json                          (points id -> event + file list)

   Setup (see SETUP notes at bottom):
     - Bind an R2 bucket as  BUCKET
     - Set a secret  EXPORT_KEY  (wrangler secret put EXPORT_KEY)
     - Optional: set  ALLOW_ORIGIN  var to your kiosk origin for tighter CORS
   ============================================================ */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = corsHeaders(request, env);

    // CORS preflight for the upload endpoint
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    try {
      if (request.method === 'POST' && path === '/upload') {
        return await handleUpload(request, env, cors);
      }
      if (request.method === 'GET' && path.startsWith('/g/')) {
        return await handleGallery(request, env, path.slice(3));
      }
      if (request.method === 'GET' && path.startsWith('/photo/')) {
        return await handlePhoto(request, env, path.slice('/photo/'.length));
      }
      if (request.method === 'GET' && path.startsWith('/export/')) {
        return await handleExport(request, env, url);
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      return new Response('Error: ' + (err && err.message ? err.message : String(err)), { status: 500 });
    }
  }
};

/* ---------------- helpers ---------------- */

function corsHeaders(request, env) {
  const allow = (env && env.ALLOW_ORIGIN) ? env.ALLOW_ORIGIN : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

// short, url-safe id
function makeId(n = 8) {
  const cs = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  for (let i = 0; i < n; i++) s += cs[arr[i] % cs.length];
  return s;
}

// keep event names filesystem/URL safe
function slug(s) {
  return (s || 'event').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
}

// data URL -> Uint8Array
function dataUrlToBytes(dataUrl) {
  const i = dataUrl.indexOf(',');
  const b64 = dataUrl.slice(i + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
  return bytes;
}

/* ---------------- POST /upload ---------------- */
/* Body JSON: { event, receipt (dataURL), grid (dataURL|null), photos: [dataURL,...] } */
async function handleUpload(request, env, cors) {
  const body = await request.json();
  const event = slug(body.event);
  const id = makeId();
  const base = `events/${event}/${id}/`;
  const files = [];

  if (body.receipt) {
    await env.BUCKET.put(base + 'receipt.png', dataUrlToBytes(body.receipt), { httpMetadata: { contentType: 'image/png' } });
    files.push('receipt.png');
  }
  if (body.grid) {
    await env.BUCKET.put(base + 'grid.png', dataUrlToBytes(body.grid), { httpMetadata: { contentType: 'image/png' } });
    files.push('grid.png');
  }
  if (Array.isArray(body.photos)) {
    for (let i = 0; i < body.photos.length; i++) {
      const name = `photo-${i + 1}.png`;
      await env.BUCKET.put(base + name, dataUrlToBytes(body.photos[i]), { httpMetadata: { contentType: 'image/png' } });
      files.push(name);
    }
  }

  // small index record so /g/<id> can find the files without knowing the event
  const rec = { id, event, files, ts: Date.now() };
  await env.BUCKET.put(`index/${id}.json`, JSON.stringify(rec), { httpMetadata: { contentType: 'application/json' } });

  return new Response(JSON.stringify({ id }), { headers: { ...cors, ...JSON_HEADERS } });
}

/* ---------------- GET /photo/<id>/<name> ---------------- */
async function handlePhoto(request, env, rest) {
  const id = rest.split('/')[0];
  const name = rest.split('/').slice(1).join('/');
  const recObj = await env.BUCKET.get(`index/${id}.json`);
  if (!recObj) return new Response('Not found', { status: 404 });
  const rec = JSON.parse(await recObj.text());
  const key = `events/${rec.event}/${id}/${name}`;
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

/* ---------------- GET /g/<id>  (guest gallery) ---------------- */
async function handleGallery(request, env, id) {
  id = id.replace(/[^a-z0-9]/gi, '');
  const recObj = await env.BUCKET.get(`index/${id}.json`);
  if (!recObj) {
    return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html' } });
  }
  const rec = JSON.parse(await recObj.text());
  const photos = rec.files.filter(f => f.startsWith('photo-'));
  const hasGrid = rec.files.includes('grid.png');
  const hasReceipt = rec.files.includes('receipt.png');

  const cards = [];
  // let guests pick which to download
  if (hasReceipt) cards.push(card(id, 'receipt.png', 'Receipt design'));
  if (hasGrid) cards.push(card(id, 'grid.png', 'All photos (grid)'));
  photos.forEach((p, i) => cards.push(card(id, p, 'Photo ' + (i + 1))));

  return new Response(galleryPage(cards.join('\n')), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function card(id, name, label) {
  const src = `/photo/${id}/${name}`;
  return `<div class="card">
    <img src="${src}" alt="${label}">
    <div class="cap">${label}</div>
    <a class="dl" href="${src}" download="fotobooth-${name}">Download</a>
  </div>`;
}

/* ---------------- GET /export/<event>?key=SECRET  (private zip) ---------------- */
/* Streams a ZIP of every file under events/<event>/ without buffering in memory. */
async function handleExport(request, env, url) {
  const event = slug(decodeURIComponent(url.pathname.slice('/export/'.length)));
  const key = url.searchParams.get('key') || '';
  if (!env.EXPORT_KEY || key !== env.EXPORT_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  // list all objects under the event prefix
  const prefix = `events/${event}/`;
  const keys = [];
  let cursor;
  do {
    const list = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    list.objects.forEach(o => keys.push(o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  if (keys.length === 0) {
    return new Response('No files for event: ' + event, { status: 404 });
  }

  // Stream a STORED (uncompressed) zip. PNGs are already compressed, so no CPU cost,
  // and streaming keeps Worker memory flat regardless of event size.
  const stream = zipStream(env, keys, prefix);
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${event}.zip"`
    }
  });
}

/* ------- minimal streaming ZIP writer (store method, ZIP64-safe for big sets) ------- */
function zipStream(env, keys, prefix) {
  const enc = new TextEncoder();
  const central = [];
  let offset = 0;

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(n){ return new Uint8Array([n & 255, (n>>>8)&255]); }
  function u32(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }

  return new ReadableStream({
    async start(controller) {
      for (const key of keys) {
        const obj = await env.BUCKET.get(key);
        if (!obj) continue;
        const data = new Uint8Array(await obj.arrayBuffer());
        const nameStr = key.slice(prefix.length); // path inside the zip
        const name = enc.encode(nameStr);
        const crc = crc32(data);

        // local file header
        const local = concat([
          u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
          u32(crc), u32(data.length), u32(data.length),
          u16(name.length), u16(0), name
        ]);
        controller.enqueue(local);
        controller.enqueue(data);

        central.push({ name, crc, size: data.length, offset });
        offset += local.length + data.length;
      }

      // central directory
      let cdSize = 0;
      const cdStart = offset;
      for (const e of central) {
        const rec = concat([
          u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
          u32(e.crc), u32(e.size), u32(e.size),
          u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
          u32(e.offset), e.name
        ]);
        controller.enqueue(rec);
        cdSize += rec.length;
      }
      // end of central directory
      const eocd = concat([
        u32(0x06054b50), u16(0), u16(0),
        u16(central.length), u16(central.length),
        u32(cdSize), u32(cdStart), u16(0)
      ]);
      controller.enqueue(eocd);
      controller.close();
    }
  });

  function concat(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

/* ---------------- HTML pages ---------------- */
function galleryPage(cards) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your fotobooth. photos</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#fff;color:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;padding:28px 18px 60px;}
  .brand{font-family:'Playfair Display',serif;font-weight:900;font-size:34px;text-align:center;margin-bottom:6px;}
  .sub{text-align:center;font-size:13px;letter-spacing:.15em;text-transform:uppercase;opacity:.55;margin-bottom:28px;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;max-width:680px;margin:0 auto;}
  .card{border:1px solid #e2e2e2;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;}
  .card img{width:100%;aspect-ratio:1;object-fit:cover;background:#f4f4f4;}
  .card .cap{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;padding:10px 12px 0;}
  .card .dl{margin:10px 12px 14px;text-align:center;background:#0a0a0a;color:#fff;text-decoration:none;padding:10px;border-radius:9px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;}
  .foot{text-align:center;margin-top:34px;font-size:11px;opacity:.4;letter-spacing:.2em;text-transform:uppercase;}
</style></head><body>
  <div class="brand">fotobooth.</div>
  <div class="sub">Your photos</div>
  <div class="grid">${cards}</div>
  <div class="foot">made by fotobooth. &middot; photos auto-delete after 30 days</div>
</body></html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&display=swap');
body{background:#fff;color:#0a0a0a;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;}
.b{font-family:'Playfair Display',serif;font-weight:900;font-size:40px;margin-bottom:12px;}</style></head>
<body><div class="b">fotobooth.</div>
<p>These photos aren't available — the link may be wrong or they may have expired (photos are kept for 30 days).</p>
</body></html>`;
}
