// ==========================================
// Pages/PlayerProfile.js
// GET /profile/<uid> - a player's public page, server-rendered,
// theme-aware and direction-correct in all three languages.
// ==========================================

import { validateGameId } from '../Config.js'
import { createHtmlResponse } from '../Core/Http.js'
import { createErrorPage } from '../Core/ErrorPage.js'
import { logError } from '../Core/Logging.js'
import { escapeHtml } from '../Core/Html.js'
import { parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'
import { authText, authLocale, renderAuthShell } from './AuthFlow.js'

export async function handleUserProfile(url, request, gameId, requestId, GAMES, env) {
  const game = validateGameId(gameId, GAMES)
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)
  const t = key => authText(lang, key)

  if (!game) {
    return createHtmlResponse(createErrorPage(t('gameNotFound'), null, lang), 404)
  }

  const uid = url.pathname.replace('/profile/', '')
  if (!uid) {
    return createHtmlResponse(createErrorPage(t('userIdRequired'), game, lang), 400)
  }
  if (!game.d1Binding) {
    return createHtmlResponse(createErrorPage(t('gameNotSupported'), game, lang), 400)
  }

  try {
    const player = await env[game.d1Binding]
      .prepare('SELECT * FROM players WHERE player_id = ? LIMIT 1').bind(uid).first()

    if (!player) {
      return createHtmlResponse(createErrorPage(t('userNotFound'), game, lang), 404)
    }

    return createHtmlResponse(renderProfilePage({
      email: player.email,
      username: player.username,
      displayName: player.username,
      photoURL: player.profile_pic_url,
      highScore: player.high_score,
      gamesPlayed: player.games_played,
      createdAt: player.created_at,
      lastLogin: player.last_login
    }, game, gameId, lang, theme))

  } catch (error) {
    logError('Profile fetch error', { requestId, gameId, error: error.message })
    return createHtmlResponse(createErrorPage(t('serverError'), game, lang), 500)
  }
}


function renderProfilePage(userData, game, gameId, lang, theme) {
  const code = resolveLang(lang)
  const locale = authLocale(code)
  const formatDate = value => {
    try { return new Date(value || Date.now()).toLocaleString(locale) } catch { return '' }
  }

  const stats = [
    { value: userData.highScore || 0, label: authText(lang, 'highScore') },
    { value: userData.gamesPlayed || 0, label: authText(lang, 'gamesPlayed') }
  ].map(stat => `
      <div class="info-card" style="text-align:center;">
        <div style="font-size:2em;font-weight:800;color:var(--accent);">${escapeHtml(String(stat.value))}</div>
        <div class="ac-muted">${escapeHtml(stat.label)}</div>
      </div>`).join('')

  const rows = [
    [authText(lang, 'userId'), userData.username],
    [authText(lang, 'lastLogin'), formatDate(userData.lastLogin)],
    [authText(lang, 'joined'), formatDate(userData.createdAt)]
  ].map(([label, value]) => `
      <div class="info-row"><span class="ac-muted">${escapeHtml(label)}</span><span style="font-weight:700;">${escapeHtml(String(value || ''))}</span></div>`).join('')

  const body = `
    <div style="text-align:center;">
      <img src="${escapeHtml(userData.photoURL || '/assets/DefaultGameLogo.png')}" alt=""
           style="width:120px;height:120px;border-radius:50%;border:4px solid var(--surface-2);object-fit:cover;"
           onerror="this.onerror=null;this.src='/assets/DefaultGameLogo.png';">
      <h1 style="margin-block-start:16px;">${escapeHtml(userData.displayName || userData.username)}</h1>
      <p class="ac-muted">${escapeHtml(userData.email || '')}</p>
      <span class="version-badge">${escapeHtml(game.name)}</span>
    </div>

    <div class="info-grid">${stats}</div>

    <div class="info-card">
      <h2 style="margin-block:0 14px;">${escapeHtml(authText(lang, 'accountInfo'))}</h2>
      ${rows}
    </div>

    <div class="btn-container">
      <a class="btn" href="/?lang=${code}">${escapeHtml(authText(lang, 'backHome'))}</a>
      <a class="btn btn-secondary" href="/oauth/auth?game=${escapeHtml(gameId)}">${escapeHtml(authText(lang, 'enterGame'))}</a>
    </div>`

  return renderAuthShell({
    title: `${authText(lang, 'profile')} - ${userData.displayName || userData.username}`,
    lang, theme, brandColor: game.color, body
  })
}
