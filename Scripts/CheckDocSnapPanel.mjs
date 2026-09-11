// ==========================================
// Scripts/CheckDocSnapPanel.mjs
// Exercises POST /unity-docsnap/panel/api for real, against
// the production schema on a node:sqlite shim - the method
// CLAUDE.md §14 item 4 describes, which is the only way to
// test a panel in this repository without deploying it.
//
//   node Scripts/CheckDocSnapPanel.mjs
//
// It found one bug worth keeping the file for: a save that
// carried only a new name wiped the lock mode and the list of
// locked sections, because a missing field normalised to
// empty. The panel always sends every field, so nothing looked
// wrong - and "a partial save silently unlocks the sections
// you locked" is the worst thing that code could do quietly.
// ==========================================

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { handleDocSnapPanelApi } from '../Pages/DocSnapPanel.js'

const sqlite = new DatabaseSync(':memory:')

// The two tables the panel touches, plus the licence table it reads.
sqlite.exec(`
CREATE TABLE licenses (key_hash TEXT PRIMARY KEY, key_public TEXT, product TEXT, tier TEXT,
  status TEXT, max_activations INTEGER, email TEXT, order_id TEXT, batch TEXT, created_at INTEGER);
CREATE TABLE license_attempts (ip_hash TEXT, at INTEGER);
`)
sqlite.exec(readFileSync(new URL('../migrations/0015_docsnap_brands.sql', import.meta.url), 'utf8')
  .split('\n').filter(l => !l.trim().startsWith('--')).join('\n'))

// The D1 shim: prepare().bind().first()/.all()/.run() with meta.changes.
const D1 = {
  prepare(sql) {
    let args = []
    const api = {
      bind(...a) { args = a; return api },
      async first() { try { return sqlite.prepare(sql).get(...args) ?? null } catch (e) { throw new Error(e.message) } },
      async all() { return { results: sqlite.prepare(sql).all(...args) } },
      async run() { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } } }
    }
    return api
  }
}

const env = { LICENSE_DB: D1, ASSETS: null }
const url = new URL('https://amircollider.com/unity-docsnap/panel/api')
const post = (body) => handleDocSnapPanelApi(url, new Request(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
  body: JSON.stringify(body)
}), null, 'test-req', {}, env)

const j = async (r) => ({ status: r.status, body: await r.json().catch(() => null) })
let fails = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '   ' + extra)); if (!cond) fails++
}

// --- a bad key must be refused and must not say why ---
let r = await j(await post({ action: 'brands.list', key: 'DSNAP-AAAAA-BBBBB-CCCCC' }))
ok('unknown key is refused with one message', r.status === 403 && r.body.error === 'unknown_key', JSON.stringify(r))

// --- a real Pro key ---
const { normalizeKey } = await import('../Licensing/Keys.js')
const KEY = 'DSNAP-11111-22222-33333'
const norm = normalizeKey(KEY)
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm)))]
  .map(b => b.toString(16).padStart(2, '0')).join('')
sqlite.prepare(`INSERT INTO licenses (key_hash, key_public, product, tier, status, max_activations, created_at)
                VALUES (?, ?, 'unity-docsnap', 'pro', 'active', 1, 0)`).run(hash, 'DSNAP-…-33333')

r = await j(await post({ action: 'brands.list', key: KEY }))
ok('a valid key lists (empty) profiles', r.status === 200 && r.body.ok && r.body.brands.length === 0, JSON.stringify(r))
ok('the tier is reported', r.body && r.body.tier === 'pro', JSON.stringify(r.body))

r = await j(await post({ action: 'brand.save', key: KEY, brand: {
  name: 'Neon Katana', footerEn: 'Made by AmirCollider', footerUrl: 'https://amircollider.com',
  lockMode: 'omit', locked: ['changes', 'bogus-section'] } }))
ok('saving a profile works', r.status === 200 && r.body.ok && r.body.id, JSON.stringify(r))
const id = r.body.id

r = await j(await post({ action: 'brands.list', key: KEY }))
const b = r.body.brands[0]
ok('an unknown section id is dropped, not stored', b && b.locked.length === 1 && b.locked[0] === 'changes', JSON.stringify(b))
ok('the footer url survived', b && b.footerUrl === 'https://amircollider.com')

