// ==========================================
// Scripts/CheckBrandCoverage.mjs
// "If somebody types this, does anything on the site match it?"
//
//   node Scripts/CheckBrandCoverage.mjs            # against the code
//   node Scripts/CheckBrandCoverage.mjs --remote   # against the live site
//
// WHY THIS EXISTS
//
// The brand's name, and every game's name, exists in more written
// forms than anybody can hold in their head: three scripts, two
// Unicode encodings of Persian, three separators, and a tail of
// misspellings. Every one of those is a different string, and a
// search engine matches strings. Checking them by eye is how the
// Persian spelling stayed wrong through two passes of this work -
// the correct form was sitting in the MISSPELLINGS list and the
// misspelling was being published as correct.
//
// So this generates the forms mechanically and asks, of each one,
// whether it appears anywhere in the bytes the site actually
// serves.
//
// THE THREE TIERS, AND WHY THEY ARE NOT THE SAME QUESTION
//
// This is the part worth reading before adding to the lists,
// because getting it wrong is how a site earns a spam penalty.
//
//   MUST     The correct names, in every encoding. These are the
//            same name, so the site must contain all of them. A
//            failure here is a reader who typed the name properly
//            and found nothing.
//
//   SHOULD   The handful of misspellings that are ANSWERED in
//            prose on /about. Three of them, each inside a
//            sentence explaining why it is a common mistake.
//
//   LEARNED  Every other misspelling. These deliberately appear
//            NOWHERE on the site, and that is not a gap - it is
//            the only correct answer. Putting twenty near-identical
//            strings on a page is keyword stuffing by Google's own
//            definition, and it is also unnecessary: a search
//            engine learns a spelling correction from seeing the
//            wrong form beside the right one in ordinary prose,
//            which is exactly what the SHOULD tier provides. It
//            then generalises to the rest on its own.
//
// So a green run means: every real spelling is present, the
// answered typos are answered, and the rest are correctly absent.
// ==========================================

import { CONFIG, LANGUAGES, getGamesConfig } from '../Config.js'
import { persianSpellingVariants } from '../Core/Seo.js'
import worker from '../Worker.js'
import { indexablePaths } from '../Pages/Sitemap.js'
import { localizedPath } from '../Core/Locale.js'

const REMOTE = process.argv.includes('--remote')

const env = {
  NEON_KATANA_GOOGLE_CLIENT_ID_WEB: 'x', NEON_KATANA_GOOGLE_CLIENT_SECRET: 'x',
  CHRONOBLADES_GOOGLE_CLIENT_ID_WEB: 'x', CHRONOBLADES_GOOGLE_CLIENT_SECRET: 'x',
  STATE_SIGNING_SECRET: 'x'
}
const ctx = { waitUntil() {}, passThroughOnException() {} }
const GAMES = getGamesConfig(env)


// ==========================================
// Fetching
//
// Locally this calls Worker.fetch directly, so the check runs with
// no deployment and no network. --remote fetches the real site,
// which is the only way to catch "it is right in the repository
// and the deploy never went out".
// ==========================================
async function fetchPage(path) {
  if (REMOTE) {
    const res = await fetch(CONFIG.SITE_URL + path, {
      headers: { 'user-agent': 'AmirCollider-BrandCoverage/1.0' }
    })
    return res.status === 200 ? res.text() : ''
  }
  const res = await worker.fetch(
    new Request('https://amircollider.com' + path), env, ctx
  )
  return res.status === 200 ? res.text() : ''
}


// ==========================================
// Case and separator forms of a Latin name.
//
// Search is case-insensitive, so these are not what the SITE has
// to contain - the corpus is lower-cased before matching. They are
// here because the QUERY side varies, and the report is easier to
// read when it says which shape was tested.
// ==========================================
function latinForms(name) {
  const squashed = name.replace(/\s+/g, '')
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2')

  // No hyphenated form. The first version of this generated one
  // and then reported it missing on every name - which was the
  // generator inventing a query nobody types, not the site failing
  // to answer one. "Amir-Collider" was removed from ALIASES for
  // exactly the same reason.
  return [...new Set([name, squashed, spaced])]
}


