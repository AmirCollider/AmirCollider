// ==========================================
// Licensing/Brands.js
// Every query the Unity DocSnap brand panel makes.
//
// A "brand" here is a logo, a footer line and a set of
// locked sections, saved against a licence key so somebody
// with several Unity projects configures them once instead
// of once per project. The Editor never reads any of this:
// it reads a FILE the customer downloads from the panel and
// imports. Unity DocSnap makes no network call at export
// time, and this table is not the exception.
//
// Two things this deliberately does not store, both of them
// worth more as absences than as features:
//
//   The lock password. It is typed in Unity and stays on
//   that machine. Nothing here can open a customer's locked
//   export, which is a sentence the panel gets to print.
//
//   Anything derived from a Unity project. `name` is a label
//   the customer typed. Reading real project names off the
//   Editor would mean the Editor sending them, and the
//   product page promises it never does.
// ==========================================

import { CONFIG } from '../Config.js'
import { logWarning } from '../Core/Logging.js'

// The sections Unity DocSnap can lock, mirroring
// DocSnapLock.Sections in the package. A value not on this
// list is dropped rather than stored: a typo that locked
// nothing would be invisible until a client saw the section.
export const LOCKABLE_SECTIONS = ['issues', 'packages', 'changes', 'plan', 'scenes', 'assets']

export const LOCK_MODES = ['', 'omit', 'encrypt']

// Enough for any logo drawn at 44 by 44 pixels, and small
// enough that inlining it into every page of an export is
// not a decision anybody regrets.
export const MAX_LOGO_BYTES = 256 * 1024

// A person with more profiles than this has stopped using
// them as brands. The cap is here so one key cannot fill a
// table.
export const MAX_BRANDS_PER_KEY = 20


export function brandsDb(env) {
  return (env && env.LICENSE_DB) || null
}


/**
 * Whether migration 0015 has run. Probed rather than assumed,
 * like every other optional table in this project: a
 * deployment without it should degrade to a panel that says
 * which file to run, never to a 500.
 */
export async function brandsReady(database) {
  try {
    await database.prepare('SELECT id FROM docsnap_brands LIMIT 1').first()
    return true
  } catch {
    return false
  }
}


export async function listBrands(database, keyHash) {
  const { results } = await database
    .prepare(`SELECT id, name, logo_key, logo_type, footer_fa, footer_en, footer_ja,
                     footer_url, lock_mode, locked_json, created_at, updated_at
              FROM docsnap_brands WHERE key_hash = ? ORDER BY created_at ASC`)
    .bind(keyHash)
    .all()
  return (results || []).map(toBrand)
}


export async function getBrand(database, keyHash, id) {
  const row = await database
    .prepare('SELECT * FROM docsnap_brands WHERE key_hash = ? AND id = ? LIMIT 1')
    .bind(keyHash, id)
    .first()
  return row ? toBrand(row) : null
}


/**
 * Create or update one profile. The caller has already proved
 * it holds the licence key; this only decides what is
 * storable.
 *
 * Every field is normalised here rather than at the call site,
 * because this is the one place a bad value can become a
 * stored value.
 */
