// ==========================================
// Scripts/HtmlRewriterShim.mjs
// A stand-in for Cloudflare's HTMLRewriter, so the checks in
// this folder can run on bare node.
//
//   import { installHtmlRewriterShim } from './HtmlRewriterShim.mjs'
//   installHtmlRewriterShim()
//
// READ THIS BEFORE TRUSTING A PASS FROM IT.
//
// This is NOT Cloudflare's parser. It is a small tag walker that
// implements exactly the handful of operations Api/AssetApi.js
// uses, and it buffers - which the real one does not, and which is
// the entire reason the real one is used there. What it can tell
// you is whether the HANDLERS are wired correctly: which
// attributes get set, what gets inserted, and where. What it
// cannot tell you is anything about streaming, about malformed
// markup, or about a selector more complicated than the four in
// that file.
//
// Supported, because that is what is used:
//   selectors            tag, tag.class, tag[attr]
//   element.setAttribute(name, value)
//   element.getAttribute(name)
//   element.remove()
//   element.prepend(html, { html: true })
//   element.onEndTag(fn)  ->  end.before(html, { html: true })
//
// Handlers run in document order, same as the real one, because
// the code under test relies on that: the sidebar is seen before
// the closing body tag.
// ==========================================

function parseSelector(selector) {
  const match = /^([a-zA-Z][\w-]*)(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/.exec(selector.trim())
  if (!match) throw new Error('HtmlRewriterShim: selector not supported: ' + selector)
  return { tag: match[1].toLowerCase(), className: match[2] || null, attribute: match[3] || null }
}

function attributesOf(tagText) {
  const attributes = {}
  for (const m of tagText.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g)) {
    attributes[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : '')
  }
  return attributes
}

function matches(selector, tag, attributes) {
  if (selector.tag !== tag) return false
  if (selector.className) {
    const classes = String(attributes.class || '').split(/\s+/)
    if (!classes.includes(selector.className)) return false
  }
  if (selector.attribute && !(selector.attribute in attributes)) return false
  return true
}

class ShimHTMLRewriter {
  constructor() { this.rules = [] }

  on(selector, handlers) {
    this.rules.push({ selector: parseSelector(selector), handlers })
    return this
  }

  transform(response) {
    const rules = this.rules
    const stream = (async () => {
      const html = await response.text()
      return rewrite(html, rules)
    })()

    // Same shape as the real thing: a Response whose headers are
    // the original's and whose body is the rewritten document.
    return new Response(new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(await stream))
        controller.close()
      }
    }), { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}

function rewrite(html, rules) {
  const edits = []
  const endTags = []

  // One pass over every opening tag, in document order.
  const tagPattern = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
  for (const match of html.matchAll(tagPattern)) {
    const tag = match[1].toLowerCase()
    const attributeText = match[2]
    const attributes = attributesOf(attributeText)
    const start = match.index
    const end = start + match[0].length

    for (const rule of rules) {
      if (!matches(rule.selector, tag, attributes)) continue
      if (!rule.handlers.element) continue

      const pending = { setAttrs: {}, prepends: [], removed: false, endHandlers: [] }
      rule.handlers.element({
        tagName: tag,
        getAttribute: (name) => (name.toLowerCase() in attributes ? attributes[name.toLowerCase()] : null),
        setAttribute: (name, value) => { pending.setAttrs[name] = String(value) },
        removeAttribute: (name) => { pending.setAttrs[name] = null },
        remove: () => { pending.removed = true },
        prepend: (content) => { pending.prepends.push(content) },
        onEndTag: (fn) => { pending.endHandlers.push(fn) }
      })

      if (pending.removed) {
        const closeAt = html.indexOf('</' + tag, end)
        const stop = closeAt < 0 ? end : html.indexOf('>', closeAt) + 1
        edits.push({ at: start, until: stop, text: '' })
        continue
      }

      if (Object.keys(pending.setAttrs).length) {
        let next = attributeText
        for (const [name, value] of Object.entries(pending.setAttrs)) {
          const existing = new RegExp('\\s' + name + '\\s*=\\s*"[^"]*"', 'i')
          if (value === null) { next = next.replace(existing, '') }
          else if (existing.test(next)) { next = next.replace(existing, ' ' + name + '="' + value + '"') }
          else { next = next + ' ' + name + '="' + value + '"' }
        }
        edits.push({ at: start, until: end, text: '<' + tag + next + '>' })
      }

      for (const content of pending.prepends) {
        edits.push({ at: end, until: end, text: content })
      }

      // NOT called here. The real rewriter calls an end-tag
      // handler when it REACHES the closing tag, which is after
      // everything between - and the code under test depends on
      // exactly that: it decides at </body> whether the sidebar
      // was seen. Calling it at registration time made the bar
      // appear twice, which is the shim lying rather than the
      // code being wrong.
      for (const fn of pending.endHandlers) {
        const closeAt = html.lastIndexOf('</' + tag)
        endTags.push({ at: closeAt < 0 ? html.length : closeAt, fn })
      }
    }
  }

  // The end-tag handlers, once the whole document has been seen,
  // in the order their closing tags appear.
  endTags.sort((a, b) => a.at - b.at)
  for (const { at, fn } of endTags) {
    const parts = []
    fn({ before: (content) => parts.push(content), after: () => {}, remove: () => {} })
    if (parts.length) { edits.push({ at, until: at, text: parts.join('') }) }
  }

  // Applied back to front so earlier offsets stay valid, and
  // stably, so two inserts at one point keep the order they were
  // recorded in.
  edits.sort((a, b) => (b.at - a.at) || (b.until - a.until))
  let out = html
  for (const edit of edits) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.until)
  }
  return out
}

export function installHtmlRewriterShim() {
  if (typeof globalThis.HTMLRewriter === 'undefined') {
    globalThis.HTMLRewriter = ShimHTMLRewriter
  }
  return globalThis.HTMLRewriter
}
