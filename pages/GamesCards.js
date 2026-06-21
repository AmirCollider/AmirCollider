// ==========================================
// pages/GamesCards.js
// Game Cards HTML Generator
// AmirCollider Games - Worker Proxy
// ==========================================

const MYKET_LOGO_URL = 'https://drive.google.com/thumbnail?id=1aSr-w6djqBfi0JwmudYBHG9P-eATTcIq&sz=w200'

// ==========================================
// دکمه‌های تست مشترک بین همه کارت‌ها
// ==========================================
function createTestButtons(id, baseUrl) {
  const btnBase = `
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 10px 6px;
    border-radius: 12px;
    font-size: 0.82em;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
    white-space: nowrap;
    width: 100%;
    box-sizing: border-box;
    letter-spacing: 0.2px;
  `

  const buttons = [
    {
      type: 'button',
      onclick: `testHealth('${id}')`,
      icon: '🩺',
      label: 'Health Check',
      bg: 'linear-gradient(135deg, #00B09B, #096f5f)',
      border: 'rgba(0,176,155,0.4)',
      shadow: 'rgba(0,176,155,0.35)',
    },
    {
      type: 'button',
      onclick: `testPing('${id}')`,
      icon: '📡',
      label: 'Ping Test',
      bg: 'linear-gradient(135deg, #6C63FF, #3b35c7)',
      border: 'rgba(108,99,255,0.4)',
      shadow: 'rgba(108,99,255,0.35)',
    },
    {
      type: 'button',
      onclick: `testMetrics('${id}')`,
      icon: '📊',
      label: 'Metrics',
      bg: 'linear-gradient(135deg, #F7971E, #c4720a)',
      border: 'rgba(247,151,30,0.4)',
      shadow: 'rgba(247,151,30,0.35)',
    },
    {
      type: 'a',
      href: `${baseUrl}/${id}/privacy`,
      icon: '🔒',
      label: 'حریم خصوصی',
      bg: 'linear-gradient(135deg, #43A047, #1b5e20)',
      border: 'rgba(67,160,71,0.4)',
      shadow: 'rgba(67,160,71,0.35)',
    },
    {
      type: 'a',
      href: `${baseUrl}/${id}/terms`,
      icon: '📜',
      label: 'شرایط استفاده',
      bg: 'linear-gradient(135deg, #1E88E5, #0d47a1)',
      border: 'rgba(30,136,229,0.4)',
      shadow: 'rgba(30,136,229,0.35)',
    },
    {
      type: 'a',
      href: `${baseUrl}/${id}/leaderboard`,
      icon: '🏆',
      label: 'جدول امتیازات',
      bg: 'linear-gradient(135deg, #F9A825, #e65100)',
      border: 'rgba(249,168,37,0.45)',
      shadow: 'rgba(249,168,37,0.4)',
    },
  ]

  const buttonsHTML = buttons.map(btn => {
    const style = `
      ${btnBase}
      background: ${btn.bg};
      border-color: ${btn.border};
      box-shadow: 0 3px 12px ${btn.shadow};
      color: #fff;
    `
    const inner = `
      <span style="font-size:1.1em;line-height:1;">${btn.icon}</span>
      <span>${btn.label}</span>
    `
    if (btn.type === 'button') {
      return `
        <button
          onclick="${btn.onclick}"
          style="${style}"
          onmouseenter="this.style.transform='translateY(-2px)';this.style.filter='brightness(1.1)'"
          onmouseleave="this.style.transform='';this.style.filter=''"
          onmousedown="this.style.transform='scale(0.97)'"
          onmouseup="this.style.transform='translateY(-2px)'"
        >${inner}</button>
      `
    } else {
      return `
        <a
          href="${btn.href}"
          style="${style}"
          onmouseenter="this.style.transform='translateY(-2px)';this.style.filter='brightness(1.1)'"
          onmouseleave="this.style.transform='';this.style.filter=''"
          onmousedown="this.style.transform='scale(0.97)'"
          onmouseup="this.style.transform='translateY(-2px)'"
        >${inner}</a>
      `
    }
  }).join('')

  return `
    <style>
      #result-${id} {
        margin-top: 14px;
        border-radius: 10px;
        font-size: 0.82em;
        font-family: 'Courier New', monospace;
        direction: ltr;
        text-align: left;
        word-break: break-all;
        line-height: 1.6;
        color: #e0e0e0;
      }
      #result-${id}:not(:empty) {
        padding: 12px 14px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: inset 0 2px 8px rgba(0,0,0,0.3);
        animation: fadeInResult 0.25s ease;
      }
      @keyframes fadeInResult {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    </style>

    <div style="margin-top: 6px;">
      <!-- عنوان بخش -->
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      ">
        <span style="
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          padding: 4px 10px;
          font-size: 0.8em;
          font-weight: 700;
          letter-spacing: 0.3px;
          color: rgba(255,255,255,0.85);
        ">🔍 تست سرویس‌ها</span>
      </div>

      <!-- گرید دکمه‌ها: ۳ ستون دسکتاپ، ۲ موبایل -->
      <div style="
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 9px;
      "
        class="svc-grid-${id}"
      >
        ${buttonsHTML}
      </div>

      <!-- استایل ریسپانسیو -->
      <style>
        @media (max-width: 480px) {
          .svc-grid-${id} {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      </style>

      <!-- نتیجه -->
      <div id="result-${id}"></div>
    </div>
  `
}

