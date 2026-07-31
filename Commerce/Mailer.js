// ==========================================
// Commerce/Mailer.js
// Getting a rendered message out of the Worker and into an
// inbox.
// ==========================================

import { CONFIG } from '../Config.js'
import { logError, logInfo, logWarning } from '../Core/Logging.js'
import {
  queueMail, findDueMail, markMailSent, markMailFailed, getMail, markDelivered
} from './Orders.js'


// ==========================================
// senderFor
// The From address, and the name in front of it.
// ==========================================
function senderFor(env) {
  const address = (env && env.DOCSNAP_MAIL_FROM) || ''
  const name = (env && env.DOCSNAP_MAIL_FROM_NAME) || 'AmirCollider'
  return { address, name }
}


export function mailConfigured(env) {
  return Boolean(env && (env.RESEND_API_KEY || env.BREVO_API_KEY) && env.DOCSNAP_MAIL_FROM)
}


// ==========================================
// withTimeout
// A fetch that cannot outlive the request it sits in.
// ==========================================
async function withTimeout(promiseFactory, ms = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await promiseFactory(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}


// ==========================================
// sendViaResend
// ==========================================
async function sendViaResend(env, message) {
  const sender = senderFor(env)

  const response = await withTimeout(signal => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${sender.name} <${sender.address}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      // Replies go to the support address rather than to a
      // no-reply nobody reads. The key email tells the customer
      // to reply to it if something is wrong, and an address
      // that bounces would make that a lie.
      reply_to: CONFIG.SUPPORT_EMAIL
    }),
    signal
  }))

  if (response.ok) {
    // Keep the provider's own id for the message. It is the only
    // handle that can answer the question this system genuinely
    // cannot: not "did we hand it over" - which is all `ok` means -
    // but "did it reach the inbox, bounce, or get filed as spam".
    // That answer lives in the Resend dashboard, and without this id
    // there is nothing to look up.
    const id = await response.json().then(body => body && body.id).catch(() => null)
    return { ok: true, via: id ? 'resend:' + id : 'resend' }
  }

  const detail = await response.text().catch(() => '')
  return { ok: false, via: 'resend', status: response.status, detail: detail.slice(0, 300) }
}


// ==========================================
// sendViaBrevo
// ==========================================
async function sendViaBrevo(env, message) {
  const sender = senderFor(env)

  // Same treatment as Resend: keep the provider's message id, since
  // it is what a deliverability question is answered with.
  const response = await withTimeout(signal => fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: { email: sender.address, name: sender.name },
      to: [{ email: message.to }],
      replyTo: { email: CONFIG.SUPPORT_EMAIL },
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text
    }),
    signal
  }))

  if (response.ok) {
    const id = await response.json().then(body => body && body.messageId).catch(() => null)
    return { ok: true, via: id ? 'brevo:' + id : 'brevo' }
  }

  const detail = await response.text().catch(() => '')
  return { ok: false, via: 'brevo', status: response.status, detail: detail.slice(0, 300) }
}


// ==========================================
// sendNow
// One delivery attempt, across every configured provider.
// ==========================================
export async function sendNow(env, message) {
  if (!mailConfigured(env)) {
    return { ok: false, error: 'mail_not_configured: set DOCSNAP_MAIL_FROM and RESEND_API_KEY or BREVO_API_KEY' }
  }

  const providers = []
  if (env.RESEND_API_KEY) providers.push(sendViaResend)
  if (env.BREVO_API_KEY) providers.push(sendViaBrevo)

  const failures = []

  for (const send of providers) {
    try {
      const result = await send(env, message)
      if (result.ok) {
        logInfo('Mail sent', { via: result.via, kind: message.kind || 'unknown' })
        return result
      }
      failures.push(`${result.via}:${result.status}:${result.detail || ''}`)
      logWarning('Mail provider refused a message', { via: result.via, status: result.status })
    } catch (error) {
      const aborted = error && error.name === 'AbortError'
      failures.push(`${send.name}:${aborted ? 'timeout' : 'error'}:${error.message}`)
      logWarning('Mail provider unreachable', { provider: send.name, aborted })
    }
  }

  return { ok: false, error: failures.join(' | ') || 'no_provider_configured' }
}


// ==========================================
// enqueueAndSend
// Write the message down, then try to send it.
//
// Returns the outbox id either way, so the caller can
// report the row for support even when the send failed.
// ==========================================
export async function enqueueAndSend(env, database, message) {
  const id = await queueMail(database, message)

  const attempt = await sendNow(env, message)
  if (attempt.ok) {
    await markMailSent(database, id, attempt.via)
    return { id, sent: true, via: attempt.via }
  }

  await markMailFailed(database, id, 0, attempt.error)
  return { id, sent: false, error: attempt.error }
}


// ==========================================
// flushOutbox
// The retry pass.
// ==========================================
export async function flushOutbox(env, database, limit = 20) {
  const due = await findDueMail(database, limit)
  if (!due.length) return { attempted: 0, sent: 0 }

  let sent = 0

  for (const row of due) {
    const fresh = await getMail(database, row.id)
    if (!fresh || fresh.sent_at) continue

    const attempt = await sendNow(env, {
      to: fresh.to_email,
      subject: fresh.subject,
      html: fresh.html,
      text: fresh.text,
      kind: fresh.kind
    })

    if (attempt.ok) {
      await markMailSent(database, fresh.id, attempt.via)

      // A licence email that finally goes out on a retry is the
      // moment its order becomes delivered, and this is the only
      // place that can know it. Without this the order sits at
      // `issued` forever with the key already in the customer's
      // inbox - which reads, on the status page and in the stuck
      // -order alert, as a failed sale that is not failing.
      if (fresh.kind === 'license' && fresh.order_id) {
        await markDelivered(database, fresh.order_id)
      }

      sent++
    } else {
      await markMailFailed(database, fresh.id, fresh.attempts, attempt.error)
      logError('Mail retry failed', {
        mailId: fresh.id,
        orderId: fresh.order_id,
        attempts: fresh.attempts + 1,
        ceiling: CONFIG.COMMERCE.MAIL_RETRY_MINUTES.length
      })
    }
  }

  return { attempted: due.length, sent }
}