// --- a javascript: url must never be stored ---
await post({ action: 'brand.save', key: KEY, brand: { id, name: 'X', footerUrl: 'javascript:alert(1)' } })
r = await j(await post({ action: 'brands.list', key: KEY }))
ok('a javascript: footer url is refused', r.body.brands[0].footerUrl === '', JSON.stringify(r.body.brands[0]))

// --- editing must not silently wipe the logo ---
sqlite.prepare('UPDATE docsnap_brands SET logo_key = ?, logo_type = ? WHERE id = ?')
  .run('docsnap/brand/2026-01-01/x.png', 'image/png', id)
await post({ action: 'brand.save', key: KEY, brand: { id, name: 'Renamed' } })
r = await j(await post({ action: 'brands.list', key: KEY }))
ok('saving a name change keeps the logo', r.body.brands[0].logoUrl.endsWith('/x.png'), JSON.stringify(r.body.brands[0]))
ok('the name changed', r.body.brands[0].name === 'Renamed')

// --- the brand file ---
const fileRes = await post({ action: 'brand.file', key: KEY, id })
const disp = fileRes.headers.get('Content-Disposition')
ok('the brand file downloads as an attachment', fileRes.status === 200 && disp.includes('attachment'), disp)
ok('the filename is sanitised', /filename="Renamed\.docsnapbrand"/.test(disp), disp)
const file = JSON.parse(await fileRes.text())
ok('the brand file is the documented shape', file.docsnapBrand === 1 && file.lockMode === 'omit'
   && Array.isArray(file.locked) && file.locked[0] === 'changes', JSON.stringify(file))
ok('a partial save did NOT wipe the lock', file.lockMode === 'omit' && file.locked.length === 1, JSON.stringify(file))
ok('a partial save did NOT wipe the footer text', file.footer.en === 'Made by AmirCollider', JSON.stringify(file.footer))
ok('the brand file carries NO password field', !('password' in file) && !JSON.stringify(file).includes('assw'), JSON.stringify(file))

// --- and clearing must still work when it IS sent ---
await post({ action: 'brand.save', key: KEY, brand: { id, lockMode: '', locked: [] } })
r = await j(await post({ action: 'brands.list', key: KEY }))
ok('sending an empty lock mode clears it', r.body.brands[0].lockMode === '' && r.body.brands[0].locked.length === 0,
   JSON.stringify(r.body.brands[0]))

// --- a Plus key must not be able to lock ---
const KEY2 = 'DSNAP-44444-55555-66666'
const h2 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeKey(KEY2))))]
  .map(x => x.toString(16).padStart(2, '0')).join('')
sqlite.prepare(`INSERT INTO licenses (key_hash, key_public, product, tier, status, max_activations, created_at)
                VALUES (?, ?, 'unity-docsnap', 'plus', 'active', 1, 0)`).run(h2, 'DSNAP-…-66666')
r = await j(await post({ action: 'brand.save', key: KEY2, brand: { name: 'P', lockMode: 'omit', locked: ['changes'] } }))
ok('a Plus key cannot lock sections', r.status === 403 && r.body.error === 'needs_pro', JSON.stringify(r))
r = await j(await post({ action: 'brand.logo', key: KEY2, id: 'x', dataUri: 'data:image/png;base64,AAAA' }))
ok('a Plus key cannot upload a logo', r.status === 403 && r.body.error === 'needs_pro', JSON.stringify(r))
r = await j(await post({ action: 'brand.save', key: KEY2, brand: { name: 'P', footerEn: 'hi' } }))
ok('a Plus key CAN set a footer', r.status === 200 && r.body.ok, JSON.stringify(r))

// --- one key cannot read another key's profiles ---
r = await j(await post({ action: 'brands.list', key: KEY2 }))
ok('profiles are scoped to the key that owns them', r.body.brands.length === 1 && r.body.brands[0].name === 'P',
   JSON.stringify(r.body.brands.map(x => x.name)))
r = await j(await post({ action: 'brand.delete', key: KEY2, id }))
ok('one key cannot delete another key\'s profile', r.status === 404, JSON.stringify(r))

// --- unknown action ---
r = await j(await post({ action: 'brand.nope', key: KEY }))
ok('an unknown action is refused', r.status === 400 && r.body.error === 'bad_action')

console.log('\nFAILURES: ' + fails)
process.exit(fails ? 1 : 0)