// ==========================================
// دکمه مایکت (اگر آدرس داشت)
// ==========================================
function createMyketButton(game) {
  if (!game.myketUrl) return ''
  return `
    <div style="margin-top: 18px;">
      <a
        href="${game.myketUrl}"
        target="_blank"
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 13px 20px;
          box-sizing: border-box;
          border-radius: 16px;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          border: 1.5px solid rgba(99,160,255,0.3);
          box-shadow: 0 4px 20px rgba(15,52,96,0.5), inset 0 1px 0 rgba(255,255,255,0.06);
          text-decoration: none;
          color: #fff;
          font-weight: 700;
          font-size: 0.95em;
          letter-spacing: 0.4px;
          transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
        "
        onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 30px rgba(15,52,96,0.7), inset 0 1px 0 rgba(255,255,255,0.1)';this.style.filter='brightness(1.12)'"
        onmouseleave="this.style.transform='';this.style.boxShadow='0 4px 20px rgba(15,52,96,0.5), inset 0 1px 0 rgba(255,255,255,0.06)';this.style.filter=''"
        onmousedown="this.style.transform='scale(0.98)'"
        onmouseup="this.style.transform='translateY(-3px)'"
      >
        <!-- لوگو مایکت -->
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 10px;
          overflow: hidden;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          border: 1.5px solid rgba(255,255,255,0.15);
        ">
          <img
            src="${MYKET_LOGO_URL}"
            alt="Myket"
            style="width: 100%; height: 100%; object-fit: cover; display: block;"
          >
        </div>

        <!-- متن -->
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 1px;">
          <span style="font-size: 0.72em; opacity: 0.65; font-weight: 500; letter-spacing: 0.5px;">دانلود رایگان از</span>
          <span style="font-size: 1.05em; font-weight: 800; letter-spacing: 0.3px;">مایکت</span>
        </div>

        <!-- آیکون دانلود -->
        <div style="
          margin-right: auto;
          width: 32px; height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.15);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.95em;
        ">📥</div>
      </a>
    </div>
  `
}

// ==========================================
// کارت پیش‌فرض (برای بازی‌های بدون کارت اختصاصی)
// ==========================================
function createDefaultGameCard(id, game, baseUrl) {
  return `
    <div class="game-card">
      <div class="game-header">
        <div class="logo-circle" style="
          width: 80px; height: 80px;
          border-radius: 15px;
          border: 3px solid white;
          box-shadow: 0 5px 15px rgba(0,0,0,0.3);
          overflow: hidden; background: white;
          display: flex; align-items: center; justify-content: center;
          animation: pulse 2s infinite;
        ">
          <img
            src="${game.logo}"
            alt="${game.name}"
            style="width:100%;height:100%;object-fit:cover;"
            onerror="this.style.display='none';this.parentElement.innerHTML='${game.icon}';"
          >
        </div>
        <div style="flex: 1;">
          <h2>${game.name}</h2>
          <div style="font-size:0.9em;opacity:0.8;margin-top:5px;">${game.description}</div>
          <span style="
            background: rgba(76,175,80,0.3); color: #4caf50;
            padding: 5px 15px; border-radius: 15px;
            display: inline-block; margin-top: 8px;
            font-size: 0.85em; font-weight: bold;
            border: 1px solid #4caf50;
          ">✓ فعال</span>
        </div>
      </div>
      ${createTestButtons(id, baseUrl)}
      ${createMyketButton(game)}
    </div>
  `
}