// ==========================================
// The queries, in three tiers.
// ==========================================
function buildQueries() {
  const brand = CONFIG.BRAND
  const must = []
  const should = []
  const learned = []

  const push = (list, term, why) => list.push({ term, why })

  // --- MUST: the brand, every correct form ---
  for (const form of latinForms(brand.NAME)) push(must, form, 'brand, Latin')
  for (const alias of brand.ALIASES) push(must, alias, 'brand, declared alias')
  for (const derived of persianSpellingVariants(brand.ALIASES)) {
    push(must, derived, 'brand, derived Persian encoding')
  }

  // --- MUST: every game, every correct form ---
  for (const game of Object.values(GAMES)) {
    for (const form of latinForms(game.name)) push(must, form, `${game.id}, Latin`)
    for (const alt of game.altNames) push(must, alt, `${game.id}, declared alias`)
    for (const derived of persianSpellingVariants(game.altNames)) {
      push(must, derived, `${game.id}, derived Persian encoding`)
    }
  }

  // --- MUST: the two Unity tools, both spellings ---
  for (const name of ['Unity DocSnap', 'Unity DirectTMP']) {
    for (const form of latinForms(name)) push(must, form, 'tool')
  }

  // --- SHOULD: the misspellings that are answered in prose ---
  for (const [kind, term] of Object.entries(brand.TYPOS_SHOWN || {})) {
    push(should, term, `answered on /about (${kind})`)
  }

  // --- LEARNED: everything else, expected ABSENT ---
  const shown = new Set(Object.values(brand.TYPOS_SHOWN || {}))
  for (const typo of brand.MISSPELLINGS) {
    if (!shown.has(typo)) push(learned, typo, 'left to spelling correction')
  }

  return { must, should, learned }
}


// ==========================================
// The corpus: every indexable page, every language.
//
// Lower-cased, and with the HTML entity for an apostrophe undone,
// because escapeHtml() writes &#39; where a query has an
// apostrophe. Nothing else is normalised - the whole point is to
// match the bytes as they are served.
// ==========================================
async function buildCorpus() {
  const seen = new Set()
  const parts = []

  for (const entry of indexablePaths(GAMES)) {
    for (const code of LANGUAGES.supported) {
      const path = localizedPath(entry.loc, code)
      if (seen.has(path)) continue
      seen.add(path)
      parts.push(await fetchPage(path))
    }
  }

  return {
    pages: seen.size,
    text: parts.join('\n').replace(/&#39;/g, "'").toLowerCase()
  }
}


// ==========================================
// Report
// ==========================================
const corpus = await buildCorpus()
const { must, should, learned } = buildQueries()

// ==========================================
// Matching, with a boundary.
//
// A plain substring test reported two false leaks on its first
// run, and both were the same mistake: a misspelling that is a
// PREFIX of the correct name always matches it. "Amir Collide" is
// inside "Amir Collider"; "アミールコライダ" is inside
// "アミールコライダー". Neither had leaked anywhere - the matcher was
// finding the correct spelling and calling it the wrong one.
//
// So a match has to be followed by something that is not a letter
// of the same word. Latin, Perso-Arabic and kana all count as
// letters here; punctuation, markup and whitespace do not.
//
// Only the trailing edge is checked. A leading boundary would
// reject "AmirCollider" inside "amircollider.com/about", which is
// a legitimate occurrence of the name.
// ==========================================
const WORD_CHAR = /[\p{L}\p{M}\u200C]/u

function has(term) {
  const needle = term.toLowerCase()
  let from = 0

  for (;;) {
    const at = corpus.text.indexOf(needle, from)
    if (at === -1) return false

    const after = corpus.text[at + needle.length]
    if (after === undefined || !WORD_CHAR.test(after)) return true
    from = at + 1
  }
}

let failures = 0
const line = (ok, term, why) => {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'MISS'}  ${term.padEnd(24)}  ${why}`)
}

console.log(`Corpus: ${corpus.pages} pages, ${(corpus.text.length / 1024 | 0)} KB${REMOTE ? ' (live site)' : ' (local)'}\n`)

console.log('MUST be present - correct spellings, every encoding')
for (const q of must) line(has(q.term), q.term, q.why)

console.log('\nSHOULD be present - misspellings answered in prose on /about')
for (const q of should) line(has(q.term), q.term, q.why)

console.log('\nEXPECTED ABSENT - left to the search engine to correct')
for (const q of learned) {
  const present = has(q.term)
  // Present is not a hard failure, but it IS a warning: it means a
  // misspelling has leaked onto a page, which is the direction
  // that turns into keyword stuffing.
  console.log(`  ${present ? 'WARN' : 'ok  '}  ${q.term.padEnd(24)}  ${present ? 'LEAKED onto a page' : q.why}`)
  if (present) failures++
}

// TYPOS_SHOWN must be a subset of MISSPELLINGS, or the two lists
// have drifted and the /about answer is naming something the
// reference list does not know about.
const all = new Set(CONFIG.BRAND.MISSPELLINGS)
const orphans = Object.values(CONFIG.BRAND.TYPOS_SHOWN || {}).filter(t => !all.has(t))
if (orphans.length) {
  console.log(`\nTYPOS_SHOWN not in MISSPELLINGS: ${orphans.join(', ')}`)
  failures += orphans.length
}

console.log(
  failures
    ? `\n${failures} problem(s).`
    : `\nAll ${must.length + should.length} required spellings reach a page; all ${learned.length} reference misspellings are correctly absent.`
)
process.exit(failures ? 1 : 0)
