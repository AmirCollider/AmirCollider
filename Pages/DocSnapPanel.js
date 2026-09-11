// ==========================================
// Pages/DocSnapPanel.js
// The Unity DocSnap brand panel.
//
//   GET  /unity-docsnap/panel        the page
//   POST /unity-docsnap/panel/api    everything it does
//
// WHAT THIS IS, AND WHAT IT IS NOT
//
// Unity DocSnap can put a studio's logo and footer on the
// sites it exports, and lock sections of them. All of that
// is configured INSIDE UNITY and works with no network at
// all. That is the product's promise - "there is never a
// network call in front of an export" - and this page does
// not weaken it by a single request.
//
// This page is for the person with five Unity projects who
// does not want to type the same footer five times. They set
// a profile up here, download a small file, and import it in
// each project. The Editor never talks to this endpoint. A
// human carries the file across, which is the same gesture
// they already performed to get their licence key in.
//
// TWO ABSENCES THAT ARE FEATURES
//
//   No password. The lock password is typed in Unity and
//   never leaves that machine. Nothing on this server can
//   open a customer's locked export, and the panel says so
//   out loud - it is worth more as a sentence than the
//   convenience would have been worth as a feature.
//
//   No project names. Nothing about a Unity project ever
//   reaches this server. So the panel shows "profiles" the
//   customer named themselves, not "your projects". Reading
//   real project names off the Editor would mean the Editor
//   sending them, to make a label slightly nicer.
//
// Auth is the licence key itself, rate-limited through the
// same license_attempts table the activation endpoint uses.
// There is no session and no cookie: the key is held in the
// page for as long as the tab is open and is sent with each
// request.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { seoHead } from '../Core/Seo.js'
import { siteNavCss, siteFooter, siteBackToTop, siteChromeScript } from '../Core/SiteNav.js'
import { createJsonResponse, createHtmlResponse, clientIp } from '../Core/Http.js'
import { escapeHtml } from '../Core/Html.js'
import { logInfo, logWarning } from '../Core/Logging.js'
import { findLicense, isRateLimited, recordFailedAttempt } from '../Licensing/Store.js'
import { looksLikeImage, base64ToBytes, putImage } from '../Mail/Images.js'
import {
  brandsDb, brandsReady, listBrands, getBrand, saveBrand, deleteBrand,
  brandFileJson, LOCKABLE_SECTIONS, MAX_LOGO_BYTES, BRAND_LIMITS
} from '../Licensing/Brands.js'

const ACTIONS = ['brands.list', 'brand.save', 'brand.delete', 'brand.logo', 'brand.file']

// Which tier may use which half. These mirror
// DocSnapEditionMatrix in the package, and the panel says
// what a tier does not have rather than hiding it: somebody
// who can see the control knows what upgrading buys.
const TIER_RANK = { plus: 1, pro: 2 }


// ==========================================
// handleDocSnapPanel — GET /unity-docsnap/panel
// ==========================================
export async function handleDocSnapPanel() {
  return createHtmlResponse(renderPanelPage())
}


