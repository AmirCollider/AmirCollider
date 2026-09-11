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

      // Kept byte-for-byte in step with siteChromeScript() in
      // Core/SiteNav.js. Both are loaded on some pages and the last
      // definition wins, so the two disagreeing is a page whose
      // language switcher depends on script order.
      var AC_LANGS = ${JSON.stringify(LANGUAGES.supported)};
      var AC_DEFAULT = ${JSON.stringify(LANGUAGES.default)};

      window.acSetLang = function (code) {
        if (AC_LANGS.indexOf(code) === -1) return false;
        try { localStorage.setItem('${LANGUAGES.storageKey}', code); } catch (e) {}
        document.cookie = '${LANGUAGES.cookieKey}=' + code + ';path=/;max-age=${COOKIE_MAX_AGE};samesite=lax';

        var url = new URL(window.location.href);
        url.searchParams.delete('lang');

        var parts = url.pathname.split('/');
        if (parts.length > 1 && AC_LANGS.indexOf(parts[1]) !== -1) parts.splice(1, 1);
        var bare = parts.join('/');
        if (bare.charAt(0) !== '/') bare = '/' + bare;

        url.pathname = code === AC_DEFAULT
          ? bare
          : '/' + code + (bare === '/' ? '' : bare);

        window.location.href = url.toString();
        return false;
      };

      // Back to top.
      //
      // The behaviour lives here rather than on each page because
      // the button is the same button everywhere: siteBackToTop()
      // in Core/SiteNav.js renders it and siteNavCss() styles it,
      // so a page that wants one should not also have to carry
      // twenty lines of scroll handling. Every branch is guarded on
      // the element existing, so a page that renders no button is
      // unaffected by this running.
      //
      // The markup arrives carrying [hidden] from the server, so a
      // reader with no JavaScript never sees a control that cannot
      // work; taking that off is the first thing done here.
      //
      // Kept in step with the same block in siteChromeScript()
      // (Core/SiteNav.js). A page may load both scripts, and both
      // doing the same harmless thing twice is fine - the listeners
      // are idempotent - while the two DISAGREEING would be a
      // button whose behaviour depends on script order.
      var acTop = document.getElementById('acTopBtn');
      if (acTop) {
        acTop.hidden = false;
        var acTicking = false;
        var acSyncTop = function () {
          acTicking = false;
          var y = window.pageYOffset || document.documentElement.scrollTop || 0;
          acTop.classList.toggle('is-on', y > 320);
        };
        window.addEventListener('scroll', function () {
          if (acTicking) return;
          acTicking = true;
          window.requestAnimationFrame(acSyncTop);
        }, { passive: true });
        acTop.addEventListener('click', function () {
          var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
          // Focus goes back to where the page starts, so a keyboard
          // reader lands at the top rather than staying parked on a
          // button that has just scrolled out of sight.
          var first = document.querySelector('.ac-brand') || document.body;
          if (first && first.focus) first.focus({ preventScroll: true });
        });
        acSyncTop();
      }

      acApplyThemeLabel();
    })();
  </script>`
}
