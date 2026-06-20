// ==========================================
// Shared Styles & HTML Helpers
// ==========================================

export function getSharedCSS(gameColor = '#667eea', accentColor = '#4caf50') {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, ${gameColor}, #764ba2);
      min-height: 100vh;
      padding: 40px 20px;
      color: white;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(25px);
      padding: 50px;
      border-radius: 25px;
      box-shadow: 0 30px 70px rgba(0,0,0,0.3);
      animation: fadeIn 0.6s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .header-logos {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 40px;
      margin-bottom: 30px;
      flex-direction: row-reverse;
    }

    .logo-container {
      position: relative;
      animation: logoFloat 3s ease-in-out infinite;
      text-align: center;
    }

    .logo-container:first-child { animation-delay: 0s; }
    .logo-container:last-child { animation-delay: 1.5s; }

    @keyframes logoFloat {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-10px); }
    }

    .logo-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      border: 4px solid white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: all 0.3s ease;
      margin: 0 auto;
    }

    .logo-circle:hover {
      transform: scale(1.1);
      box-shadow: 0 15px 40px rgba(0,0,0,0.4);
    }

    .logo-circle img {
      width: 120%;
      height: 120%;
      object-fit: cover;
      object-position: center;
    }

    .logo-container:first-child .logo-circle img {
      object-fit: contain;
      padding: 10px;
    }

    .logo-label {
      text-align: center;
      margin-top: 12px;
      font-size: 0.95em;
      opacity: 0.95;
      font-weight: bold;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
    }

    h1 {
      font-size: 2.5em;
      margin-bottom: 20px;
      color: #ffeb3b;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
      text-align: center;
    }

    h2 {
      font-size: 1.8em;
      margin: 35px 0 20px;
      color: ${accentColor};
      border-right: 5px solid ${accentColor};
      padding-right: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin: 30px 0;
    }

    .info-card {
      background: rgba(0,0,0,0.2);
      padding: 20px;
      border-radius: 15px;
      border-right: 4px solid ${accentColor};
    }

    .info-card h3 {
      font-size: 1.3em;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .info-row:last-child { border-bottom: none; }

    .json-box {
      background: rgba(0,0,0,0.3);
      padding: 20px;
      border-radius: 15px;
      margin: 20px 0;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      overflow-x: auto;
      border: 2px solid rgba(76,175,80,0.3);
    }

    .highlight-box {
      background: rgba(76,175,80,0.2);
      border: 2px solid #4caf50;
      border-radius: 15px;
      padding: 20px;
      margin: 20px 0;
    }

    .warning-box {
      background: rgba(255,152,0,0.2);
      border: 2px solid #ff9800;
      border-radius: 15px;
      padding: 20px;
      margin: 20px 0;
    }

    .contact-info {
      background: rgba(33,150,243,0.2);
      border: 2px solid #2196f3;
      border-radius: 15px;
      padding: 25px;
      margin: 30px 0;
    }

    .contact-info a {
      color: #4caf50;
      text-decoration: none;
      font-weight: bold;
      transition: all 0.3s;
    }

    .contact-info a:hover {
      color: #8bc34a;
      text-decoration: underline;
    }

    .btn-container {
      text-align: center;
      display: flex;
      gap: 15px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 30px;
    }

    .btn {
      background: linear-gradient(135deg, #4caf50, #8bc34a);
      color: white;
      padding: 15px 40px;
      border-radius: 12px;
      text-decoration: none;
      display: inline-block;
      font-weight: bold;
      transition: all 0.3s;
      box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      border: none;
      cursor: pointer;
    }

    .btn:hover {
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }

    .btn-secondary {
      background: linear-gradient(135deg, #2196f3, #03a9f4);
    }

    .version-badge {
      display: inline-block;
      background: rgba(76,175,80,0.3);
      color: #4caf50;
      padding: 6px 15px;
      border-radius: 20px;
      font-size: 0.85em;
      border: 2px solid #4caf50;
      margin-top: 10px;
    }

    p, li {
      line-height: 1.9;
      margin: 15px 0;
      font-size: 1.05em;
    }

    ul { padding-right: 30px; }

    li {
      margin: 12px 0;
      position: relative;
    }

    .last-update {
      text-align: center;
      margin-top: 40px;
      padding-top: 30px;
      border-top: 2px solid rgba(255,255,255,0.2);
      opacity: 0.8;
      font-size: 0.9em;
    }

    @media (max-width: 768px) {
      .container { padding: 30px 20px; }
      h1 { font-size: 2em; }
      h2 { font-size: 1.5em; }
      .header-logos { flex-direction: column; gap: 25px; }
      .logo-circle { width: 100px; height: 100px; }
    }
  `
}

export function getLogosHTML(amirLogo, gameLogo, gameName) {
  return `
    <div class="header-logos">
      <div class="logo-container">
        <div class="logo-circle">
          <img src="${amirLogo}" alt="AmirCollider Logo"
               onerror="this.onerror=null;this.src='https://drive.google.com/uc?export=view&id=1kwjfUTVmbHOtJbl0DbXoOq9-BWitQBnw';">
        </div>
        <div class="logo-label">AmirCollider</div>
      </div>
      <div class="logo-container">
        <div class="logo-circle">
          <img src="${gameLogo}" alt="${gameName} Logo"
               onerror="this.onerror=null;this.src='https://drive.google.com/thumbnail?id=1X198sJb0HIMm_1ENKeX9CWuwWsHlnshD&sz=w200';">
        </div>
        <div class="logo-label">${gameName}</div>
      </div>
    </div>
  `
}

export function getPageHead({ title, amirLogo, description = '' }) {
  return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="google-site-verification" content="uFvaRQchIco-iyGmdsNknLK7mL5Asxg47GjaOQmhf0Q" />
  <title>${title}</title>
  <link rel="icon" href="${amirLogo}" type="image/png">
  <link rel="shortcut icon" href="${amirLogo}" type="image/png">
  <link rel="apple-touch-icon" href="${amirLogo}">
  ${description ? `<meta name="description" content="${description}">` : ''}
  `
}