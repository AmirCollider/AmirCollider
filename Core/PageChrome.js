// ==========================================
// Core/PageChrome.js
// The two inline scripts every server-rendered page ships.
//
// themeBootScript runs before first paint, so a visitor who chose
// light never sees a dark flash on the way in. It has to be inline
// and it has to be in <head> — anything else paints first.
// ==========================================

import { LANGUAGES, THEME } from '../Config.js'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function themeBootScript() {
  return `<script>
    (function () {
      try {
        var t = localStorage.getItem('${THEME.storageKey}');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  </script>`
}

export function chromeScript() {
  return `<script>
    (function () {
      function acThemeIsDark() {
        return getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
      }

      function acApplyThemeLabel() {
        var btn = document.getElementById('themeBtn');
        if (!btn) return;
        var next = acThemeIsDark() ? 'data-to-light' : 'data-to-dark';
        btn.setAttribute('aria-label', btn.getAttribute(next) || (acThemeIsDark() ? 'Light mode' : 'Dark mode'));
      }

      window.acToggleTheme = function () {
        var next = acThemeIsDark() ? 'light' : 'dark';
        var commit = function () {
          document.documentElement.setAttribute('data-theme', next);
          acApplyThemeLabel();
        };
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (document.startViewTransition && !reduce) document.startViewTransition(commit);
        else commit();

        try { localStorage.setItem('${THEME.storageKey}', next); } catch (e) {}
        document.cookie = '${THEME.cookieKey}=' + next + ';path=/;max-age=${COOKIE_MAX_AGE};samesite=lax';
      };

      window.acSetLang = function (code) {
        try { localStorage.setItem('${LANGUAGES.storageKey}', code); } catch (e) {}
        document.cookie = '${LANGUAGES.cookieKey}=' + code + ';path=/;max-age=${COOKIE_MAX_AGE};samesite=lax';
        var url = new URL(window.location.href);
        url.searchParams.set('lang', code);
        window.location.href = url.toString();
        return false;
      };

      acApplyThemeLabel();
    })();
  </script>`
}
