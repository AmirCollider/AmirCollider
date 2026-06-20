// ==========================================
// pages/leaderboard.js
// Leaderboard Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../shared-styles.js'
import {
  validateGameId,
  createJsonResponse,
  createHtmlResponse,
  sanitizeInput,
  logInfo,
  logWarning,
  logError
} from '../utils.js'

// ==========================================
// Helper: رنگ رتبه
// ==========================================
function getRankColor(rank) {
  if (rank === 1) return 'linear-gradient(135deg, #FFD700, #FFA500)'
  if (rank === 2) return 'linear-gradient(135deg, #C0C0C0, #A8A8A8)'
  if (rank === 3) return 'linear-gradient(135deg, #CD7F32, #B87333)'
  return 'rgba(255,255,255,0.1)'
}

// ==========================================
// Helper: آیکون رتبه
// ==========================================
function getRankIcon(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

// ==========================================
// Handler: Unified Leaderboard
// ==========================================
export async function handleLeaderboardUnified(url, request, gameId, requestId, GAMES, envVars) {
  const game = validateGameId(gameId, GAMES)
  if (!game) {
    return createJsonResponse({
      error: 'invalid_game',
      message: 'Game configuration not found',
      requestId
    }, 400)
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  const lastPart = pathParts[pathParts.length - 1]
  const parsedLimit = parseInt(lastPart)
  const limit = (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 1000) ? parsedLimit : 100

  logInfo('Unified Leaderboard request', { requestId, gameId, limit })

  try {
    let topPlayers = []
    let total = 0

    // ── D1 (neon-katana و بازی‌های آینده) ──────────────────
    if (game.d1Binding) {
      const db = envVars[game.d1Binding]
      if (!db) {
        return createJsonResponse({
          error: 'db_not_bound',
          message: `D1 binding "${game.d1Binding}" not found`,
          requestId
        }, 500)
      }

      const { results } = await db.prepare(`
        SELECT username AS displayName, high_score AS highScore,
               profile_pic_url AS photoURL, selected_color AS selectedColor
        FROM players
        ORDER BY high_score DESC
        LIMIT ?
      `).bind(limit).all()

      topPlayers = (results || []).map((row, index) => ({
  rank: index + 1,
  username: row.displayName || 'Unknown User',
  displayName: row.displayName || 'Unknown User',
  highScore: row.highScore || 0,
  photoURL: row.photoURL || '',
  selectedColor: row.selectedColor || 'FFFFFF',
  gameId
}))
      total = topPlayers.length

      logInfo('D1 leaderboard retrieved', { requestId, gameId, total })

    // ── Firebase (iraknife-hit) ──────────────────────────────
    } else if (game.firebase?.db) {
      const leaderboardUrl = `${game.firebase.db}/games/${gameId}/leaderboard.json`
      logInfo('Fetching from Firebase', { requestId, url: leaderboardUrl })

      const response = await fetch(leaderboardUrl)

      if (!response.ok) {
        logWarning('Leaderboard fetch failed', { requestId, status: response.status, gameId })
        return createJsonResponse({
          error: 'firebase_error',
          message: `Firebase returned status ${response.status}`,
          requestId
        }, response.status)
      }

      const leaderboardData = await response.json()

      if (!leaderboardData || typeof leaderboardData !== 'object' || Object.keys(leaderboardData).length === 0) {
        logWarning('No leaderboard data found', { requestId, gameId })
        return _returnEmpty(request, game, url.origin, limit, requestId)
      }

      const leaderboardArray = Object.entries(leaderboardData)
        .map(([uid, data]) => {
          if (typeof data !== 'object' || data === null) return null
          const highScore = parseInt(data.highScore || data.score || 0)
          if (highScore <= 0) return null
          return {
            uid,
            displayName: data.displayName || data.username || 'Unknown User',
            highScore,
            photoURL: data.photoURL || '',
            selectedKnife: (data.selectedKnife && data.selectedKnife.trim() !== '') ? data.selectedKnife : 'Knife_01',
            gameId: data.gameId || gameId,
            timestamp: data.timestamp || Date.now()
          }
        })
        .filter(Boolean)

      if (leaderboardArray.length === 0) {
        return _returnEmpty(request, game, url.origin, limit, requestId)
      }

      leaderboardArray.sort((a, b) => {
        if (b.highScore !== a.highScore) return b.highScore - a.highScore
        return (b.timestamp || 0) - (a.timestamp || 0)
      })

      total = leaderboardArray.length
      topPlayers = leaderboardArray.slice(0, limit).map((player, index) => ({
        rank: index + 1,
        displayName: player.displayName,
        highScore: player.highScore,
        photoURL: player.photoURL,
        selectedKnife: player.selectedKnife,
        gameId: player.gameId
      }))

    } else {
      return createJsonResponse({
        error: 'no_database',
        message: 'No database configured for this game',
        requestId
      }, 500)
    }

    if (topPlayers.length === 0) {
      return _returnEmpty(request, game, url.origin, limit, requestId)
    }

    logInfo('Leaderboard retrieved successfully', {
      requestId,
      gameId,
      total,
      returned: topPlayers.length
    })

    const jsonResponse = {
      leaderboard: topPlayers,
      total,
      limit,
      returned: topPlayers.length,
      requestId,
      timestamp: new Date().toISOString()
    }

    const acceptHeader = request.headers.get('Accept') || ''
    if (acceptHeader.includes('application/json')) {
      return createJsonResponse(jsonResponse, 200)
    }

    return createHtmlResponse(
      createLeaderboardPage(topPlayers, game, url.origin, total, limit, requestId, gameId),
      200
    )

  } catch (error) {
    logError('Unified Leaderboard handler error', {
      requestId,
      gameId,
      error: error.message,
      stack: error.stack
    })
    return createJsonResponse({
      error: 'server_error',
      message: error.message,
      requestId
    }, 500)
  }
}

// ==========================================
// Helper داخلی: برگرداندن پاسخ خالی
// (تکرار کد حذف شد — DRY)
// ==========================================
function _returnEmpty(request, game, origin, limit, requestId) {
  const acceptHeader = request.headers.get('Accept') || ''
  if (acceptHeader.includes('application/json')) {
    return createJsonResponse({
      leaderboard: [],
      total: 0,
      limit,
      returned: 0,
      requestId,
      timestamp: new Date().toISOString()
    }, 200)
  }
  return createHtmlResponse(createEmptyLeaderboardPage(game, origin, limit), 200)
}

// ==========================================
// Page: Leaderboard با بازیکنان
// ==========================================
function createLeaderboardPage(players, game, baseUrl, total, limit, requestId, gameId) {
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${getPageHead({
    title: `🏆 Leaderboard - ${game.name} | AmirCollider`,
    amirLogo,
    description: `نمایش برترین بازیکنان ${game.name} - جدول امتیازات و رتبه‌بندی`
  })}
  <style>
    ${getSharedCSS(game.color)}

    .container {
      max-width: 1000px;
      background: transparent;
      backdrop-filter: none;
      padding: 0;
      box-shadow: none;
    }

    .header {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 30px;
      border-radius: 20px;
      margin-bottom: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
    }

    .header-logos { margin-bottom: 20px; }
    .logo-circle { width: 100px; height: 100px; }

    .stats {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-top: 15px;
      flex-wrap: wrap;
    }

    .stat-item {
      background: rgba(0,0,0,0.3);
      padding: 10px 20px;
      border-radius: 15px;
      font-weight: bold;
    }

    .stat-value {
      color: #4caf50;
      font-size: 1.3em;
      margin-left: 5px;
    }

    .players-list { display: grid; gap: 15px; }

    .player-row {
      backdrop-filter: blur(20px);
      padding: 20px;
      border-radius: 15px;
      display: flex;
      align-items: center;
      gap: 20px;
      transition: all 0.3s;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      border: 2px solid transparent;
      animation: slideInRight calc(var(--index) * 0.1s) ease;
    }

    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(30px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .player-row:hover {
      transform: translateY(-5px) scale(1.02);
      box-shadow: 0 15px 40px rgba(0,0,0,0.3);
      border-color: rgba(255,255,255,0.3);
    }

    .rank-badge {
      font-size: 2em;
      font-weight: bold;
      min-width: 60px;
      text-align: center;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }

    .player-avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
      object-fit: cover;
      background: white;
    }

    .player-info { flex: 1; min-width: 0; }

    .player-name {
      font-size: 1.3em;
      font-weight: bold;
      margin-bottom: 5px;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .player-score {
      font-size: 2em;
      font-weight: bold;
      color: #ffeb3b;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      min-width: 120px;
      text-align: left;
    }

    @media (max-width: 768px) {
      .container { padding: 10px; }
      .logo-circle { width: 80px; height: 80px; }
      .player-row { padding: 15px; gap: 15px; }
      .rank-badge { font-size: 1.5em; min-width: 50px; }
      .player-avatar { width: 50px; height: 50px; }
      .player-name { font-size: 1.1em; }
      .player-score { font-size: 1.5em; min-width: 100px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${getLogosHTML(amirLogo, gameLogo, game.name)}
      <h1>🏆 جدول امتیازات</h1>
      <div class="stats">
        <div class="stat-item">📊 تعداد کل: <span class="stat-value">${total}</span></div>
        <div class="stat-item">👥 نمایش: <span class="stat-value">${players.length}</span></div>
        <div class="stat-item">🎯 محدودیت: <span class="stat-value">${limit}</span></div>
      </div>
    </div>

    <div class="players-list">
      ${players.map((player, index) => `
        <div class="player-row" style="--index: ${index}; background: ${getRankColor(player.rank)};">
          <div class="rank-badge">${getRankIcon(player.rank)}</div>
          <img src="${player.photoURL || `https://via.placeholder.com/60?text=${encodeURIComponent(player.displayName.charAt(0))}`}"
               alt="${sanitizeInput(player.displayName)}"
               class="player-avatar"
               onerror="this.src='https://via.placeholder.com/60?text=${encodeURIComponent(player.displayName.charAt(0))}'">
          <div class="player-info">
            <div class="player-name">${sanitizeInput(player.displayName)}</div>
          </div>
          <div class="player-score">🏆 ${player.highScore.toLocaleString('fa-IR')}</div>
        </div>
      `).join('')}
    </div>

    <div class="btn-container">
      <a href="${baseUrl}" class="btn">🏠 صفحه اصلی</a>
      <a href="${baseUrl}/${gameId}/leaderboard" class="btn btn-secondary">🔄 بروزرسانی</a>
    </div>
  </div>
</body>
</html>`
}

// ==========================================
// Page: Leaderboard خالی
// ==========================================
function createEmptyLeaderboardPage(game, baseUrl, limit) {
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  ${getPageHead({ title: `🏆 Leaderboard - ${game.name} | AmirCollider`, amirLogo })}
  <style>
    ${getSharedCSS(game.color)}

    body {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .container {
      max-width: 600px;
      text-align: center;
    }

    .empty-icon {
      font-size: 5em;
      margin: 20px 0;
      animation: bounce 2s infinite;
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-15px); }
    }
  </style>
</head>
<body>
  <div class="container">
    ${getLogosHTML(amirLogo, gameLogo, game.name)}
    <div class="empty-icon">🏆</div>
    <h1>جدول امتیازات خالی است</h1>
    <p style="font-size: 1.1em; margin: 20px 0; opacity: 0.9;">
      هنوز هیچ بازیکنی امتیاز ثبت نکرده است.<br>
      اولین نفر باشید!
    </p>
    <div class="btn-container">
      <a href="${baseUrl}" class="btn">🏠 بازگشت به صفحه اصلی</a>
    </div>
  </div>
</body>
</html>`
}