// ==========================================
// کارت اختصاصی: Neon Katana
// ==========================================
function createNeonKatanaCard(id, game, baseUrl) {
  return `
    <style>
      @keyframes shimmerNinja {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @keyframes floatLogo {
        0%, 100% { transform: translateY(0px) rotate(-1deg); }
        50%       { transform: translateY(-6px) rotate(1deg); }
      }
      @keyframes glowPulseOrange {
        0%, 100% { box-shadow: 0 0 18px 3px rgba(255,87,34,0.35), 0 8px 32px rgba(255,87,34,0.25); }
        50%       { box-shadow: 0 0 36px 8px rgba(255,152,0,0.55), 0 12px 40px rgba(255,87,34,0.4); }
      }
    </style>

    <div class="game-card" style="
      border: 1.5px solid rgba(255,120,50,0.45);
      background: linear-gradient(160deg,
        rgba(255,87,34,0.13) 0%,
        rgba(30,18,10,0.55) 50%,
        rgba(255,152,0,0.09) 100%
      );
      position: relative;
      overflow: hidden;
      border-radius: 20px;
      backdrop-filter: blur(6px);
    ">

      <!-- نوار گرادیانت بالا -->
      <div style="
        position: absolute; top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, transparent, #FF5722, #FF9800, #FF5722, transparent);
        background-size: 200% 100%;
        animation: shimmerNinja 2.2s infinite linear;
      "></div>

      <!-- هاله پس‌زمینه -->
      <div style="
        position: absolute; top: -40px; left: -40px;
        width: 200px; height: 200px;
        background: radial-gradient(circle, rgba(255,87,34,0.12) 0%, transparent 70%);
        pointer-events: none;
      "></div>

      <div class="game-header" style="margin-top: 14px; align-items: center;">

        <!-- لوگو با انیمیشن float -->
        <div style="
          width: 92px; height: 92px;
          border-radius: 22px;
          border: 2.5px solid rgba(255,120,50,0.7);
          overflow: hidden;
          background: linear-gradient(135deg, #fff5f0, #ffffff);
          display: flex; align-items: center; justify-content: center;
          animation: floatLogo 3.5s ease-in-out infinite, glowPulseOrange 3s ease-in-out infinite;
          flex-shrink: 0;
        ">
          <img
            src="${game.logo}"
            alt="${game.name}"
            style="width:100%;height:100%;object-fit:cover;"
            onerror="this.style.display='none';this.parentElement.innerHTML='${game.icon}';"
          >
        </div>

        <div style="flex: 1; padding-right: 4px;">
          <h2 style="
            color: #FFD180;
            font-size: 1.3em;
            letter-spacing: 0.5px;
            text-shadow: 0 2px 12px rgba(255,120,0,0.5);
            margin: 0 0 6px 0;
          ">${game.name}</h2>

          <div style="
            font-size: 0.88em;
            opacity: 0.82;
            line-height: 1.5;
          ">${game.description}</div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
            <span style="
              background: rgba(255,87,34,0.22);
              color: #FFAB76;
              padding: 4px 13px;
              border-radius: 20px;
              font-size: 0.78em;
              font-weight: 700;
              border: 1px solid rgba(255,87,34,0.4);
              letter-spacing: 0.3px;
            ">🍎 برش میوه</span>
            <span style="
              background: rgba(76,175,80,0.2);
              color: #69d977;
              padding: 4px 13px;
              border-radius: 20px;
              font-size: 0.78em;
              font-weight: 700;
              border: 1px solid rgba(76,175,80,0.45);
            ">✓ فعال</span>
          </div>
        </div>
      </div>

      <!-- خط جداکننده -->
      <div style="
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,120,50,0.35), transparent);
        margin: 18px 0 14px;
      "></div>

      ${createTestButtons(id, baseUrl)}
      ${createMyketButton(game)}
    </div>
  `
}

