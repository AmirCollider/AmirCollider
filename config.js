export const SECURITY = {
  CSRF_TOKEN_LENGTH: 32,
  MAX_REQUEST_SIZE: 10 * 1024 * 1024,
  RATE_LIMIT_PER_IP: 50,
  RATE_LIMIT_WINDOW: 60000,
  SESSION_COOKIE_NAME: 'amir_db_session',
  CSRF_COOKIE_NAME: 'amir_csrf_token',
  SECURE_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  }
}

export const CONFIG = {
  VERSION: '6.7.3',
  STATE_EXPIRY_MS: 30 * 60 * 1000,
  REDIRECT_TIMEOUT_MS: 1000,
  MAX_RETRIES: 5,
  RETRY_DELAY_MS: 800,
  PING_TIMEOUT_MS: 5000,
  TOKEN_MAX_AGE_MS: 3600 * 1000,
  SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  AUTO_COPY_CODE: true,
  SUPPORT_EMAIL: 'amircollider@yahoo.com',
  AMIR_LOGO: 'https://drive.google.com/thumbnail?id=1kwjfUTVmbHOtJbl0DbXoOq9-BWitQBnw&sz=w200',
  DEFAULT_GAME_LOGO: 'https://drive.google.com/uc?export=view&id=1X198sJb0HIMm_1ENKeX9CWuwWsHlnshD'
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Game-ID, X-Request-ID, X-CSRF-Token',
  'Access-Control-Max-Age': '86400'
}

export function getGamesConfig(envVars) {
  return {
    'neon-katana': {
      name: 'Neon Katana',
      icon: '⚔️🍉',
      color: '#FF5722',
      description: 'بازی شمشیر نئونی',
      logo: 'https://drive.google.com/thumbnail?id=1X198sJb0HIMm_1ENKeX9CWuwWsHlnshD&sz=w200',
      myketUrl: 'https://myket.ir/app/com.AmirColliderGames.NeonKatana',
      d1Binding: 'NEON_KATANA_DB',
      package: 'com.AmirColliderGames.NeonKatana',
      oauth: {
        android: envVars.NEON_KATANA_GOOGLE_CLIENT_ID_ANDROID,
        web: envVars.NEON_KATANA_GOOGLE_CLIENT_ID_WEB,
        secret: envVars.NEON_KATANA_GOOGLE_CLIENT_SECRET
      },
      deepLink: {
        scheme: 'com.amircollidergames.neonkatana',
        host: 'oauth'
      }
    }
  }
}