export async function saveBrand(database, keyHash, input) {
  const now = Date.now()
  const id = input.id && /^[a-z0-9-]{6,40}$/.test(input.id) ? input.id : newBrandId()

  const name = clamp(input.name, 60) || 'Untitled'
  const footerFa = clamp(input.footerFa, 120)
  const footerEn = clamp(input.footerEn, 120)
  const footerJa = clamp(input.footerJa, 120)
  const footerUrl = safeUrl(input.footerUrl)

  const lockMode = LOCK_MODES.includes(input.lockMode) ? input.lockMode : ''
  const locked = Array.isArray(input.locked)
    ? input.locked.filter(s => LOCKABLE_SECTIONS.includes(s))
    : []

  const existing = await getBrand(database, keyHash, id)
  if (!existing) {
    const { n } = await database
      .prepare('SELECT COUNT(*) AS n FROM docsnap_brands WHERE key_hash = ?')
      .bind(keyHash)
      .first()
    if ((n || 0) >= MAX_BRANDS_PER_KEY) {
      return { ok: false, error: 'too_many' }
    }
  }

  // A logo is replaced only when a new one was uploaded in
  // this request. Leaving it out of a save must not wipe it -
  // saving a footer change should not cost somebody their
  // logo.
  const logoKey = input.logoKey !== undefined ? input.logoKey : (existing ? existing.logoKey : null)
  const logoType = input.logoType !== undefined ? input.logoType : (existing ? existing.logoType : null)

  await database
    .prepare(`INSERT INTO docsnap_brands
                (id, key_hash, name, logo_key, logo_type, footer_fa, footer_en, footer_ja,
                 footer_url, lock_mode, locked_json, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                logo_key = excluded.logo_key,
                logo_type = excluded.logo_type,
                footer_fa = excluded.footer_fa,
                footer_en = excluded.footer_en,
                footer_ja = excluded.footer_ja,
                footer_url = excluded.footer_url,
                lock_mode = excluded.lock_mode,
                locked_json = excluded.locked_json,
                updated_at = excluded.updated_at`)
    .bind(id, keyHash, name, logoKey, logoType, footerFa, footerEn, footerJa,
      footerUrl, lockMode, JSON.stringify(locked),
      existing ? existing.createdAt : now, now)
    .run()

  return { ok: true, id }
}


export async function deleteBrand(database, keyHash, id) {
  const result = await database
    .prepare('DELETE FROM docsnap_brands WHERE key_hash = ? AND id = ?')
    .bind(keyHash, id)
    .run()
  return (result.meta && result.meta.changes) > 0
}


/**
 * The brand file the Editor imports, built from one profile.
 *
 * Plain readable JSON with the logo inlined as a data URI, so
 * the file is self-contained: a logo that lived at a URL would
 * be a logo the offline build agent could not fetch, which is
 * the one machine this whole design exists for.
 */
export function brandFileJson(brand, logoDataUri) {
  return {
    docsnapBrand: 1,
    name: brand.name,
    footer: { fa: brand.footerFa || '', en: brand.footerEn || '', ja: brand.footerJa || '' },
    footerUrl: brand.footerUrl || '',
    lockMode: brand.lockMode || '',
    locked: brand.locked || [],
    ...(logoDataUri ? { logo: logoDataUri } : {})
  }
}


// ==========================================
// Helpers
// ==========================================

function toBrand(row) {
  let locked = []
  try {
    const parsed = JSON.parse(row.locked_json || '[]')
    if (Array.isArray(parsed)) {
      locked = parsed.filter(s => LOCKABLE_SECTIONS.includes(s))
    }
  } catch {
    // A row somebody edited by hand in the D1 console. An
    // unreadable list means nothing is locked, which is the
    // reading that cannot leak anything.
    logWarning('docsnap_brand_locked_json_unreadable', { id: row.id })
  }

  return {
    id: row.id,
    name: row.name,
    logoKey: row.logo_key || null,
    logoType: row.logo_type || null,
    footerFa: row.footer_fa || '',
    footerEn: row.footer_en || '',
    footerJa: row.footer_ja || '',
    footerUrl: row.footer_url || '',
    lockMode: LOCK_MODES.includes(row.lock_mode) ? row.lock_mode : '',
    locked,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}


function newBrandId() {
  return 'b' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}


function clamp(value, max) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}


/**
 * http(s) only. This value ends up in an href inside a file
 * somebody hands to a client, and a "javascript:" there is a
 * script the client runs by clicking the footer of a document
 * they were given.
 */
function safeUrl(value) {
  const url = clamp(value, 300)
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : ''
}


export const BRAND_LIMITS = {
  maxLogoBytes: MAX_LOGO_BYTES,
  maxBrands: MAX_BRANDS_PER_KEY,
  sections: LOCKABLE_SECTIONS
}