// ==========================================
// کارت اختصاصی: IraKnife Hit
// ==========================================
function createIraKnifeHitCard(id, game, baseUrl) {
  return `
    <style>
      @keyframes shimmerKnife {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @keyframes floatKnife {
        0%, 100% { transform: translateY(0px) rotate(1deg); }
        50%       { transform: translateY(-7px) rotate(-1.5deg); }
      }
      @keyframes glowPulseRed {
        0%, 100% { box-shadow: 0 0 18px 3px rgba(229,57,53,0.35), 0 8px 32px rgba(183,28,28,0.25); }
        50%       { box-shadow: 0 0 36px 8px rgba(229,57,53,0.6), 0 12px 40px rgba(183,28,28,0.45); }
      }
    </style>

    <div class="game-card" style="
      border: 1.5px solid rgba(229,57,53,0.45);
      background: linear-gradient(160deg,
        rgba(229,57,53,0.12) 0%,
        rgba(18,10,10,0.55) 50%,
        rgba(136,14,79,0.09) 100%
      );
      position: relative;
      overflow: hidden;
      border-radius: 20px;
      backdrop-filter: blur(6px);
    ">

      <!-- نوار گرادیانت بالا -->
      <div style="
        position: absolute; top: 0; left: 0; right: 0;
        height: 3px;
        background: linear-gradient(90deg, transparent, #E53935, #B71C1C, #E53935, transparent);
        background-size: 200% 100%;
        animation: shimmerKnife 2.5s infinite linear;
      "></div>

      <!-- هاله پس‌زمینه -->
      <div style="
        position: absolute; top: -40px; right: -40px;
        width: 200px; height: 200px;
        background: radial-gradient(circle, rgba(229,57,53,0.12) 0%, transparent 70%);
        pointer-events: none;
      "></div>

      <div class="game-header" style="margin-top: 14px; align-items: center;">

        <!-- لوگو با انیمیشن float -->
        <div style="
          width: 92px; height: 92px;
          border-radius: 22px;
          border: 2.5px solid rgba(229,57,53,0.65);
          overflow: hidden;
          background: linear-gradient(135deg, #fff0f0, #ffffff);
          display: flex; align-items: center; justify-content: center;
          animation: floatKnife 3.8s ease-in-out infinite, glowPulseRed 3s ease-in-out infinite;
          flex-shrink: 0;
        ">
          <img
            src="${game.logo}"
            alt="${game.name}"
            style="width:100%;height:100%;object-fit:cover;"
            onerror="this.style.display='none';this.parentElement.innerHTML='${game.icon}';"
          >
        </div>

        <div style="flex: 1; padding-right: 4px;">
          <h2 style="
            color: #EF9A9A;
            font-size: 1.3em;
            letter-spacing: 0.5px;
            text-shadow: 0 2px 12px rgba(229,57,53,0.5);
            margin: 0 0 6px 0;
          ">${game.name}</h2>

          <div style="
            font-size: 0.88em;
            opacity: 0.82;
            line-height: 1.5;
          ">${game.description}</div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
            <span style="
              background: rgba(229,57,53,0.2);
              color: #FF8A80;
              padding: 4px 13px;
              border-radius: 20px;
              font-size: 0.78em;
              font-weight: 700;
              border: 1px solid rgba(229,57,53,0.4);
              letter-spacing: 0.3px;
            ">🔪 پرتاپ چاقو</span>
            <span style="
              background: rgba(76,175,80,0.2);
              color: #69d977;
              padding: 4px 13px;
              border-radius: 20px;
              font-size: 0.78em;
              font-weight: 700;
              border: 1px solid rgba(76,175,80,0.45);
            ">✓ فعال</span>
          </div>
        </div>
      </div>

      <!-- خط جداکننده -->
      <div style="
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(229,57,53,0.35), transparent);
        margin: 18px 0 14px;
      "></div>

      ${createTestButtons(id, baseUrl)}
      ${createMyketButton(game)}
    </div>
  `
}

// ==========================================
// MAP کارت‌های اختصاصی
// برای اضافه کردن بازی جدید، فقط اینجا
// یک آیتم اضافه کنید
// ==========================================
const CUSTOM_CARD_RENDERERS = {
  'neon-katana': createNeonKatanaCard,
  'iraknife-hit': createIraKnifeHitCard
}

// ==========================================
// ساخت یک کارت (اختصاصی یا پیش‌فرض)
// ==========================================
function createGameCard(id, game, baseUrl) {
  const customRenderer = CUSTOM_CARD_RENDERERS[id]
  if (customRenderer) {
    return customRenderer(id, game, baseUrl)
  }
  return createDefaultGameCard(id, game, baseUrl)
}

// ==========================================
// گرید کامل کارت‌های بازی
// ==========================================
export function createGamesCardsHTML(GAMES, baseUrl) {
  return `
    <div class="games-grid">
      ${Object.entries(GAMES).map(([id, game]) => createGameCard(id, game, baseUrl)).join('')}
    </div>
  `
}