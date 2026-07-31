// ==========================================
// Core/ErrorPage.js
// The last page a visitor sees when a handler could not finish.
//
// `message` is display text the caller has already localized;
// `lang` only decides the page chrome and the text direction.
// ==========================================

import { CONFIG, LANGUAGES } from '../Config.js'
import { getSharedCSS, getPageHead } from './DesignSystem.js'
import { sanitizeInput } from './Html.js'

const CHROME = {
  fa: { heading: 'خطا', back: 'بازگشت' },
  en: { heading: 'Error', back: 'Back' },
  ja: { heading: 'エラー', back: '戻る' }
}

const ALERT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'

const FALLBACK_GAME = {
  logo: CONFIG.AMIR_LOGO,
  color: '#f44336',
  name: 'AmirCollider Games'
}

export function createErrorPage(message, game, lang = LANGUAGES.default) {
  const brand = game || FALLBACK_GAME
  const code = LANGUAGES.supported.includes(lang) ? lang : LANGUAGES.default
  const chrome = CHROME[code]

  return `<!DOCTYPE html>
<html lang="${code}" dir="${LANGUAGES.meta[code].dir}">
<head>
  ${getPageHead({ title: `${chrome.heading} - AmirCollider Proxy`, amirLogo: brand.logo })}
  <style>
    ${getSharedCSS(brand.color)}

    body { display: flex; align-items: center; justify-content: center; }
    .container { max-width: 500px; text-align: center; }

    .error-icon {
      width: 84px;
      height: 84px;
      margin: 0 auto 20px;
      color: var(--brand);
      animation: shake 0.5s ease;
    }
    .error-icon svg { width: 100%; height: 100%; }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-10px); }
      75% { transform: translateX(10px); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">${ALERT_ICON}</div>
    <h1>${chrome.heading}</h1>
    <p style="margin: 20px 0; font-size: 1.1em;">${sanitizeInput(message)}</p>
    <div class="btn-container">
      <button onclick="window.history.back()" class="btn">${chrome.back}</button>
    </div>
  </div>
</body>
</html>`
}