// ==========================================
// handleDocSnapPanelApi — POST /unity-docsnap/panel/api
//
// One endpoint, an `action` field, the same shape as every
// other panel on this site. Every action re-proves the
// licence key: there is no session to steal and no state to
// get out of step.
// ==========================================
export async function handleDocSnapPanelApi(url, request, gameId, requestId, GAMES, env) {
  const database = brandsDb(env)
  if (!database) {
    return createJsonResponse({ error: 'db_not_bound', message: 'LICENSE_DB is not bound', requestId }, 500)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return createJsonResponse({ error: 'bad_json', message: 'Body must be JSON', requestId }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : ''
  if (!ACTIONS.includes(action)) {
    return createJsonResponse({ error: 'bad_action', message: 'Unknown action', actions: ACTIONS, requestId }, 400)
  }

  // Before touching the key, and on every action rather than
  // only on the first: the key IS the credential here, so
  // every request is a guess somebody could be making.
  const ip = clientIp(request)
  if (await isRateLimited(database, ip)) {
    return createJsonResponse({
      error: 'rate_limited',
      message: 'Too many attempts. Wait a few minutes and try again.',
      requestId
    }, 429)
  }

  const license = await findLicense(database, body.key || '')
  if (!license || license.status !== 'active' || license.product !== 'unity-docsnap') {
    await recordFailedAttempt(database, ip)
    // One message for every way a key can fail to work here.
    // Distinguishing "no such key" from "that key is for
    // something else" is precisely what an enumeration
    // attack is looking for.
    return createJsonResponse({
      error: 'unknown_key',
      message: 'That key was not recognised.',
      requestId
    }, 403)
  }

  if (!(await brandsReady(database))) {
    return createJsonResponse({
      error: 'not_migrated',
      message: 'The brand table is missing. Run migrations/0015_docsnap_brands.sql against LICENSE_DB.',
      requestId
    }, 503)
  }

  const tier = TIER_RANK[license.tier] || 0
  const keyHash = license.key_hash

  try {
    switch (action) {
      case 'brands.list':
        return createJsonResponse({
          ok: true,
          tier: license.tier,
          limits: BRAND_LIMITS,
          brands: (await listBrands(database, keyHash)).map(publicBrand),
          requestId
        })

      case 'brand.save': {
        const input = body.brand || {}

        // The tier gates are enforced here, not only drawn in
        // the page. A control greyed out in a browser is a
        // control somebody can re-enable in a browser.
        if (input.lockMode && tier < TIER_RANK.pro) {
          return createJsonResponse({ error: 'needs_pro', message: 'Locking sections is part of Pro.', requestId }, 403)
        }
        const footerText = `${input.footerFa || ''}${input.footerEn || ''}${input.footerJa || ''}`
        if (footerText && tier < TIER_RANK.plus) {
          return createJsonResponse({ error: 'needs_plus', message: 'A custom footer is part of Plus.', requestId }, 403)
        }

        const result = await saveBrand(database, keyHash, input)
        if (!result.ok) {
          return createJsonResponse({
            error: result.error,
            message: result.error === 'too_many'
              ? `A key can hold ${BRAND_LIMITS.maxBrands} profiles.`
              : 'Could not save that profile.',
            requestId
          }, 400)
        }
        logInfo('docsnap_brand_saved', { requestId, id: result.id })
        return createJsonResponse({ ok: true, id: result.id, requestId })
      }

      case 'brand.delete': {
        const gone = await deleteBrand(database, keyHash, String(body.id || ''))
        return createJsonResponse({ ok: gone, requestId }, gone ? 200 : 404)
      }

      case 'brand.logo': {
        if (tier < TIER_RANK.pro) {
          return createJsonResponse({ error: 'needs_pro', message: 'A custom logo is part of Pro.', requestId }, 403)
        }
        return await handleLogoUpload(database, env, keyHash, body, requestId)
      }

      case 'brand.file':
        return await handleBrandFile(database, env, keyHash, String(body.id || ''), requestId)
    }
  } catch (error) {
    logWarning('docsnap_panel_failed', { requestId, action, error: error.message })
    return createJsonResponse({ error: 'panel_failed', message: 'Something went wrong.', requestId }, 500)
  }

  return createJsonResponse({ error: 'bad_action', message: 'Unknown action', requestId }, 400)
}


// ==========================================
// handleLogoUpload
// The browser sends a data URI; the bytes land in R2 under
// docsnap/brand/ and the row keeps the key.
//
// What counts as an image is Mail/Images.js's answer, not a
// second copy of the rule here: the declared type AND the
// first bytes have to agree, and an uploaded filename never
// becomes a path in the bucket.
// ==========================================
async function handleLogoUpload(database, env, keyHash, body, requestId) {
  const id = String(body.id || '')
  const brand = await getBrand(database, keyHash, id)
  if (!brand) {
    return createJsonResponse({ error: 'no_brand', message: 'Save the profile first.', requestId }, 404)
  }

  const dataUri = String(body.dataUri || '')
  const match = /^data:([a-z0-9.+/-]+);base64,/i.exec(dataUri)
  if (!match) {
    return createJsonResponse({ error: 'bad_image', message: 'That is not an image file.', requestId }, 400)
  }

  const type = match[1].toLowerCase()
  const bytes = base64ToBytes(dataUri.slice(match[0].length))
  if (!bytes.length) {
    return createJsonResponse({ error: 'bad_image', message: 'That image could not be read.', requestId }, 400)
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    return createJsonResponse({
      error: 'too_large',
      message: `The limit is ${Math.round(MAX_LOGO_BYTES / 1024)} KB — it is drawn at 44×44 pixels and embedded in every page of the export.`,
      requestId
    }, 400)
  }

  // SVG is refused on purpose. An SVG is a document that can
  // carry script, and this one would be inlined into every
  // page of an export somebody hands to a client.
  if (type === 'image/svg+xml' || !looksLikeImage(type, bytes.subarray(0, 8))) {
    return createJsonResponse({
      error: 'bad_image',
      message: 'Use a PNG, JPEG, WebP or GIF. SVG is not accepted, because an SVG can carry script and this one ends up in a file you hand to a client.',
      requestId
    }, 400)
  }

  const stored = await putImage(env, {
    bytes,
    type,
    prefix: 'docsnap/brand/',
    maxBytes: MAX_LOGO_BYTES,
    retentionMs: 1000 * 60 * 60 * 24 * 365 * 10,
    requestId
  })
  if (!stored) {
    return createJsonResponse({ error: 'not_stored', message: 'That image could not be stored.', requestId }, 400)
  }

  await saveBrand(database, keyHash, { ...brand, logoKey: stored.key, logoType: stored.type })
  return createJsonResponse({ ok: true, url: stored.url, requestId })
}


// ==========================================
// handleBrandFile
// The download. Self-contained by design: the logo is
// inlined as a data URI rather than linked, because the
// machine that imports this may be a build agent with no
// route to the internet - which is the machine this whole
// arrangement exists for.
// ==========================================
async function handleBrandFile(database, env, keyHash, id, requestId) {
  const brand = await getBrand(database, keyHash, id)
  if (!brand) {
    return createJsonResponse({ error: 'no_brand', message: 'No such profile.', requestId }, 404)
  }

  let logoDataUri = ''
  if (brand.logoKey && env.ASSETS) {
    try {
      const object = await env.ASSETS.get(brand.logoKey)
      if (object) {
        const bytes = new Uint8Array(await object.arrayBuffer())
        if (bytes.length <= MAX_LOGO_BYTES) {
          const type = object.httpMetadata?.contentType || brand.logoType || 'image/png'
          logoDataUri = `data:${type};base64,${bytesToBase64(bytes)}`
        }
      }
    } catch (error) {
      // A missing logo is a brand file without one, not a
      // failed download. The footer and the locking are
      // still worth carrying across.
      logWarning('docsnap_brand_logo_unreadable', { requestId, id })
    }
  }

  const file = brandFileJson(brand, logoDataUri)
  return new Response(JSON.stringify(file, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeFileName(brand.name)}.docsnapbrand"`,
      'Cache-Control': 'no-store'
    }
  })
}


