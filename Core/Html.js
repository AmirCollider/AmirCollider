// ==========================================
// Core/Html.js
// Output-safety helpers for server-rendered markup.
//
// Every value interpolated into HTML goes through one of these.
// The distinction that matters:
//   escapeHtml   -> text nodes and attribute values
//   jsString     -> values embedded inside an inline <script>
//   safeColor    -> values interpolated into a style attribute,
//                   where escaping is not enough and only a real
//                   hex colour may pass
// ==========================================

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/** Escapes HTML metacharacters. Nullish becomes an empty string. */
export function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => HTML_ENTITIES[char])
}

/** Escapes and trims a string; non-strings are returned untouched. */
export function sanitizeInput(input) {
  return typeof input === 'string' ? escapeHtml(input).trim() : input
}

/**
 * Encodes a value as a JavaScript string literal for an inline <script>.
 * `<` is escaped so the payload can never close the surrounding tag.
 */
export function jsString(value) {
  return JSON.stringify(String(value == null ? '' : value)).replace(/</g, '\\u003c')
}

/** A six-digit hex colour, or the fallback. */
export function safeColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? value : fallback
}


// ==========================================
// The ink that reads on an accent-coloured field
//
// Every filled control that is painted with the game's accent -
// the download button, the current nav tab, the pressed language
// segment, the primary action on a dashboard card - is a gradient
// from the accent toward white, and the text on top of it used to
// be a hard-coded `#fff`. That is a bet that every accent anybody ever picks is
// dark, and it loses the first time somebody picks a bright one.
//
// Chrono Blades is #20fea9, a bright mint. White on the middle
// of that gradient measures 1.28:1. The floor for readable text
// is 4.5:1, so the label was not "hard to read" - it was very
// nearly invisible, and no amount of squinting was going to fix
// it.
//
// So the ink is measured rather than assumed. Both candidates
// are scored against the MIDDLE of the gradient (the honest
// worst case for the whole button, since white text fails
// hardest at the light end) and the better one wins. A dark
// accent still gets white, exactly as before; a light one gets a
// near-black tinted with its own hue, which reads as deliberate
// rather than as a black rectangle dropped on the colour.
//
// The result is one CSS variable, so a rule can stop caring which
// case it is in. It lives in Core rather than beside one page
// because three separate chromes paint with an accent - the game
// pages, the dashboard cards and the site header - and they each
// had their own copy of the same wrong assumption.
// ==========================================

/** A #rrggbb string as [r, g, b], or null if it is not one. */
function channels(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!match) return null
  const value = match[1]
  return [0, 2, 4].map(at => parseInt(value.slice(at, at + 2), 16))
}

/** WCAG relative luminance. */
function luminance(rgb) {
  const linear = rgb.map(channel => {
    const scaled = channel / 255
    return scaled <= 0.04045 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** WCAG contrast ratio between two colours, 1 to 21. */
function contrast(a, b) {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

export function accentInk(value) {
  const accent = channels(safeColor(value, '#6c63ff'))
  if (!accent) return '#fff'

  // The middle of the button's gradient: the accent already a
  // quarter of the way to white. Scoring against the base alone
  // would pass a colour whose right-hand half is unreadable.
  const middle = accent.map(channel => Math.round(channel + (255 - channel) * 0.25))

  // A near-black that keeps the accent's hue. Pure black works
  // too, but on a coloured field it reads as a hole rather than
  // as type.
  const dark = accent.map(channel => Math.round(channel * 0.16))
  const white = [255, 255, 255]

  return contrast(middle, white) >= contrast(middle, dark)
    ? '#fff'
    : '#' + dark.map(channel => channel.toString(16).padStart(2, '0')).join('')
}

// ==========================================
// Reorders the items inside every <ul> so the shortest line comes
// first and the longest last.
//
// A policy page is a stack of bullet lists, and a list whose lines
// arrive in whatever order they were typed reads as ragged: a
// four-word bullet wedged between two full sentences looks like a
// mistake even when every line is correct. Sorted by length the
// block becomes a wedge, which is the shape an eye scans fastest
// and the shape the owner asked for by name.
//
// It runs at RENDER time rather than being baked into the content
// dictionaries on purpose. The same sentence is a different length
// in Persian, English and Japanese, so an order hand-sorted for one
// language is wrong in the other two - and the next person to edit
// a bullet would have to re-sort three lists by hand or silently
// break the rule. Sorting here keeps all three right, for good.
//
// Length is measured over the visible text with tags stripped, so a
// <strong> label or a link does not inflate a line, and it counts
// code points rather than UTF-16 units so an emoji or a Japanese
// character weighs one. The sort is stable: lines that measure the
// same keep the order they were authored in.
//
// Deliberately naive about nesting - it assumes a <ul> holds only
// <li> elements and no inner <ul>, which is what every list on the
// policy pages is. A nested list would be flattened into its
// parent's ordering, so if one ever appears, this needs a real
// parser rather than a regex.
// ==========================================
export function sortListItems(html) {
  return String(html == null ? '' : html).replace(
    /<ul([^>]*)>([\s\S]*?)<\/ul>/g,
    (whole, attrs, inner) => {
      const items = inner.match(/<li\b[\s\S]*?<\/li>/g)
      if (!items || items.length < 2) return whole
      const ranked = items.map((item, index) => ({ item, index, len: visibleLength(item) }))
      ranked.sort((a, b) => (a.len - b.len) || (a.index - b.index))
      return '<ul' + attrs + '>' + ranked.map(entry => entry.item).join('') + '</ul>'
    }
  )
}

/** Visible length of a fragment: tags dropped, entities counted as one. */
export function visibleLength(html) {
  const text = String(html == null ? '' : html)
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:[a-z]+|#\d+);/gi, ' ')
    .trim()
  return [...text].length
}

/** "r, g, b" triplet for a hex colour, for use inside rgba(). */
export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean
  const int = parseInt(full || '667eea', 16)
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`
}
