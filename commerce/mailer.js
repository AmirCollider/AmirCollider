// ==========================================
// commerce/mailer.js
// Getting a rendered message out of the Worker and into an
// inbox.
//
// Public exports:
//   mailConfigured(env)
//   sendNow(env, message)      one attempt, all providers
//   flushOutbox(env, database) the retry pass, for cron
//   enqueueAndSend(env, database, message)
//
// Two providers, tried in order, because this is the step
// that decides whether somebody who paid gets what they
// paid for. Everything upstream can be retried by a cron
// tick; a mail provider that is refusing our API key at the
// moment of a sale is the one failure the customer
// experiences directly, as silence.
//
// Resend first, Brevo second, and either alone is enough -
// the second is configured or it is not. Failover happens
// inside a single attempt, so a Resend outage costs a
// customer nothing rather than costing them the length of
// the retry schedule.
//
// Note for anyone updating this: MailChannels used to be
// the free path out of a Worker and was withdrawn. There is
// no zero-configuration mail from a Worker any more; one of
// these API keys has to be set.
// ==========================================

import { CONFIG } from '../config.js'
import { logError, logInfo, logWarning } from '../utils.js'
import {
  queueMail, findDueMail, markMailSent, markMailFailed, getMail, markDelivered
} from './orders.js'


// ==========================================
// senderFor
// The From address, and the name in front of it.
//
// Read from the environment rather than fixed, because it
// has to match a domain verified with whichever provider is
// in use. A From address the provider has not verified is
// rejected outright by Resend and silently spam-foldered by
// everyone else, which is the worse of the two.
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
//
// The immediate send happens inside a payment webhook, and
// a payment provider that does not get a prompt 200 marks
// the callback failed and retries it. A mail API having a
// slow minute must not turn into a webhook timeout, because
// the retry that follows is a second delivery attempt for
// the same money.
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
//
// Returns the first success. On total failure it returns
// the reasons from all of them joined together, because
// "Resend said 401 and Brevo said 402" is a diagnosis and
// "sending failed" is not.
//
// Never throws. Every caller is either inside a webhook
// that must still answer 200 or inside a cron tick that
// must go on to the next message, and neither has anything
// useful to do with an exception.
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
// The order is the whole design. Queue-then-send means a
// message that fails is already durable and will be retried
// by cron; send-then-queue would lose exactly the messages
// that needed the queue. It costs one extra D1 write per
// email, which against the cost of a customer paying and
// receiving nothing is not a trade worth thinking about.
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
//
// Bounded per tick rather than draining the queue, because
// a cron invocation has a CPU budget and a backlog after a
// provider outage could be hundreds of messages. Twenty per
// tick clears a realistic backlog within a few minutes and
// cannot starve the reconciliation work that shares the
// same tick.
//
// Re-reads each row before marking it, because a message
// can be sent by the immediate path between this pass
// selecting it and reaching it - and marking an
// already-sent row failed would put it back in the queue.
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