// ==========================================
// Helpers
// ==========================================

/**
 * What the browser is allowed to see. The R2 key becomes a
 * URL; nothing else about storage leaves this file.
 */
function publicBrand(brand) {
  return {
    id: brand.id,
    name: brand.name,
    logoUrl: brand.logoKey ? `${CONFIG.SITE_URL}/assets/${brand.logoKey}` : '',
    footerFa: brand.footerFa,
    footerEn: brand.footerEn,
    footerJa: brand.footerJa,
    footerUrl: brand.footerUrl,
    lockMode: brand.lockMode,
    locked: brand.locked,
    updatedAt: brand.updatedAt
  }
}


function bytesToBase64(bytes) {
  let binary = ''
  // In chunks, because String.fromCharCode with a quarter of
  // a million arguments overflows the call stack.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}


/**
 * The customer typed this name; it must not decide what a
 * Content-Disposition header says.
 */
function safeFileName(name) {
  const cleaned = String(name || 'studio').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 40) || 'studio'
}


// ==========================================
// The page
//
// English and noindex, matching /license: this is a
// customer's account screen reached from a key in their
// inbox, not a page anybody arrives at from a search. The
// trilingual half of this product is the EXPORT, which is
// what a customer's own readers see.
// ==========================================
function renderPanelPage() {
  const sections = LOCKABLE_SECTIONS.map(id =>
    `<label class="chk"><input type="checkbox" data-section="${escapeHtml(id)}"> ${escapeHtml(sectionLabel(id))}</label>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  ${getPageHead({
    title: 'Brand panel — Unity DocSnap',
    amirLogo: CONFIG.AMIR_LOGO,
    description: 'Set your studio logo, footer and locked sections once, and carry them into every Unity project.'
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap" rel="stylesheet">
  ${seoHead({
    path: '/unity-docsnap/panel',
    title: 'Brand panel — Unity DocSnap',
    description: 'Set your studio logo, footer and locked sections once, and carry them into every Unity project.',
    noindex: true
  })}
  <style>${siteNavCss()}${panelCss()}</style>
</head>
<body>
  <div class="wrap">
    <header class="head">
      <a class="back" href="/unity-docsnap">&larr; Unity DocSnap</a>
      <h1>Brand panel</h1>
      <p class="sub">Your logo, your footer line and which sections a client may see &mdash; set here once, carried into every project as a file.</p>
    </header>

    <section class="card note">
      <h2>How this works</h2>
      <ol class="how">
        <li>Set up a profile below.</li>
        <li>Press <b>Download brand file</b>.</li>
        <li>In Unity: <b>Unity DocSnap &rsaquo; Management &rsaquo; Import brand file</b>.</li>
      </ol>
      <p class="fine">Unity never talks to this page. That is the point: an export works on a machine with no internet at all, and nothing about your project ever reaches this server. You carry the file across &mdash; the same way you carried your licence key.</p>
      <p class="fine"><b>The lock password is not here and never will be.</b> You type it in Unity and it stays on that machine. Nothing on this server can open a locked export, including us.</p>
    </section>

    <section class="card">
      <label class="lbl" for="key">Licence key</label>
      <div class="row">
        <input id="key" type="text" spellcheck="false" autocomplete="off"
               placeholder="DSNAP-XXXXX-XXXXX-XXXXX" aria-describedby="hint">
        <button id="load" type="button">Open</button>
      </div>
      <p id="hint" class="hint">Spacing and capitalisation don't matter. The key is held in this tab only, never stored.</p>
      <p id="status" class="status" role="status"></p>
    </section>

    <section class="card" id="brandsCard" hidden>
      <div class="cardhead">
        <h2>Profiles</h2>
        <button id="add" type="button" class="ghost">New profile</button>
      </div>
      <p class="fine">These are yours to name. Nothing about a Unity project reaches this server, so this list is whatever you called things &mdash; not a list read off your machine.</p>
      <div id="brands" class="brands"></div>
    </section>

    <section class="card" id="editCard" hidden>
      <h2 id="editTitle">Profile</h2>

      <label class="lbl" for="name">Name</label>
      <input id="name" type="text" maxlength="60" placeholder="My studio">

      <div class="split">
        <div>
          <label class="lbl" for="logo">Logo <span class="tag pro">Pro</span></label>
          <input id="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          <p class="fine">PNG, JPEG, WebP or GIF, up to ${Math.round(MAX_LOGO_BYTES / 1024)} KB. Drawn at 44&times;44 in the exported sidebar. SVG is not accepted &mdash; it can carry script, and this ends up in a file you hand to a client.</p>
        </div>
        <div class="logobox"><img id="logoPreview" alt="" hidden></div>
      </div>

      <label class="lbl">Footer line <span class="tag plus">Plus</span></label>
      <p class="fine">One line at the bottom of every exported page. Fill in the language you think in &mdash; the others fall back to it.</p>
      <input id="footerEn" type="text" maxlength="120" placeholder="English">
      <input id="footerFa" type="text" maxlength="120" placeholder="فارسی" dir="rtl">
      <input id="footerJa" type="text" maxlength="120" placeholder="日本語">
      <input id="footerUrl" type="text" maxlength="300" placeholder="https://your-studio.com (optional link)">

      <label class="lbl">Locking <span class="tag pro">Pro</span></label>
      <div class="modes">
        <label class="chk"><input type="radio" name="mode" value=""> Nothing locked</label>
        <label class="chk"><input type="radio" name="mode" value="omit"> Leave out</label>
        <label class="chk"><input type="radio" name="mode" value="encrypt"> Encrypt</label>
      </div>
      <p id="modeNote" class="fine"></p>

      <div id="sectionsBox" class="sections" hidden>
        <p class="fine">Which sections. The Dashboard cannot be locked &mdash; it is the page the export opens on.</p>
        ${sections}
      </div>

      <div class="actions">
        <button id="save" type="button">Save</button>
        <button id="download" type="button" class="ghost">Download brand file</button>
        <button id="remove" type="button" class="danger">Delete profile</button>
      </div>
      <p id="editStatus" class="status" role="status"></p>
    </section>

    ${siteFooter({ lang: 'en' })}
  </div>
  ${siteBackToTop({ lang: 'en' })}
  ${siteChromeScript()}
  <script>${panelScript()}</script>
</body>
</html>`
}


function sectionLabel(id) {
  const labels = {
    issues: 'Health', packages: 'Packages', changes: 'Changes',
    plan: 'Plan', scenes: 'Scenes', assets: 'Assets'
  }
  return labels[id] || id
}


function panelCss() {
  return `
    .wrap { max-width: 780px; margin: 0 auto; padding: 32px 20px 60px; }
    .head { margin-bottom: 24px; }
    .back { color: var(--muted); font-size: 13px; text-decoration: none; }
    .back:hover { color: var(--accent); }
    .head h1 { margin: 10px 0 6px; font-size: 30px; }
    .sub { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.7; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
    .card.note { background: var(--card-2, var(--card)); }
    .cardhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .card h2 { margin: 0 0 10px; font-size: 17px; }
    .how { margin: 0 0 10px; padding-inline-start: 20px; color: var(--muted); font-size: 14px; line-height: 1.9; }
    .lbl { display: block; margin: 14px 0 6px; font-size: 13px; font-weight: 700; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    input[type=text], input[type=file] {
      width: 100%; box-sizing: border-box; font: inherit; font-size: 14px;
      padding: 10px 12px; margin-bottom: 8px; color: var(--fg);
      background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
    }
    .row input[type=text] { flex: 1 1 240px; margin-bottom: 0; }
    input:focus { outline: none; border-color: var(--accent); }
    button {
      font: inherit; font-size: 14px; font-weight: 700; padding: 10px 18px;
      color: #fff; background: var(--accent); border: 0; border-radius: 10px; cursor: pointer;
    }
    button.ghost { color: var(--accent); background: transparent; border: 1px solid var(--line); }
    button.danger { color: #c53232; background: transparent; border: 1px solid var(--line); }
    button:disabled { opacity: 0.5; cursor: default; }
    .hint, .fine { margin: 6px 0 0; color: var(--muted); font-size: 12.5px; line-height: 1.7; }
    .status { margin: 10px 0 0; min-height: 1.2em; font-size: 13px; color: var(--muted); }
    .status.bad { color: #c53232; }
    .status.good { color: var(--accent); }
    .brands { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .brandrow {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      border: 1px solid var(--line); border-radius: 12px; cursor: pointer; background: none;
      color: var(--fg); font-weight: 600; text-align: start; width: 100%;
    }
    .brandrow:hover { border-color: var(--accent); }
    .brandrow.is-active { border-color: var(--accent); background: var(--bg); }
    .brandrow img { width: 28px; height: 28px; object-fit: contain; border-radius: 6px; }
    .brandrow .meta { margin-inline-start: auto; font-weight: 400; font-size: 12px; color: var(--muted); }
    .split { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
    .split > div:first-child { flex: 1 1 260px; }
    .logobox { width: 64px; height: 64px; border: 1px solid var(--line); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    .logobox img { width: 44px; height: 44px; object-fit: contain; }
    .modes, .sections { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 6px 0; }
    .sections { flex-direction: column; gap: 6px; }
    .chk { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
    .tag { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 999px; vertical-align: middle; }
    .tag.pro { background: rgba(120,80,220,0.14); color: #7850dc; }
    .tag.plus { background: rgba(40,160,140,0.14); color: #1f8f7d; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
    @media (max-width: 560px) { .actions button { flex: 1 1 100%; } }
  `
}


function panelScript() {
  return `
(function () {
  var API = '/unity-docsnap/panel/api';
  var key = '';
  var brands = [];
  var current = null;

  function el(id) { return document.getElementById(id); }
  function say(node, text, kind) {
    node.textContent = text;
    node.className = 'status' + (kind ? ' ' + kind : '');
  }

  function call(action, extra) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action, key: key }, extra || {}))
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    });
  }

  function load() {
    key = el('key').value.trim();
    if (!key) { say(el('status'), 'Paste your licence key first.', 'bad'); return; }
    say(el('status'), 'Checking…');
    call('brands.list').then(function (res) {
      if (!res.ok) { say(el('status'), res.data.message || 'That did not work.', 'bad'); return; }
      brands = res.data.brands || [];
      say(el('status'), res.data.tier ? 'Signed in on your ' + res.data.tier + ' key.' : 'Signed in.', 'good');
      el('brandsCard').hidden = false;
      renderBrands();
      if (brands.length) { select(brands[0].id); } else { el('editCard').hidden = true; }
    });
  }

  function renderBrands() {
    var box = el('brands');
    box.textContent = '';
    if (!brands.length) {
      var p = document.createElement('p');
      p.className = 'fine';
      p.textContent = 'No profiles yet. Press "New profile" to make one.';
      box.appendChild(p);
      return;
    }
    brands.forEach(function (b) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'brandrow' + (current && current.id === b.id ? ' is-active' : '');
      if (b.logoUrl) {
        var img = document.createElement('img');
        img.src = b.logoUrl;
        img.alt = '';
        row.appendChild(img);
      }
      var name = document.createElement('span');
      name.textContent = b.name;
      row.appendChild(name);
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = b.lockMode ? (b.locked.length + ' locked · ' + b.lockMode) : 'nothing locked';
      row.appendChild(meta);
      row.addEventListener('click', function () { select(b.id); });
      box.appendChild(row);
    });
  }

  function blank() {
    return { id: '', name: '', logoUrl: '', footerEn: '', footerFa: '', footerJa: '',
             footerUrl: '', lockMode: '', locked: [] };
  }

  function select(id) {
    current = null;
    for (var i = 0; i < brands.length; i++) { if (brands[i].id === id) { current = brands[i]; } }
    if (!current) { current = blank(); }
    fill();
    renderBrands();
  }

  function fill() {
    el('editCard').hidden = false;
    el('editTitle').textContent = current.id ? 'Edit profile' : 'New profile';
    el('name').value = current.name || '';
    el('footerEn').value = current.footerEn || '';
    el('footerFa').value = current.footerFa || '';
    el('footerJa').value = current.footerJa || '';
    el('footerUrl').value = current.footerUrl || '';

    var preview = el('logoPreview');
    if (current.logoUrl) { preview.src = current.logoUrl; preview.hidden = false; }
    else { preview.removeAttribute('src'); preview.hidden = true; }

    var radios = document.querySelectorAll('input[name=mode]');
    for (var i = 0; i < radios.length; i++) { radios[i].checked = radios[i].value === (current.lockMode || ''); }

    var boxes = document.querySelectorAll('[data-section]');
    for (var j = 0; j < boxes.length; j++) {
      boxes[j].checked = (current.locked || []).indexOf(boxes[j].getAttribute('data-section')) >= 0;
    }

    el('remove').hidden = !current.id;
    el('download').disabled = !current.id;
    syncMode();
    say(el('editStatus'), '');
  }

  function chosenMode() {
    var radios = document.querySelectorAll('input[name=mode]');
    for (var i = 0; i < radios.length; i++) { if (radios[i].checked) { return radios[i].value; } }
    return '';
  }

  // The two modes are different promises, and the panel says
  // which is which every time rather than once in a manual.
  function syncMode() {
    var mode = chosenMode();
    el('sectionsBox').hidden = !mode;
    var note = el('modeNote');
    if (mode === 'omit') {
      note.textContent = 'LEAVE OUT: the chosen sections are not written into the export at all — no page, no data file, no summary, nothing in the search index. There is no password to lose. This is the safe choice.';
    } else if (mode === 'encrypt') {
      note.textContent = 'ENCRYPT: the sections travel inside the export, encrypted. Anyone with the password opens them; anyone without cannot. You set that password in Unity — it never comes here.';
    } else {
      note.textContent = '';
    }
  }

  function collect() {
    var locked = [];
    var boxes = document.querySelectorAll('[data-section]');
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) { locked.push(boxes[i].getAttribute('data-section')); }
    }
    return {
      id: current.id || undefined,
      name: el('name').value,
      footerEn: el('footerEn').value,
      footerFa: el('footerFa').value,
      footerJa: el('footerJa').value,
      footerUrl: el('footerUrl').value,
      lockMode: chosenMode(),
      locked: locked
    };
  }

  function save() {
    say(el('editStatus'), 'Saving…');
    return call('brand.save', { brand: collect() }).then(function (res) {
      if (!res.ok) { say(el('editStatus'), res.data.message || 'Could not save.', 'bad'); return null; }
      var id = res.data.id;
      return call('brands.list').then(function (listRes) {
        brands = (listRes.data && listRes.data.brands) || [];
        select(id);
        say(el('editStatus'), 'Saved.', 'good');
        return id;
      });
    });
  }

  el('load').addEventListener('click', load);
  el('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') { load(); } });
  el('add').addEventListener('click', function () { current = blank(); fill(); renderBrands(); });
  el('save').addEventListener('click', save);

  document.querySelectorAll('input[name=mode]').forEach(function (r) {
    r.addEventListener('change', syncMode);
  });

  el('remove').addEventListener('click', function () {
    if (!current.id) { return; }
    if (!window.confirm('Delete "' + current.name + '"? The exports you already made are not affected.')) { return; }
    call('brand.delete', { id: current.id }).then(function () {
      return call('brands.list');
    }).then(function (listRes) {
      brands = (listRes.data && listRes.data.brands) || [];
      current = blank();
      renderBrands();
      el('editCard').hidden = true;
    });
  });

  // A logo needs a profile to belong to, so an unsaved one is
  // saved first rather than refused - the alternative is an
  // error message about an order of operations nobody should
  // have to know.
  el('logo').addEventListener('change', function () {
    var file = el('logo').files && el('logo').files[0];
    if (!file) { return; }
    var reader = new FileReader();
    reader.onload = function () {
      var send = function (id) {
        return call('brand.logo', { id: id, dataUri: reader.result }).then(function (res) {
          if (!res.ok) { say(el('editStatus'), res.data.message || 'That image was refused.', 'bad'); return; }
          current.logoUrl = res.data.url;
          var preview = el('logoPreview');
          preview.src = res.data.url;
          preview.hidden = false;
          say(el('editStatus'), 'Logo saved.', 'good');
          call('brands.list').then(function (listRes) {
            brands = (listRes.data && listRes.data.brands) || [];
            renderBrands();
          });
        });
      };
      if (current.id) { send(current.id); }
      else { save().then(function (id) { if (id) { send(id); } }); }
    };
    reader.readAsDataURL(file);
  });

  el('download').addEventListener('click', function () {
    if (!current.id) { return; }
    say(el('editStatus'), 'Building the file…');
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'brand.file', key: key, id: current.id })
    }).then(function (r) {
      if (!r.ok) { throw new Error('failed'); }
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (current.name || 'studio').replace(/[^A-Za-z0-9._-]+/g, '-') + '.docsnapbrand';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      say(el('editStatus'), 'Downloaded. In Unity: Unity DocSnap › Management › Import brand file.', 'good');
    }).catch(function () {
      say(el('editStatus'), 'Could not build that file.', 'bad');
    });
  });
})();
  `
}
