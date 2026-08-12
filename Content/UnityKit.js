// ==========================================
// Content/UnityKit.js
// The Unity side of every game on this Worker, as files somebody
// can paste into a project and have it work.
//
// Public exports:
//   unityModules(game, origin, options)  -> [{ id, file, title, summary, notes, code }]
//   unityModule(game, origin, id)
//   constantsSource(spec, origin)        -> the <Name>Constants.cs text
//   androidManifestSource(spec)          -> AndroidManifest.xml text
//   MODULE_IDS
//
// WHAT "COMPLETE" MEANS HERE
// A kit is complete when somebody can follow it from an empty
// Unity project to a signed-in player with a saved score and
// nothing else open in another tab. That means the C# is not
// enough on its own:
//
//   Constants   every other file references it by name, so a kit
//               without it does not compile. It was the one file
//               this module never produced.
//   Manifest    Android hands the OAuth code back on a deep link.
//               No intent-filter, no code, no sign-in.
//   link.xml    IL2CPP strips [Serializable] classes that are only
//               ever constructed by JsonUtility, which turns every
//               parsed response into null in the release build and
//               nothing at all in the editor.
//   Google      the client ids, the SHA-1, the redirect URI and
//               the Play Console product ids. All of it outside
//               Unity, all of it required.
//   Bootstrap   one scene component showing the order the calls go
//               in, because six static classes and no example is a
//               puzzle rather than a kit.
//
// Everything is generated for ONE game: its id, its scheme, its
// package, its product ids, and this deployment's own origin.
// ==========================================

import { gamePlatforms } from '../Games/Registry.js'

export const MODULE_IDS = [
  'readme', 'constants', 'api', 'auth', 'player', 'leaderboard',
  'store', 'status', 'bootstrap', 'manifest', 'link', 'google'
]


// ==========================================
// helpers
// ==========================================
function pascal(id) {
  return String(id || 'game').split('-').filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1)).join('')
}


function base(origin) {
  return String(origin || 'https://amircollider.com').replace(/\/+$/, '')
}


function upperSnake(id) {
  return String(id || 'game').replace(/-/g, '_').toUpperCase()
}


// A C# identifier from a product id. Leading digits get a prefix,
// because "1000Shards" does not compile and a generator that
// emits code which does not compile is worse than no generator.
function csharpName(id) {
  const parts = String(id || 'item').split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const name = parts.map(part => part[0].toUpperCase() + part.slice(1)).join('')
  return /^[0-9]/.test(name) ? 'P' + name : (name || 'Item')
}


// The shape every generator below reads, from either a merged
// game (the Unity tab) or a scaffold spec (the New game tab).
// One reader means the two screens cannot drift apart.
function readGame(game, origin) {
  const id = String((game && game.id) || 'game')
  const pkg = (game && game.package) || `com.AmirColliderGames.${pascal(id)}`
  const deepLink = (game && game.deepLink) || {}
  const capabilities = (game && game.capabilities) || {}
  const products = ((game && game.store && game.store.products) || [])
    .filter(product => product && product.id)

  return {
    id,
    name: (game && game.name) || pascal(id),
    pascal: pascal(id),
    upper: upperSnake(id),
    package: pkg,
    scheme: deepLink.scheme || pkg.toLowerCase(),
    host: deepLink.host || 'oauth',
    base: base(origin),
    capabilities,
    products,
    platforms: gamePlatforms(game || {})
  }
}


// The environment variable names this game's OAuth secrets live
// under. Passed in by the caller when it knows them (the panel
// reads them from Config); derived from the id otherwise, which
// is the rule the scaffold generates by.
function envKeysFor(spec, provided) {
  const keys = provided || {}
  return {
    web: keys.web || `${spec.upper}_GOOGLE_CLIENT_ID_WEB`,
    android: keys.android || `${spec.upper}_GOOGLE_CLIENT_ID_ANDROID`,
    secret: keys.secret || `${spec.upper}_GOOGLE_CLIENT_SECRET`,
    deepLinkScheme: keys.deepLinkScheme || `${spec.upper}_DEEPLINK_SCHEME`
  }
}


// ==========================================
// Module: <Name>Constants.cs
//
// THE file. Every other module in this kit references it by
// name, and until now the kit did not contain it - so a project
// assembled from the Unity tab did not compile, and the missing
// symbol was a class the tab never mentioned.
// ==========================================
export function constantsSource(spec) {
  const products = spec.products || []

  const productIds = products.length
    ? products.map(product =>
        `            public const string ${csharpName(product.id)} = "${product.id}";`).join('\n')
    : '            // No products in this game\'s catalogue yet.'

  const skus = products.length
    ? products.map(product =>
        `            public const string ${csharpName(product.id)} = "${product.sku || String(product.id).replace(/-/g, '_')}";`).join('\n')
    : '            // No products in this game\'s catalogue yet.'

  const deepLink = spec.platforms.android
    ? `
        // ---- Android deep link ----
        // The scheme this build registered in its
        // AndroidManifest.xml. After a Google sign-in the Worker
        // hands the player back at DeepLinkRedirect, and Android
        // only delivers that URL to an app whose manifest claims
        // this exact scheme. The two are one string in two files:
        // change it here and change it there, or sign-in silently
        // dead-ends on a blank browser tab.
        public const string DeepLinkScheme   = "${spec.scheme}";
        public const string DeepLinkHost     = "${spec.host}";
        public const string DeepLinkRedirect = "${spec.scheme}://${spec.host}";
`
    : `
        // This game is published on the web, so there is no deep
        // link: the browser never leaves, and the OAuth code comes
        // back on the page's own URL.
        public const string DeepLinkScheme   = "";
        public const string DeepLinkHost     = "";
        public const string DeepLinkRedirect = "";
`

  return `// ==========================================
// ${spec.pascal}Constants.cs
// Generated by the AmirCollider TheGod panel for "${spec.name}".
//
// Save as: Assets/Scripts/AmirCollider/${spec.pascal}Constants.cs
//
// Nothing in this file is a secret. Every value below is either
// already in the APK, already in a URL a player can see, or
// already served by a public endpoint. The credential that is
// not here - the Google client secret - lives in the Worker and
// never reaches a build, which is the whole reason sign-in goes
// through the Worker instead of straight to Google.
// ==========================================

namespace AmirCollider
{
    public static class ${spec.pascal}Constants
    {
        // The Worker. No trailing slash - every path below starts
        // with one, and two slashes is a 404 that reads like a
        // server problem.
        public const string BaseUrl = "${spec.base}";

        // The game id, exactly as it appears in GAME_REGISTRY in
        // the Worker's Config.js. It is part of nearly every path,
        // so a typo here fails everything at once rather than one
        // feature at a time - which is the better failure.
        public const string GameId = "${spec.id}";

        public const string GameName    = "${String(spec.name).replace(/"/g, '\\"')}";
        public const string PackageName = "${spec.package}";
${deepLink}
        // ---- sign-in ----
        public const string OAuthStart    = BaseUrl + "/oauth/auth";
        public const string OAuthToken    = BaseUrl + "/oauth/token";
        public const string AuthRefresh   = BaseUrl + "/auth/refresh";
        public const string AuthValidate  = BaseUrl + "/auth/validate";
        public const string AuthCheck     = BaseUrl + "/auth/check";

        // ---- the player's own row ----
        public const string PlayerGet     = BaseUrl + "/database/get/games/" + GameId + "/users/";
        public const string PlayerSet     = BaseUrl + "/database/set/games/" + GameId + "/users/";
        public const string PlayerPatch   = BaseUrl + "/database/patch/games/" + GameId + "/users/";
        public const string Leaderboard   = BaseUrl + "/" + GameId + "/leaderboard";

        // ---- the store ----
        public const string Manifest      = BaseUrl + "/games/" + GameId + "/manifest";
        public const string Products      = BaseUrl + "/games/" + GameId + "/products";
        public const string Entitlements  = BaseUrl + "/games/" + GameId + "/entitlements";
        public const string Consume       = BaseUrl + "/games/" + GameId + "/entitlements/consume";

        // ---- pages, for Application.OpenURL ----
        public const string WebStore      = BaseUrl + "/" + GameId + "/store";
        public const string WebAccount    = BaseUrl + "/" + GameId + "/account";
        public const string WebLanding    = BaseUrl + "/" + GameId;
        public const string WebVersions   = BaseUrl + "/" + GameId + "/versions";
        public const string WebPrivacy    = BaseUrl + "/" + GameId + "/privacy";
        public const string WebTerms      = BaseUrl + "/" + GameId + "/terms";

        // ---- product ids ----
        // What this Worker and its entitlements API call each
        // product. Generated from the catalogue, so a product
        // renamed in Config.js is renamed here the next time this
        // file is generated - and a build still holding the old
        // string is exactly what the sku split below is for.
        public static class Products_
        {
${productIds}
        }

        // What the PLATFORM store calls the same products. A sku
        // is what Google Play is asked for; the id above is what
        // this Worker grants. They are allowed to differ, they
        // usually do, and confusing the two is a purchase that
        // completes and grants nothing.
        public static class Skus
        {
${skus}
        }
    }
}
`
}


function constantsModule(spec) {
  return {
    id: 'constants',
    file: `${spec.pascal}Constants.cs`,
    icon: '📌',
    title: {
      fa: 'فایل ثابت‌ها — از این‌جا شروع کن',
      en: 'The constants file — start here',
      ja: '定数ファイル — ここから'
    },
    summary: {
      fa: 'هر فایل دیگری در این کیت به این کلاس اشاره می‌کند. بدون آن هیچ‌کدام کامپایل نمی‌شوند. همه‌ی مقدارها برای همین بازی پر شده‌اند.',
      en: 'Every other file in this kit references this class by name; without it none of them compile. Every value is already filled in for this game.',
      ja: 'このキットの他のファイルはすべてこのクラスを参照します。これが無ければコンパイルできません。値はこのゲーム用に設定済みです。'
    },
    notes: {
      fa: [
        'اول این را اضافه کن، بعد بقیه را. ترتیب مهم است چون بقیه به این وابسته‌اند.',
        'هیچ‌چیز این فایل secret نیست؛ client secret هیچ‌وقت داخل بیلد نمی‌آید و کار تبادل توکن با Worker است.',
        'شناسه‌ی محصول (Products_) چیزی است که این Worker می‌شناسد و sku چیزی است که گوگل‌پلی می‌شناسد — این دو عمداً می‌توانند فرق کنند.'
      ],
      en: [
        'Add this first and the rest after it. The order matters: everything else depends on this file.',
        'Nothing here is a secret. The client secret never enters a build — exchanging the code for tokens is the Worker\'s job.',
        'Products_ is what this Worker knows a product as; Skus is what Google Play knows it as. They are deliberately allowed to differ.'
      ],
      ja: [
        '最初にこれを追加し、その後に他を追加します。他のすべてがこれに依存します。',
        'ここに秘密情報はありません。クライアントシークレットはビルドに入らず、トークン交換は Worker が行います。',
        'Products_ は Worker 側の ID、Skus は Google Play 側の ID です。意図的に異なることが許されています。'
      ]
    },
    code: constantsSource(spec)
  }
}


// ==========================================
// Module: AmirColliderApi.cs
// ==========================================
function apiModule(spec) {
  const code = `// ==========================================
// AmirColliderApi.cs
// One place where HTTP happens.
// ==========================================

using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace AmirCollider
{
    public class ApiResult
    {
        public bool Ok;
        public long Status;
        public string Body;
        public string Error;

        // True when the request never reached the server at all -
        // aeroplane mode, a captive portal, DNS. Worth telling
        // apart from a 4xx: one is "try again later" and the
        // other is "this will never work".
        public bool Offline;
    }

    public static class AmirColliderApi
    {
        // Long enough for a cold Worker on a bad mobile
        // connection, short enough that a player is not staring
        // at a spinner wondering whether the button worked.
        public const int TimeoutSeconds = 15;

        public static IEnumerator Get(string url, string idToken, Action<ApiResult> done)
        {
            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                yield return Send(request, idToken, done);
            }
        }

        public static IEnumerator Post(string url, string json, string idToken, Action<ApiResult> done)
        {
            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                byte[] payload = Encoding.UTF8.GetBytes(json ?? "{}");
                request.uploadHandler = new UploadHandlerRaw(payload);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                yield return Send(request, idToken, done);
            }
        }

        public static IEnumerator Put(string url, string body, string idToken, Action<ApiResult> done)
        {
            using (UnityWebRequest request = new UnityWebRequest(url, "PUT"))
            {
                byte[] payload = Encoding.UTF8.GetBytes(body ?? "");
                request.uploadHandler = new UploadHandlerRaw(payload);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                yield return Send(request, idToken, done);
            }
        }

        private static IEnumerator Send(UnityWebRequest request, string idToken, Action<ApiResult> done)
        {
            request.timeout = TimeoutSeconds;

            // The Worker reads this header to pick the game when
            // the path does not name one. Sending it always costs
            // nothing and removes a whole class of "why is it
            // reading the wrong database" afternoon.
            request.SetRequestHeader("X-Game-ID", ${spec.pascal}Constants.GameId);

            if (!string.IsNullOrEmpty(idToken))
            {
                request.SetRequestHeader("Authorization", "Bearer " + idToken);
            }

            yield return request.SendWebRequest();

            ApiResult result = new ApiResult();
            result.Status = request.responseCode;
            result.Body = request.downloadHandler != null ? request.downloadHandler.text : "";

#if UNITY_2020_1_OR_NEWER
            result.Offline = request.result == UnityWebRequest.Result.ConnectionError;
            bool failed = request.result != UnityWebRequest.Result.Success;
#else
            result.Offline = request.isNetworkError;
            bool failed = request.isNetworkError || request.isHttpError;
#endif

            result.Ok = !failed;
            result.Error = failed ? request.error : null;

            if (done != null) done(result);
        }

        // JsonUtility cannot parse a bare top-level array, which
        // is what the leaderboard endpoint returns. Wrapping it
        // is the standard workaround and it is one line, so it
        // lives here rather than being rediscovered per caller.
        public static T[] ParseArray<T>(string json)
        {
            if (string.IsNullOrEmpty(json)) return new T[0];
            string wrapped = "{\\"items\\":" + json + "}";
            Wrapper<T> parsed = JsonUtility.FromJson<Wrapper<T>>(wrapped);
            return parsed != null && parsed.items != null ? parsed.items : new T[0];
        }

        [Serializable]
        private class Wrapper<T> { public T[] items; }
    }
}
`

  return {
    id: 'api',
    file: 'AmirColliderApi.cs',
    icon: '🔌',
    title: {
      fa: 'لایه‌ی شبکه',
      en: 'The network layer',
      ja: 'ネットワーク層'
    },
    summary: {
      fa: 'همه‌ی درخواست‌های HTTP از این یک فایل رد می‌شوند: یک تایم‌اوت، یک تعریف از «خطا»، و یک جا برای اضافه کردن هدر.',
      en: 'Every HTTP call goes through this one file: one timeout, one definition of "failed", one place to add a header.',
      ja: 'すべての HTTP 呼び出しはこの 1 ファイルを通ります。タイムアウトも「失敗」の定義もヘッダー追加も 1 か所で。'
    },
    notes: {
      fa: [
        'تشخیص «آفلاین» از «۴۰۴» جدا نگه داشته شده؛ یکی یعنی بعداً دوباره امتحان کن، دیگری یعنی هیچ‌وقت جواب نمی‌دهد.',
        'هدر X-Game-ID همیشه فرستاده می‌شود تا مسیرهایی که بازی را در آدرس ندارند سراغ دیتابیس درست بروند.',
        'ParseArray برای پاسخ‌های آرایه‌ای مثل جدول امتیازات است — JsonUtility آرایه‌ی سطح‌بالا را نمی‌خواند.'
      ],
      en: [
        'Offline is kept distinct from a 404: one means try later, the other means this will never work.',
        'X-Game-ID goes on every request so paths that do not name a game still reach the right database.',
        'ParseArray exists because JsonUtility cannot read a top-level array, which is what the leaderboard returns.'
      ],
      ja: [
        'オフラインと 404 を区別します。前者は再試行、後者は永久に失敗です。',
        'X-Game-ID を常に送るため、ゲーム名を含まないパスでも正しい DB に届きます。',
        'JsonUtility はトップレベル配列を読めないため ParseArray を用意しています。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderAuth.cs
// ==========================================
function authModule(spec) {
  const name = spec.pascal

  const header = spec.platforms.android
    ? `// Two platforms, one flow:
//
//   Android   the browser opens, Google returns to
//             ${spec.scheme}://${spec.host}?code=...  and the app
//             wakes up holding the code.
//
//   Editor    there is no deep link, so the Worker shows the
//   / desktop code on a page and the player pastes it in. Ugly,
//             and it is the only honest option for a build with
//             no URL scheme registered.`
    : `// This game runs in a browser, so there is no deep link and
// nothing to register: the Worker shows the code on a page and
// SubmitCode() takes it. The same flow the editor uses.`

  const signIn = spec.platforms.android
    ? `#if UNITY_ANDROID && !UNITY_EDITOR
            string redirect = UnityWebRequestEscape(${name}Constants.DeepLinkRedirect);
            string url = ${name}Constants.OAuthStart
                       + "?redirect_uri=" + redirect
                       + "&platform=android"
                       + "&game=" + ${name}Constants.GameId;
#else
            // http://localhost is what the Worker recognises as a
            // desktop loopback; it answers with a page that shows
            // the code rather than trying to redirect anywhere.
            string url = ${name}Constants.OAuthStart
                       + "?redirect_uri=" + UnityWebRequestEscape("http://localhost")
                       + "&game=" + ${name}Constants.GameId;
#endif
            Application.OpenURL(url);`
    : `            // No registered scheme, so the Worker shows the code on
            // a page and SubmitCode() takes it from there.
            string url = ${name}Constants.OAuthStart
                       + "?redirect_uri=" + UnityWebRequestEscape("http://localhost")
                       + "&game=" + ${name}Constants.GameId;

            Application.OpenURL(url);`

  const deepLinkWiring = spec.platforms.android
    ? `            Application.deepLinkActivated += OnDeepLink;

            // A cold start from a deep link delivers the URL here
            // rather than through the event, because the event was
            // subscribed to after the activation happened.
            if (!string.IsNullOrEmpty(Application.absoluteURL))
            {
                OnDeepLink(Application.absoluteURL);
            }`
    : `            // No deep link on this platform. SubmitCode() is the
            // only way in, and that is not a limitation to work
            // around - it is what a browser build has.`

  const deepLinkHandler = spec.platforms.android
    ? `
        private void OnDeepLink(string url)
        {
            if (string.IsNullOrEmpty(url)) return;

            int at = url.IndexOf("code=", StringComparison.Ordinal);
            if (at < 0) return;

            string code = url.Substring(at + 5);
            int amp = code.IndexOf('&');
            if (amp >= 0) code = code.Substring(0, amp);

            StartCoroutine(ExchangeCode(Uri.UnescapeDataString(code)));
        }
`
    : ''

  const platformField = spec.platforms.android
    ? `            string body = "code=" + UnityWebRequestEscape(code) + "&platform="
#if UNITY_ANDROID && !UNITY_EDITOR
                        + "android";
#else
                        + "web";
#endif`
    : `            string body = "code=" + UnityWebRequestEscape(code) + "&platform=web";`

  const code = `// ==========================================
// AmirColliderAuth.cs
// Signing a player in with Google, through the Worker.
//
${header}
//
// Put this on ONE GameObject in the first scene. It survives
// scene loads and refuses to exist twice.
// ==========================================

using System;
using System.Collections;
using UnityEngine;

namespace AmirCollider
{
    [Serializable]
    public class TokenResponse
    {
        public string access_token;
        public string id_token;
        public string refresh_token;
        public int expires_in;
    }

    [Serializable]
    public class RefreshRequest { public string refreshToken; }

    public class AmirColliderAuth : MonoBehaviour
    {
        public static AmirColliderAuth Instance { get; private set; }

        // The id_token every authenticated call carries. It lasts
        // about an hour, which is why Refresh() below exists and
        // why nothing caches a copy of it anywhere else.
        public string IdToken { get; private set; }
        public string PlayerId { get; private set; }
        public string Email { get; private set; }

        public bool IsSignedIn { get { return !string.IsNullOrEmpty(IdToken); } }

        public event Action<bool> OnSignInFinished;

        private const string RefreshKey = "amircollider_refresh_${spec.id}";

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);

${deepLinkWiring}
        }

        // ==========================================
        // SignIn
        // Opens the browser. Everything after this happens in
        // OnDeepLink, or on the paste-the-code path below.
        // ==========================================
        public void SignIn()
        {
${signIn}
        }

        // Paste-the-code path, for the editor and for any build
        // without a registered URL scheme.
        public void SubmitCode(string code)
        {
            StartCoroutine(ExchangeCode(code));
        }
${deepLinkHandler}
        // ==========================================
        // ExchangeCode
        // The one call that needs the Worker rather than Google.
        //
        // Form-encoded, not JSON: /oauth/token reads a
        // URLSearchParams body, which is what an OAuth token
        // endpoint is specified to accept.
        // ==========================================
        private IEnumerator ExchangeCode(string code)
        {
${platformField}

            using (UnityEngine.Networking.UnityWebRequest request =
                   UnityEngine.Networking.UnityWebRequest.Post(${name}Constants.OAuthToken, ""))
            {
                byte[] payload = System.Text.Encoding.UTF8.GetBytes(body);
                request.uploadHandler = new UnityEngine.Networking.UploadHandlerRaw(payload);
                request.downloadHandler = new UnityEngine.Networking.DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                request.timeout = AmirColliderApi.TimeoutSeconds;

                yield return request.SendWebRequest();

                if (request.responseCode != 200)
                {
                    Debug.LogWarning("[AmirCollider] Sign-in failed: " + request.responseCode);
                    if (OnSignInFinished != null) OnSignInFinished(false);
                    yield break;
                }

                TokenResponse tokens = JsonUtility.FromJson<TokenResponse>(request.downloadHandler.text);
                Adopt(tokens);
            }

            if (OnSignInFinished != null) OnSignInFinished(IsSignedIn);
        }

        // ==========================================
        // Refresh
        // A new id_token from the stored refresh token.
        //
        // Call it on resume and whenever a request comes back
        // 401. An id_token lasts about an hour, so a game left
        // running over lunch has an expired one and no idea.
        // ==========================================
        public IEnumerator Refresh(Action<bool> done)
        {
            string refresh = PlayerPrefs.GetString(RefreshKey, "");
            if (string.IsNullOrEmpty(refresh))
            {
                if (done != null) done(false);
                yield break;
            }

            RefreshRequest payload = new RefreshRequest { refreshToken = refresh };

            yield return AmirColliderApi.Post(
                ${name}Constants.AuthRefresh,
                JsonUtility.ToJson(payload),
                null,
                result =>
                {
                    if (result.Ok)
                    {
                        Adopt(JsonUtility.FromJson<TokenResponse>(result.Body));
                    }
                    if (done != null) done(result.Ok);
                });
        }

        // True when a stored refresh token exists, so a returning
        // player can be signed back in without a browser opening
        // in their face on every launch.
        public bool CanResume()
        {
            return !string.IsNullOrEmpty(PlayerPrefs.GetString(RefreshKey, ""));
        }

        private void Adopt(TokenResponse tokens)
        {
            if (tokens == null) return;

            IdToken = tokens.id_token;

            // The refresh token is the credential worth
            // protecting: it does not expire on its own. PlayerPrefs
            // is not a secure store on any platform, so treat this
            // as convenience rather than security - anything that
            // matters is checked server-side against the id_token
            // anyway.
            if (!string.IsNullOrEmpty(tokens.refresh_token))
            {
                PlayerPrefs.SetString(RefreshKey, tokens.refresh_token);
                PlayerPrefs.Save();
            }

            Email = ReadEmailClaim(IdToken);
            PlayerId = PlayerIdFromEmail(Email);
        }

        public void SignOut()
        {
            IdToken = null;
            PlayerId = null;
            Email = null;
            PlayerPrefs.DeleteKey(RefreshKey);
            PlayerPrefs.Save();
        }

        // ==========================================
        // PlayerIdFromEmail
        // The same derivation the Worker makes.
        // ==========================================
        public static string PlayerIdFromEmail(string email)
        {
            if (string.IsNullOrEmpty(email)) return "";
            string local = email.Split('@')[0].ToLowerInvariant();
            return local.Length > 15 ? local.Substring(0, 15) : local;
        }

        // Reads one claim out of the JWT payload without
        // verifying anything, which is fine for a display name:
        // the token is checked by the server on every call that
        // matters, and a client lying to itself about its own
        // email address achieves nothing.
        private static string ReadEmailClaim(string jwt)
        {
            if (string.IsNullOrEmpty(jwt)) return "";
            string[] parts = jwt.Split('.');
            if (parts.Length < 2) return "";

            string payload = parts[1].Replace('-', '+').Replace('_', '/');
            switch (payload.Length % 4) { case 2: payload += "=="; break; case 3: payload += "="; break; }

            try
            {
                string json = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                int at = json.IndexOf("\\"email\\"", StringComparison.Ordinal);
                if (at < 0) return "";
                int start = json.IndexOf('"', json.IndexOf(':', at)) + 1;
                int end = json.IndexOf('"', start);
                return json.Substring(start, end - start);
            }
            catch { return ""; }
        }

        private static string UnityWebRequestEscape(string value)
        {
            return UnityEngine.Networking.UnityWebRequest.EscapeURL(value);
        }
    }
}
`

  const androidNotes = {
    fa: 'روی اندروید کد از طریق deep link برمی‌گردد — پس AndroidManifest.xml این کیت الزامی است، نه اختیاری.',
    en: 'On Android the code comes back on a deep link — so the AndroidManifest.xml in this kit is required, not optional.',
    ja: 'Android では code はディープリンクで戻ります。本キットの AndroidManifest.xml は必須です。'
  }
  const webNotes = {
    fa: 'این بازی تحت وب است: کد را Worker روی صفحه نشان می‌دهد و SubmitCode آن را می‌گیرد. دیپ‌لینک و manifest اصلاً لازم نیست.',
    en: 'This is a browser game: the Worker shows the code on a page and SubmitCode takes it. No deep link and no manifest are involved.',
    ja: 'これはブラウザーゲームです。Worker がページにコードを表示し、SubmitCode が受け取ります。ディープリンクも manifest も不要です。'
  }
  const first = spec.platforms.android ? androidNotes : webNotes

  return {
    id: 'auth',
    file: 'AmirColliderAuth.cs',
    icon: '🔑',
    title: {
      fa: 'ورود با گوگل',
      en: 'Google sign-in',
      ja: 'Google サインイン'
    },
    summary: {
      fa: 'بازی فقط یک code می‌گیرد؛ تبدیلش به توکن کار Worker است، چون client secret نباید داخل APK باشد.',
      en: 'The game only ever holds a code. Turning it into tokens is the Worker’s job, because a client secret inside an APK is a client secret anybody can read.',
      ja: 'ゲームは code のみを扱い、トークン交換は Worker が行います。APK 内のクライアントシークレットは誰でも読めるためです。'
    },
    notes: {
      fa: [
        first.fa,
        'شناسه‌ی بازیکن دقیقاً مثل سرور ساخته می‌شود (بخش اول ایمیل، حروف کوچک، ۱۵ کاراکتر) — اگر فرق کند حساب خالی خوانده می‌شود.',
        'id_token حدود یک ساعت اعتبار دارد؛ روی OnApplicationPause و روی هر ۴۰۱، Refresh را صدا بزن.',
        'CanResume() می‌گوید توکن ذخیره‌شده هست یا نه — با آن می‌شود بازیکن قدیمی را بدون باز شدن مرورگر برگرداند.'
      ],
      en: [
        first.en,
        'The player id is derived exactly as the server derives it — local part, lowercased, 15 characters. Differ and you read an empty account.',
        'An id_token lasts about an hour. Call Refresh on resume and on any 401.',
        'CanResume() reports whether a refresh token is stored, so a returning player can be signed back in without a browser opening in their face.'
      ],
      ja: [
        first.ja,
        'プレイヤー ID はサーバーと同じ導出（ローカル部・小文字・15 文字）。違えば空のアカウントを読みます。',
        'id_token は約 1 時間有効。復帰時と 401 時に Refresh を呼んでください。',
        'CanResume() は保存済みトークンの有無を返します。再訪プレイヤーをブラウザーを開かずに復帰できます。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderPlayer.cs
// ==========================================
function playerModule(spec) {
  const name = spec.pascal
  const code = `// ==========================================
// AmirColliderPlayer.cs
// The player's own row: profile, high score, inventory.
//
// Three endpoints, and the difference between them is worth
// knowing before you pick one:
//
//   GET   /database/get/...    reads. A leaderboard path is
//                              public; a user path is not.
//   POST  /database/set/...    writes a whole profile, or the
//                              high score on its own.
//   PATCH /database/patch/...  writes named fields only.
// ==========================================

using System;
using System.Collections;
using UnityEngine;

namespace AmirCollider
{
    // ==========================================
    // GameData
    // Whatever THIS game saves, in one place.
    //
    // Replace the fields below with your game's own. They are
    // examples, not a contract - the Worker stores this document
    // and never inspects it.
    // ==========================================
    [Serializable]
    public class GameData
    {
        public int levelsCompleted;
        public string[] unlockedItems;
        public bool soundEnabled = true;
    }

    [Serializable]
    public class PlayerProfile
    {
        public string uid;
        public string email;
        public string username;
        public string displayName;
        public string photoURL;
        public int highScore;
        public int gamesPlayed;
        public int totalPlayTime;

        // The free-form document. Empty on a game database that
        // has not run 0007, which reads as a default GameData
        // rather than an error.
        public GameData data;
        public string selectedColor;
        public long createdAt;
        public long lastLogin;
    }

    [Serializable]
    public class ScoreResult
    {
        public bool success;
        public string message;
        public int previousHighScore;
        public int newHighScore;
        public int improvement;
        public int currentHighScore;
    }

    [Serializable]
    public class ProfilePatch
    {
        public string username;
        public string selectedColor;
        public int totalPlayTime;

        // Merged into the stored document key by key, so a build
        // that has never heard of a field somebody added last
        // month does not delete it. Use SaveData() below rather
        // than setting this by hand.
        public GameData dataPatch;
    }

    public static class AmirColliderPlayer
    {
        // ==========================================
        // Load
        // The signed-in player's row.
        //
        // The row is created server-side on this read, so a first
        // sign-in returns a real profile rather than a 404 you
        // have to handle. Null here means the request failed —
        // no network, an expired token, or an id that is not the
        // one the token resolves to.
        // ==========================================
        public static IEnumerator Load(Action<PlayerProfile> done)
        {
            string uid = AmirColliderAuth.Instance.PlayerId;
            string token = AmirColliderAuth.Instance.IdToken;

            yield return AmirColliderApi.Get(
                ${name}Constants.PlayerGet + uid,
                token,
                result =>
                {
                    if (!result.Ok)
                    {
                        if (done != null) done(null);
                        return;
                    }
                    if (done != null) done(JsonUtility.FromJson<PlayerProfile>(result.Body));
                });
        }

        // ==========================================
        // SubmitScore
        // Sends a run's score. The server keeps the higher of the
        // two.
        //
        // The body is the bare number, not JSON.
        // ==========================================
        public static IEnumerator SubmitScore(int score, Action<ScoreResult> done)
        {
            string uid = AmirColliderAuth.Instance.PlayerId;
            string token = AmirColliderAuth.Instance.IdToken;

            yield return AmirColliderApi.Put(
                ${name}Constants.PlayerSet + uid + "/highScore",
                score.ToString(),
                token,
                result =>
                {
                    if (done == null) return;
                    if (!result.Ok) { done(null); return; }
                    done(JsonUtility.FromJson<ScoreResult>(result.Body));
                });
        }

        // ==========================================
        // Save
        // Writes named profile fields.
        // ==========================================
        public static IEnumerator Save(ProfilePatch patch, Action<bool> done)
        {
            string uid = AmirColliderAuth.Instance.PlayerId;
            string token = AmirColliderAuth.Instance.IdToken;

            yield return AmirColliderApi.Post(
                ${name}Constants.PlayerPatch + uid,
                JsonUtility.ToJson(patch),
                token,
                result => { if (done != null) done(result.Ok); });
        }

        // ==========================================
        // SaveData
        // This game's own saved state, merged.
        // ==========================================
        public static IEnumerator SaveData(GameData data, Action<bool> done)
        {
            yield return Save(new ProfilePatch { dataPatch = data }, done);
        }
    }
}
`

  return {
    id: 'player',
    file: 'AmirColliderPlayer.cs',
    icon: '👤',
    title: {
      fa: 'پروفایل و ذخیره‌ی ابری',
      en: 'Profile & cloud save',
      ja: 'プロフィールとクラウドセーブ'
    },
    summary: {
      fa: 'خواندن و نوشتن ردیف بازیکن. سرور بررسی می‌کند که شناسه‌ی داخل مسیر با شناسه‌ی داخل توکن یکی باشد.',
      en: 'Reading and writing the player row. The server checks the id in the path against the id in the token, so a client can only write its own.',
      ja: 'プレイヤー行の読み書き。サーバーはパスの ID とトークンの ID を照合するため、自分の行しか書けません。'
    },
    notes: {
      fa: [
        'امتیاز کمتر از رکورد با ۲۰۰ و success:false برمی‌گردد، نه خطا — این را خطا حساب نکن وگرنه حلقه‌ی تلاش بی‌پایان می‌سازی.',
        'بدنه‌ی ارسال امتیاز فقط خود عدد است، نه JSON.',
        'ردیف بازیکن را خودِ سرور موقع اولین خواندن می‌سازد، پس ۴۰۴ روی خواندن پروفایلِ خودت عملاً پیش نمی‌آید. اگر دیدی‌اش، یعنی توکن مال آن شناسه نیست.'
      ],
      en: [
        'A score below the record returns 200 with success:false — not an error. Treating it as one produces a retry loop that can never succeed.',
        'The score body is the bare number, not JSON.',
        'The server creates the player row on the first read, so a 404 on your own profile is effectively unreachable. If you do see one, the token does not belong to that player id.'
      ],
      ja: [
        '記録未満のスコアは 200 と success:false を返します。エラー扱いすると無限リトライになります。',
        'スコア送信のボディは JSON ではなく数値そのものです。',
        'プレイヤー行は初回読み取り時にサーバー側で作成されるため、自分のプロフィール取得で 404 になることは実質ありません。出た場合はトークンがその ID のものではありません。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderLeaderboard.cs
// ==========================================
function leaderboardModule(spec) {
  const name = spec.pascal
  const code = `// ==========================================
// AmirColliderLeaderboard.cs
// The public score table.
//
// Ask for the smallest board that fills the screen. The server
// caps it, but sending 100 rows to draw ten is ten times the
// bytes on a mobile connection for nothing.
// ==========================================

using System;
using System.Collections;
using UnityEngine;

namespace AmirCollider
{
    [Serializable]
    public class LeaderboardRow
    {
        public int rank;
        public string username;
        public string displayName;
        public int highScore;
        public string photoURL;
        public string selectedColor;
    }

    public static class AmirColliderLeaderboard
    {
        public static IEnumerator Top(int limit, Action<LeaderboardRow[]> done)
        {
            string url = ${name}Constants.Leaderboard + "/" + Mathf.Clamp(limit, 1, 100);

            yield return AmirColliderApi.Get(url, null, result =>
            {
                if (done == null) return;
                if (!result.Ok) { done(new LeaderboardRow[0]); return; }

                // The endpoint content-negotiates: an Accept of
                // application/json gets JSON, a browser gets the
                // rendered page. UnityWebRequest sends */*, and the
                // Worker answers JSON for that - but a response that
                // starts with '<' means something in the middle
                // decided otherwise, and parsing it would throw.
                if (result.Body.TrimStart().StartsWith("<")) { done(new LeaderboardRow[0]); return; }

                done(AmirColliderApi.ParseArray<LeaderboardRow>(result.Body));
            });
        }
    }
}
`

  return {
    id: 'leaderboard',
    file: 'AmirColliderLeaderboard.cs',
    icon: '🏆',
    title: {
      fa: 'جدول امتیازات',
      en: 'Leaderboard',
      ja: 'リーダーボード'
    },
    summary: {
      fa: 'خواندن جدول عمومی بدون توکن — همان لیستی که در سایت هم نمایش داده می‌شود.',
      en: 'Reads the public board with no token — the same list the website renders.',
      ja: 'トークン不要で公開ボードを読みます。サイトが表示するものと同じリストです。'
    },
    notes: {
      fa: [
        'همیشه کوچک‌ترین تعدادی را بخواه که صفحه را پر می‌کند؛ ۱۰۰ ردیف برای نمایش ۱۰ تا فقط ترافیک است.',
        'اگر پاسخ با «<» شروع شد یعنی HTML آمده، نه JSON — همان‌جا برگرد به‌جای اینکه parse خطا بدهد.'
      ],
      en: [
        'Ask for the smallest board that fills the screen; 100 rows to draw ten is bytes for nothing.',
        'A body starting with "<" is HTML, not JSON — return early instead of letting the parse throw.'
      ],
      ja: [
        '画面に必要な最小件数だけ要求してください。10 件表示に 100 件は無駄です。',
        '本文が "<" で始まる場合は HTML です。パース例外の前に早期リターンします。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderStore.cs
// ==========================================
function storeModule(spec) {
  const name = spec.pascal
  const products = spec.products

  const code = `// ==========================================
// AmirColliderStore.cs
// What the player owns, and how they get more.
//
// There are two ways to buy in this game and they end in the
// same place:
//
//   on the web    the site's storefront, opened with
//                 OpenWebStore() below. The Worker grants the
//                 entitlement the moment the payment confirms.
//
//   in the game   the platform store (Google Play), handled by
//                 whatever IAP plugin the project uses.
//
// Either way the answer to "what does this player own?" is the
// entitlements endpoint below. The game does not need to know
// which route a purchase came in by, and should not care.
// ==========================================

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace AmirCollider
{
    [Serializable]
    public class Entitlement
    {
        public string productId;
        public string kind;        // consumable | nonconsumable | pass
        public int quantity;       // unspent balance; 1 for anything owned outright
        public int lifetime;       // total ever granted
        public string source;      // web | in-app | grant
        public long expiresAt;     // 0 unless it is a pass
        public bool owned;
    }

    [Serializable]
    public class EntitlementsResponse
    {
        public bool ok;
        public string playerId;
        public Entitlement[] entitlements;
    }

    [Serializable]
    public class ConsumeRequest
    {
        public string productId;
        public int amount;
    }

    [Serializable]
    public class ConsumeResponse
    {
        public bool ok;
        public string error;
        public int remaining;
    }

    public static class AmirColliderStore
    {
        // The last answer from the server. Read it freely; it is
        // refreshed by Refresh() and never guessed at locally,
        // because a client that decides for itself what it owns
        // is a client that can be told to own everything.
        public static List<Entitlement> Owned = new List<Entitlement>();

        // ==========================================
        // Refresh
        // Asks what this player owns.
        // ==========================================
        public static IEnumerator Refresh(Action<bool> done)
        {
            string token = AmirColliderAuth.Instance.IdToken;

            yield return AmirColliderApi.Get(${name}Constants.Entitlements, token, result =>
            {
                if (!result.Ok)
                {
                    if (done != null) done(false);
                    return;
                }

                EntitlementsResponse parsed = JsonUtility.FromJson<EntitlementsResponse>(result.Body);
                Owned.Clear();
                if (parsed != null && parsed.entitlements != null) Owned.AddRange(parsed.entitlements);

                if (done != null) done(true);
            });
        }

        public static bool Has(string productId)
        {
            foreach (Entitlement item in Owned)
            {
                if (item.productId == productId) return item.owned || item.quantity > 0;
            }
            return false;
        }

        public static int Balance(string productId)
        {
            foreach (Entitlement item in Owned)
            {
                if (item.productId == productId) return item.quantity;
            }
            return 0;
        }

        // ==========================================
        // Consume
        // Spends part of one product's balance.
        // ==========================================
        public static IEnumerator Consume(string productId, int amount, Action<ConsumeResponse> done)
        {
            ConsumeRequest payload = new ConsumeRequest { productId = productId, amount = amount };
            string token = AmirColliderAuth.Instance.IdToken;

            yield return AmirColliderApi.Post(
                ${name}Constants.Consume,
                JsonUtility.ToJson(payload),
                token,
                result =>
                {
                    ConsumeResponse parsed = result.Ok
                        ? JsonUtility.FromJson<ConsumeResponse>(result.Body)
                        : new ConsumeResponse { ok = false, error = "network" };

                    if (parsed != null && parsed.ok)
                    {
                        foreach (Entitlement item in Owned)
                        {
                            if (item.productId == productId) { item.quantity = parsed.remaining; break; }
                        }
                    }

                    if (done != null) done(parsed);
                });
        }

        // ==========================================
        // Spend
        // Takes an amount of one currency out of whichever
        // products hold it.
        //
        // Smallest balance first, so the packs that are nearly
        // used up get emptied rather than left as scattered
        // remainders the player can see and cannot spend.
        // ==========================================
        public static IEnumerator Spend(string currencyCode, int amount, Action<bool> done)
        {
            List<Entitlement> holders = new List<Entitlement>();
            foreach (Entitlement item in Owned)
            {
                if (item.kind == "consumable" && item.quantity > 0 && CurrencyOf(item.productId) == currencyCode)
                {
                    holders.Add(item);
                }
            }

            holders.Sort((a, b) => a.quantity.CompareTo(b.quantity));

            int total = 0;
            foreach (Entitlement item in holders) total += item.quantity;
            if (total < amount)
            {
                if (done != null) done(false);
                yield break;
            }

            int remaining = amount;
            foreach (Entitlement item in holders)
            {
                if (remaining <= 0) break;

                int take = Mathf.Min(item.quantity, remaining);
                bool ok = false;

                yield return Consume(item.productId, take, response => { ok = response != null && response.ok; });

                if (!ok)
                {
                    if (done != null) done(false);
                    yield break;
                }
                remaining -= take;
            }

            if (done != null) done(remaining <= 0);
        }

        // Which currency a product pays into. Generated from the
        // catalogue so it cannot drift from what the server
        // grants.
        private static string CurrencyOf(string productId)
        {
            switch (productId)
            {
${products.map(product => {
  const grantCode = product.grant && product.grant.code ? product.grant.code : ''
  const kind = product.kind === 'consumable' && grantCode ? grantCode : ''
  return `                case "${product.id}": return "${kind}";`
}).join('\n') || '                default: return "";'}
            }
            return "";
        }

        // ==========================================
        // OpenWebStore
        // Sends the player to the site to buy.
        //
        // They sign in with the same Google account, so whatever
        // they buy is already theirs the next time Refresh()
        // runs. Call Refresh() on OnApplicationFocus for exactly
        // that reason.
        // ==========================================
        public static void OpenWebStore()
        {
            Application.OpenURL(${name}Constants.WebStore);
        }
    }
}
`

  return {
    id: 'store',
    file: 'AmirColliderStore.cs',
    icon: '🛒',
    title: {
      fa: 'خرید درون‌برنامه‌ای و مالکیت‌ها',
      en: 'In-app purchases & entitlements',
      ja: 'アプリ内購入と権利'
    },
    summary: {
      fa: 'چه چیزی را بازیکن دارد، و چطور بیشتر بگیرد. خرید داخل بازی و خرید داخل سایت هر دو به یک جا می‌رسند.',
      en: 'What the player owns and how they get more. A purchase in the game and a purchase on the site end in the same place.',
      ja: 'プレイヤーが所有するものと入手方法。ゲーム内購入もサイト内購入も同じ場所に着きます。'
    },
    notes: {
      fa: [
        'موجودی به‌ازای هر محصول نگهداری می‌شود نه به‌ازای هر ارز؛ Spend() خرج کردن را بین ردیف‌ها انجام می‌دهد.',
        'هیچ‌وقت مالکیت را سمت کلاینت تصمیم نگیر — پاسخ سرور تنها منبع درست است.',
        'بعد از برگشتن از فروشگاه وب حتماً Refresh() را صدا بزن؛ خرید همان لحظه‌ی تأیید پرداخت ثبت می‌شود.',
        'برای خرید داخل بازی، sku ها را از ' + spec.pascal + 'Constants.Skus بردار — همان‌هایی که باید در Play Console ساخته شوند.'
      ],
      en: [
        'Balances are per product, not per currency. Spend() walks the rows so nothing else has to.',
        'Never decide ownership client-side. The server answer is the only one that counts.',
        'Call Refresh() after sending someone to the web store — the grant lands the moment the payment confirms.',
        'For in-app purchases take the skus from ' + spec.pascal + 'Constants.Skus — the same strings to create in the Play Console.'
      ],
      ja: [
        '残高は通貨単位ではなく商品単位です。Spend() が行をまたいで消費します。',
        '所有判定をクライアントで行わないこと。サーバーの回答だけが正です。',
        'Web ストアから戻ったら必ず Refresh()。支払い確定と同時に付与されます。',
        'アプリ内購入では ' + spec.pascal + 'Constants.Skus の値を使用します。Play Console で作成する ID と同じです。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderStatus.cs
// ==========================================
function statusModule(spec) {
  const name = spec.pascal
  const line = spec.capabilities && spec.capabilities.onlinePlay
    ? 'This game needs the\n// network to play, so a failure here is worth a retry and a\n// message - but not a locked door on a plane.'
    : 'This game plays\n// offline; the network is only wanted for signing in and\n// buying. A manifest that does not load must never be a\n// player who cannot play.'

  const code = `// ==========================================
// AmirColliderStatus.cs
// Asking the Worker what state this game is in.
//
// A shipped build cannot know that its download was withdrawn,
// that a product was taken off sale, or that it is older than
// the Worker now expects. It finds out here, or not at all.
//
// Called once at boot, before the menu. It is one small GET
// with no authentication, and everything it returns is already
// public on the game's own web page.
//
// The game starts anyway.
//
// That is the important line in this file. ${line}
// ==========================================

using System;
using System.Collections;
using UnityEngine;

namespace AmirCollider
{
    [Serializable]
    public class GameCapabilities
    {
        public bool onlinePlay;
        public bool login;
        public bool cloudSave;
        public bool leaderboard;
        public bool store;
    }

    [Serializable]
    public class GameDownload
    {
        public bool enabled;
        public string url;
    }

    [Serializable]
    public class GameManifest
    {
        public string id;
        public string name;
        public string status;      // live | maintenance | soon
        public string minVersion;
        public GameCapabilities capabilities;
        public GameDownload download;
    }

    public static class AmirColliderStatus
    {
        public static GameManifest Current;

        // True until the manifest says otherwise, so a failed
        // fetch leaves the game fully playable rather than
        // half-disabled.
        public static bool StoreOpen = true;
        public static bool UpdateRequired = false;

        public static IEnumerator Fetch(Action<GameManifest> done)
        {
            yield return AmirColliderApi.Get(${name}Constants.Manifest, null, result =>
            {
                if (!result.Ok)
                {
                    if (done != null) done(null);
                    return;
                }

                Current = JsonUtility.FromJson<GameManifest>(result.Body);
                if (Current != null)
                {
                    StoreOpen = Current.capabilities != null && Current.capabilities.store;
                    UpdateRequired = IsOlder(Application.version, Current.minVersion);
                }

                if (done != null) done(Current);
            });
        }

        // Where to send a player who is told to update. The
        // versions page lists every release and links the
        // download, so it works whether the game ships on one
        // store or four.
        public static void OpenUpdatePage()
        {
            Application.OpenURL(${name}Constants.WebVersions);
        }

        // "1.2.10" is newer than "1.2.9", which a string compare
        // gets backwards. Compared part by part as numbers, with a
        // missing or unparsable value meaning "no requirement" -
        // a version check that fails closed would brick every
        // install the first time somebody typed the field wrong.
        private static bool IsOlder(string version, string minimum)
        {
            if (string.IsNullOrEmpty(minimum) || string.IsNullOrEmpty(version)) return false;

            string[] left = version.Split('.');
            string[] right = minimum.Split('.');
            int length = Mathf.Max(left.Length, right.Length);

            for (int i = 0; i < length; i++)
            {
                int a = i < left.Length && int.TryParse(left[i], out int parsedA) ? parsedA : 0;
                int b = i < right.Length && int.TryParse(right[i], out int parsedB) ? parsedB : 0;
                if (a != b) return a < b;
            }
            return false;
        }
    }
}
`

  return {
    id: 'status',
    file: 'AmirColliderStatus.cs',
    icon: '📡',
    title: {
      fa: 'وضعیت بازی و حالت آفلاین',
      en: 'Game status & the offline switch',
      ja: 'ゲーム状態とオフライン切替'
    },
    summary: {
      fa: 'بیلد منتشرشده از این‌جا می‌فهمد که لینک دانلودش برداشته شده، محصولی از فروش خارج شده، یا نسخه‌اش قدیمی است.',
      en: 'How a shipped build learns that its download was withdrawn, a product left the shelf, or its version is behind.',
      ja: '配布済みビルドが、ダウンロード停止・商品の販売終了・バージョン不足を知る唯一の方法です。'
    },
    notes: {
      fa: [
        'اگر این درخواست شکست خورد بازی باید بالا بیاید — «manifest نیامد» هرگز نباید یعنی «بازی اجرا نمی‌شود».',
        'مقایسه‌ی نسخه عددی است نه رشته‌ای؛ «1.2.10» از «1.2.9» جدیدتر است.',
        'حالت maintenance یعنی فقط لینک دانلود برداشته شده — ورود، خرید و جدول امتیازات همچنان کار می‌کنند.',
        'مقدار minVersion را از تب «بازی‌ها»ی همین پنل عوض می‌کنی؛ نیازی به بیلد جدید نیست.'
      ],
      en: [
        'If the fetch fails the game still starts. "The manifest did not load" must never mean "you cannot play".',
        'Versions are compared numerically, not as strings — "1.2.10" is newer than "1.2.9".',
        'Maintenance withdraws the download only. Sign-in, purchases and the leaderboard keep working.',
        'minVersion is changed in this panel\'s Games tab. No new build is involved.'
      ],
      ja: [
        '取得に失敗してもゲームは起動します。「マニフェスト未取得」が「プレイ不可」になってはいけません。',
        'バージョンは文字列でなく数値で比較します（1.2.10 > 1.2.9）。',
        'maintenance はダウンロードのみ停止。ログイン・購入・ランキングは動作します。',
        'minVersion はこのパネルの「ゲーム」タブで変更します。再ビルドは不要です。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderBootstrap.cs
//
// Six static classes and no example is a puzzle, not a kit. This
// is the order the calls go in, on one component, with the
// mistakes already made.
// ==========================================
function bootstrapModule(spec) {
  const name = spec.pascal
  const cloud = spec.capabilities.cloudSave
  const board = spec.capabilities.leaderboard
  const store = spec.capabilities.store

  const afterSignIn = [
    cloud ? '            StartCoroutine(LoadProfile());' : '',
    store ? '            StartCoroutine(AmirColliderStore.Refresh(ok => Debug.Log("[AmirCollider] Entitlements: " + ok)));' : ''
  ].filter(Boolean).join('\n') || '            Debug.Log("[AmirCollider] Signed in.");'

  const profileBlock = cloud
    ? `
        // ==========================================
        // LoadProfile
        // A 404 is a player with no row yet, not an error. The
        // first write creates it.
        // ==========================================
        private IEnumerator LoadProfile()
        {
            yield return AmirColliderPlayer.Load(profile =>
            {
                if (profile == null)
                {
                    Debug.Log("[AmirCollider] No profile row yet - the first save creates it.");
                    return;
                }

                Profile = profile;
                Debug.Log("[AmirCollider] High score: " + profile.highScore);
            });
        }

        // ==========================================
        // EndRun
        // Call this when a run finishes.
        //
        // The score goes up on its own endpoint and the rest of
        // the profile is a separate merge, because the server
        // keeps the HIGHER of two scores and would have to guess
        // at everything else.
        // ==========================================
        public void EndRun(int score, int secondsPlayed)
        {
            StartCoroutine(SubmitRun(score, secondsPlayed));
        }

        private IEnumerator SubmitRun(int score, int secondsPlayed)
        {
            if (!AmirColliderAuth.Instance.IsSignedIn) yield break;

            yield return AmirColliderPlayer.SubmitScore(score, result =>
            {
                // success:false is "not a new record", not a
                // failure. Retrying it forever is the bug this
                // comment exists to prevent.
                if (result != null && result.success)
                {
                    Debug.Log("[AmirCollider] New record: " + result.newHighScore);
                }
            });

            ProfilePatch patch = new ProfilePatch { totalPlayTime = secondsPlayed };
            yield return AmirColliderPlayer.Save(patch, null);
        }
`
    : ''

  const boardBlock = board
    ? `
        // ==========================================
        // ShowLeaderboard
        // No token needed: the board is public.
        // ==========================================
        public void ShowLeaderboard()
        {
            StartCoroutine(AmirColliderLeaderboard.Top(10, rows =>
            {
                foreach (LeaderboardRow row in rows)
                {
                    Debug.Log(row.rank + ". " + row.username + " - " + row.highScore);
                }
            }));
        }
`
    : ''

  const storeBlock = store
    ? `
        // ==========================================
        // OnApplicationFocus
        // The player may have bought something on the site while
        // this build sat in the background. Coming back is the
        // only moment it can find out.
        // ==========================================
        private void OnApplicationFocus(bool focused)
        {
            if (!focused || !AmirColliderAuth.Instance.IsSignedIn) return;
            StartCoroutine(AmirColliderStore.Refresh(null));
        }
`
    : ''

  const code = `// ==========================================
// AmirColliderBootstrap.cs
// The order everything happens in, on one component.
//
// Put this and AmirColliderAuth on ONE GameObject in the first
// scene. Nothing else in the kit is a MonoBehaviour.
//
// What this file is really for: the six classes beside it are
// each obvious on their own, and the order they go in is not.
// This is that order.
// ==========================================

using System.Collections;
using UnityEngine;

namespace AmirCollider
{
    [RequireComponent(typeof(AmirColliderAuth))]
    public class AmirColliderBootstrap : MonoBehaviour
    {
        public static AmirColliderBootstrap Instance { get; private set; }
${cloud ? '\n        public PlayerProfile Profile { get; private set; }\n' : ''}
        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private IEnumerator Start()
        {
            // 1. Ask the Worker what state this game is in.
            //    It is allowed to fail. The game starts anyway.
            yield return AmirColliderStatus.Fetch(manifest =>
            {
                if (manifest == null)
                {
                    Debug.Log("[AmirCollider] Manifest unavailable - carrying on offline.");
                    return;
                }
                if (AmirColliderStatus.UpdateRequired)
                {
                    Debug.LogWarning("[AmirCollider] This build is older than minVersion.");
                }
            });

            // 2. A returning player has a refresh token. Use it
            //    rather than opening a browser in their face on
            //    every single launch.
            if (AmirColliderAuth.Instance.CanResume())
            {
                yield return AmirColliderAuth.Instance.Refresh(ok =>
                {
                    if (ok) OnSignedIn();
                });
            }

            // 3. Anything else is a button the player presses.
            AmirColliderAuth.Instance.OnSignInFinished += signedIn =>
            {
                if (signedIn) OnSignedIn();
                else Debug.LogWarning("[AmirCollider] Sign-in did not complete.");
            };
        }

        // The button. Opens the browser; the answer arrives on
        // OnSignInFinished, which is wired up above.
        public void SignInPressed()
        {
            AmirColliderAuth.Instance.SignIn();
        }

        private void OnSignedIn()
        {
${afterSignIn}
        }
${profileBlock}${boardBlock}${storeBlock}
        // ==========================================
        // OnApplicationPause
        // An id_token lasts about an hour. A game resumed after
        // lunch is holding an expired one and does not know.
        // ==========================================
        private void OnApplicationPause(bool paused)
        {
            if (paused || !AmirColliderAuth.Instance.CanResume()) return;
            StartCoroutine(AmirColliderAuth.Instance.Refresh(null));
        }
    }
}
`

  return {
    id: 'bootstrap',
    file: 'AmirColliderBootstrap.cs',
    icon: '🚀',
    title: {
      fa: 'نمونه‌ی کامل — ترتیب صدا زدن‌ها',
      en: 'The worked example — what calls what, and when',
      ja: '実装例 — 呼び出しの順序'
    },
    summary: {
      fa: 'یک کامپوننت که همه‌چیز را به هم وصل می‌کند: بررسی وضعیت، ورود خودکار بازیکن قدیمی، خواندن پروفایل، ثبت امتیاز و تازه کردن خریدها.',
      en: 'One component that wires the rest together: check status, resume a returning player, read the profile, submit a score, refresh entitlements.',
      ja: 'すべてをつなぐ 1 コンポーネント：状態確認、再訪プレイヤーの復帰、プロフィール取得、スコア送信、権利の再取得。'
    },
    notes: {
      fa: [
        'این و AmirColliderAuth باید روی یک GameObject در اولین صحنه باشند؛ بقیه‌ی فایل‌ها MonoBehaviour نیستند.',
        'ترتیب مهم است: اول Status، بعد تلاش برای ادامه‌ی نشست قبلی، و ورود دستی فقط وقتی بازیکن دکمه را زد.',
        'روی OnApplicationPause توکن تازه می‌شود و روی OnApplicationFocus خریدها — این دو جا همان جاهایی‌اند که وضعیت کهنه می‌شود.'
      ],
      en: [
        'This and AmirColliderAuth go on one GameObject in the first scene; nothing else in the kit is a MonoBehaviour.',
        'The order matters: status first, then resume, and an interactive sign-in only when the player presses the button.',
        'The token is refreshed on pause and entitlements on focus — the two moments state goes stale.'
      ],
      ja: [
        'これと AmirColliderAuth を最初のシーンの 1 つの GameObject に置きます。他は MonoBehaviour ではありません。',
        '順序が重要です：まず状態、次に復帰、対話的サインインはボタン押下時のみ。',
        '一時停止でトークン、フォーカス復帰で権利を更新します。状態が古くなるのはこの 2 か所です。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AndroidManifest.xml
//
// The file the kit never had, and the reason sign-in "works in
// the editor and does nothing on the phone": Android delivers a
// deep link only to an app whose manifest claims that scheme.
// ==========================================
export function androidManifestSource(spec) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  ==========================================
  AndroidManifest.xml
  Generated by the AmirCollider TheGod panel for "${spec.name}".

  Save as: Assets/Plugins/Android/AndroidManifest.xml
  (create the folders if they do not exist)

  In Unity: Project Settings ▸ Player ▸ Android ▸ Publishing
  Settings ▸ tick "Custom Main Manifest". Unity writes a starter
  file at that exact path; replace its <activity> block with the
  one below, or replace the whole file if you have not edited it.

  WHY THIS FILE MATTERS
  Sign-in opens the system browser. Google sends the player back
  to ${spec.scheme}://${spec.host}?code=... and ANDROID decides which
  app receives that URL. It decides by looking for an app whose
  manifest declares this scheme. Without the intent-filter below,
  the browser opens a blank tab, the app never wakes up, and
  nothing anywhere logs an error - which is the worst possible
  failure and the one this file prevents.

  THE THREE THINGS THAT MUST AGREE
    1. android:scheme below                     -> ${spec.scheme}
    2. ${spec.pascal}Constants.DeepLinkScheme
    3. the scheme the Worker resolves for this game
       (TheGod ▸ Games tab, or its Environment tab, which says
        which of the three layers the value came from)

  If they disagree the player signs in, sees "success" in the
  browser and returns to a game that never heard about it.
  ==========================================
-->
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Every call this kit makes is HTTPS to the Worker. -->
    <uses-permission android:name="android.permission.INTERNET" />

    <!-- Optional: lets the game tell "offline" from "the server
         is down" before it spends 15 seconds finding out. -->
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="false"
        android:usesCleartextTraffic="false">

        <!--
          Two things on the <activity> below are load-bearing:

          android:name
              Unity 2021/2022/2023  com.unity3d.player.UnityPlayerActivity
              Unity 6 (GameActivity) com.unity3d.player.UnityPlayerGameActivity
              Use whichever Player Settings ▸ Application Entry Point
              selects. The wrong one builds an APK that opens to a
              black screen.

          android:launchMode="singleTask"
              Not decoration. Without it Android starts a SECOND
              copy of the game to deliver the deep link, and the
              copy holding the sign-in code is not the copy the
              player was looking at.
        -->
        <activity
            android:name="com.unity3d.player.UnityPlayerActivity"
            android:theme="@style/UnityThemeSelector"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="fullSensor"
            android:configChanges="mcc|mnc|locale|touchscreen|keyboard|keyboardHidden|navigation|orientation|screenLayout|uiMode|screenSize|smallestScreenSize|fontScale|layoutDirection|density"
            android:hardwareAccelerated="false"
            android:resizeableActivity="false">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!--
              THE SIGN-IN RETURN PATH: ${spec.scheme}://${spec.host}
              Application.deepLinkActivated in AmirColliderAuth.cs
              receives whatever matches this filter.
            -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="${spec.scheme}"
                    android:host="${spec.host}" />
            </intent-filter>

            <meta-data android:name="unityplayer.UnityActivity" android:value="true" />
        </activity>
    </application>
</manifest>
`
}


function manifestModule(spec) {
  return {
    id: 'manifest',
    file: 'AndroidManifest.xml',
    icon: '🤖',
    title: {
      fa: 'AndroidManifest.xml — بدون این، ورود روی گوشی کار نمی‌کند',
      en: 'AndroidManifest.xml — without it, sign-in does nothing on a phone',
      ja: 'AndroidManifest.xml — これが無いと端末でサインインできません'
    },
    summary: {
      fa: `اسکیم «${spec.scheme}» را برای این بازی ثبت می‌کند تا اندروید کد بازگشتی گوگل را به همین اپ بدهد. مسیر فایل: Assets/Plugins/Android/AndroidManifest.xml`,
      en: `Registers the "${spec.scheme}" scheme so Android hands Google's returning code to this app. Save it at Assets/Plugins/Android/AndroidManifest.xml`,
      ja: `「${spec.scheme}」スキームを登録し、Google からの復帰 URL をこのアプリに届けます。保存先：Assets/Plugins/Android/AndroidManifest.xml`
    },
    notes: {
      fa: [
        'در Unity: Project Settings ▸ Player ▸ Android ▸ Publishing Settings ▸ گزینه‌ی Custom Main Manifest را تیک بزن.',
        'launchMode="singleTask" تزئینی نیست: بدون آن اندروید نسخه‌ی دومی از بازی باز می‌کند و کد به نسخه‌ای می‌رسد که بازیکن نمی‌بیندش.',
        'اسم Activity در یونیتی ۶ فرق دارد (UnityPlayerGameActivity) — اگر صفحه سیاه ماند، اول این را چک کن.',
        'اسکیم اینجا، مقدار داخل Constants و مقداری که پنل نشان می‌دهد باید دقیقاً یکی باشند.'
      ],
      en: [
        'In Unity: Project Settings ▸ Player ▸ Android ▸ Publishing Settings ▸ tick "Custom Main Manifest".',
        'launchMode="singleTask" is not decoration: without it Android starts a second copy of the game and the code lands in the copy the player cannot see.',
        'Unity 6 with GameActivity uses a different activity name (UnityPlayerGameActivity). A black screen on launch is this line.',
        'The scheme here, the one in Constants and the one the panel shows must be the same string.'
      ],
      ja: [
        'Unity：Project Settings ▸ Player ▸ Android ▸ Publishing Settings で "Custom Main Manifest" をオン。',
        'launchMode="singleTask" は必須です。無いと 2 つ目のインスタンスが起動し、コードが見えない方に届きます。',
        'Unity 6 (GameActivity) はアクティビティ名が異なります（UnityPlayerGameActivity）。黒画面はここです。',
        'ここのスキーム、Constants の値、パネルが示す値は完全に一致させてください。'
      ]
    },
    code: androidManifestSource(spec)
  }
}


// ==========================================
// Module: link.xml
//
// IL2CPP strips types nothing appears to construct. Every
// [Serializable] class in this kit is constructed by
// JsonUtility through reflection, which the stripper cannot
// see. The symptom is specific and awful: works in the editor,
// works in a development build, returns null for every parsed
// response in the release APK.
// ==========================================
function linkModule(spec) {
  const code = `<?xml version="1.0" encoding="utf-8"?>
<!--
  ==========================================
  link.xml
  Save as: Assets/link.xml

  WHAT THIS PREVENTS
  Release builds use IL2CPP with managed code stripping. The
  stripper removes types that nothing appears to construct - and
  nothing appears to construct PlayerProfile, Entitlement,
  GameManifest or TokenResponse, because JsonUtility builds them
  through reflection at runtime.

  The symptom is the worst kind: it works in the editor, it
  works in a development build, and in the release APK every
  parsed response is null. No exception, no log line, just a
  game where sign-in "succeeds" and the player has no name.

  This file tells the stripper to keep them.
  ==========================================
-->
<linker>
    <!-- Everything in this kit lives in one namespace. -->
    <assembly fullname="Assembly-CSharp">
        <namespace fullname="AmirCollider" preserve="all" />
    </assembly>

    <!-- UnityWebRequest itself, for the same reason. -->
    <assembly fullname="UnityEngine.UnityWebRequestModule" preserve="all" />
    <assembly fullname="UnityEngine.JSONSerializeModule" preserve="all" />
</linker>
`

  return {
    id: 'link',
    file: 'link.xml',
    icon: '🧱',
    title: {
      fa: 'link.xml — جلوگیری از حذف کلاس‌ها در بیلد نهایی',
      en: 'link.xml — stops IL2CPP deleting the response classes',
      ja: 'link.xml — IL2CPP による型の削除を防ぐ'
    },
    summary: {
      fa: 'در بیلد Release با IL2CPP، کلاس‌هایی که فقط JsonUtility می‌سازدشان حذف می‌شوند و همه‌ی پاسخ‌ها null می‌شوند — بدون هیچ خطایی. این فایل جلویش را می‌گیرد.',
      en: 'In a release IL2CPP build the classes only JsonUtility ever constructs get stripped, and every parsed response becomes null with no error at all. This file stops that.',
      ja: 'Release の IL2CPP ビルドでは JsonUtility だけが生成する型が削除され、応答がすべて null になります（エラーなし）。このファイルで防ぎます。'
    },
    notes: {
      fa: [
        'در ادیتور و در Development Build همه‌چیز درست کار می‌کند — این باگ فقط در بیلد نهایی دیده می‌شود. پس همین الآن اضافه‌اش کن.',
        'اگر اسکریپت‌ها را داخل یک Assembly Definition جدا گذاشته‌ای، به‌جای Assembly-CSharp اسم همان اسمبلی را بنویس.'
      ],
      en: [
        'The editor and development builds are fine — this only shows up in the release APK. Add it now rather than after the first store upload.',
        'If the scripts live in their own Assembly Definition, put that assembly name in place of Assembly-CSharp.'
      ],
      ja: [
        'エディタと開発ビルドでは問題なく、リリース APK でのみ発生します。ストア提出前に追加してください。',
        'スクリプトを独自の Assembly Definition に置いている場合は Assembly-CSharp をその名前に置き換えます。'
      ]
    },
    code
  }
}


// ==========================================
// Module: GOOGLE-SETUP.md
//
// Everything that is not in Unity and not in the Worker, which
// is where every sign-in failure that is nobody's code actually
// comes from.
// ==========================================
function googleModule(spec, envKeys) {
  const products = spec.products
  const skuLines = products.length
    ? products.map(product => {
        const kind = product.kind === 'consumable' ? 'consumable'
          : product.kind === 'pass' ? 'subscription (or consumable, if the pass is time-boxed by the Worker)'
          : 'non-consumable'
        return `      ${product.sku || String(product.id).replace(/-/g, '_')}
          type   ${kind}
          price  $${product.priceUsd || '—'}
          grants ${product.grant ? JSON.stringify(product.grant) : '—'}`
      }).join('\n\n')
    : '      This game has no products in its catalogue yet.'

  const androidClient = spec.platforms.android
    ? `
    2b. Android client   (type: Android)
        Package name          ${spec.package}
        SHA-1 certificate     see "Getting the SHA-1" below

        Stored in the Worker as:
            ${envKeys.android}

        This one identifies the APK to Google. It is not a
        credential and it is inside every build you ship.
`
    : `
    2b. No Android client is needed: this game runs in a browser
        and has no APK to identify.
`

  const sha = spec.platforms.android
    ? `
    ------------------------------------------------------------
    GETTING THE SHA-1
    ------------------------------------------------------------
    Google needs the fingerprint of the key that SIGNS the APK,
    and there are usually two of them.

    Your own upload/debug keystore:

        keytool -list -v -keystore my-release-key.keystore -alias my-alias

    Unity's debug keystore (for a build made without a custom
    keystore):

        keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

    And - the one everybody misses - if Google Play App Signing
    is on, PLAY re-signs your upload with a different key. Its
    SHA-1 is in:

        Play Console ▸ your app ▸ Setup ▸ App integrity ▸
        App signing key certificate

    Add every fingerprint that will ever sign a build people
    install. A build signed by a key Google has not been told
    about fails sign-in on the device and works perfectly in
    the editor, which is a very long afternoon.
`
    : ''

  const deepLink = spec.platforms.android
    ? `
    ------------------------------------------------------------
    5. THE DEEP-LINK SCHEME
    ------------------------------------------------------------
    Not a Google setting and not a secret - it is a string in
    three places that must agree:

        AndroidManifest.xml   android:scheme="${spec.scheme}"
        Constants.cs          DeepLinkScheme = "${spec.scheme}"
        The Worker            TheGod ▸ Games ▸ this game

    The Worker resolves it in this order, first one wins:

        1. the panel (game_settings.deeplink_scheme)
        2. ${envKeys.deepLinkScheme}  (if it is still set)
        3. the fallback in Config.js  (always present)

    TheGod ▸ Environment says which of the three the live value
    came from, which is the question worth asking when a build
    signs in and never comes back.
`
    : ''

  const code = `# Google setup for ${spec.name}

Everything below happens OUTSIDE Unity and outside the Worker.
It is also where most "sign-in does not work" reports actually
come from, because none of it produces an error message in a
place a developer is looking.

Work top to bottom. It is about twenty minutes once.


    ------------------------------------------------------------
    1. THE PROJECT
    ------------------------------------------------------------
    console.cloud.google.com ▸ create (or pick) a project.

    APIs & Services ▸ OAuth consent screen:

        User type     External
        App name      ${spec.name}
        Support email your address
        Scopes        email, profile, openid  (nothing more -
                      every extra scope is another consent
                      screen line and another review question)

    While the app is in "Testing" only accounts on the test-user
    list can sign in, and tokens expire in seven days. Publish it
    before you tell anybody the game is out.


    ------------------------------------------------------------
    2. THE OAUTH CLIENTS
    ------------------------------------------------------------
    APIs & Services ▸ Credentials ▸ Create credentials ▸
    OAuth client ID.

    2a. Web client   (type: Web application)
        Authorized redirect URIs:

            ${spec.base}/oauth/callback

        Add ONE LINE PER HOSTNAME this Worker answers on - the
        custom domain AND the *.workers.dev address. Google
        compares the redirect against this list and refuses
        anything not on it, which is Error 400:
        redirect_uri_mismatch. No Worker setting can fix that;
        the check happens on Google's side.

        Stored in the Worker as:
            ${envKeys.web}      the client id
            ${envKeys.secret}   the client secret

        The secret is a real credential. It lives in the Worker
        and never in a build - that is the entire reason the
        token exchange goes through /oauth/token instead of the
        game talking to Google directly.
${androidClient}
    Set them with:

        npx wrangler secret put ${envKeys.web}
        npx wrangler secret put ${envKeys.secret}${spec.platforms.android ? `
        npx wrangler secret put ${envKeys.android}` : ''}

    Or in the Cloudflare dashboard: Workers ▸ this Worker ▸
    Settings ▸ Variables and secrets.

    TheGod ▸ Environment lists all of them and says which are
    set, without ever showing a secret's value.
${sha}
    ------------------------------------------------------------
    3. AFTER YOU SAVE
    ------------------------------------------------------------
    Google takes anywhere from a few seconds to a few minutes to
    apply a credentials change. A redirect_uri_mismatch that
    persists for exactly five minutes and then stops was never a
    bug.


    ------------------------------------------------------------
    4. TESTING IT
    ------------------------------------------------------------
    Open in a browser:

        ${spec.base}/oauth/auth?redirect_uri=http%3A%2F%2Flocalhost&game=${spec.id}

    A correct setup ends on a page showing an authorization
    code. Paste that into AmirColliderAuth.SubmitCode() in the
    editor and the same flow the phone uses runs on the desktop.
${deepLink}
    ------------------------------------------------------------
    ${spec.platforms.android ? '6' : '5'}. GOOGLE PLAY IN-APP PRODUCTS
    ------------------------------------------------------------
    Only if this game sells through Play as well as through the
    site. Create these ids in Play Console ▸ Monetise ▸ In-app
    products, exactly as written - they are the strings in
    ${spec.pascal}Constants.Skus:

${skuLines}

    The Worker knows these products by their OTHER id (the one
    in ${spec.pascal}Constants.Products_). The two are allowed to
    differ and usually do: Play requires lowercase and
    underscores, and the Worker's ids were chosen to read well
    in a URL. Mapping one to the other is what those two nested
    classes are for.

    Prices in Play are set per country in the Play Console. The
    price in this panel is what the SITE charges; the two are
    separate shops and neither reads the other.
`

  return {
    id: 'google',
    file: 'GOOGLE-SETUP.md',
    icon: '🔒',
    title: {
      fa: 'تنظیمات گوگل — کلاینت‌ها، SHA-1، redirect URI و محصول‌های پلی',
      en: 'Google setup — clients, SHA-1, redirect URI, Play products',
      ja: 'Google 設定 — クライアント・SHA-1・リダイレクト URI・Play 商品'
    },
    summary: {
      fa: 'هرچیزی که بیرون یونیتی و بیرون Worker است و بیشتر خطاهای «ورود کار نمی‌کند» از همین‌جا می‌آید. آدرس‌ها و نام متغیرها برای همین بازی نوشته شده‌اند.',
      en: 'Everything outside Unity and outside the Worker — which is where most "sign-in does not work" reports actually come from. Every URL and variable name below is this game\'s own.',
      ja: 'Unity と Worker の外側の設定。「サインインできない」の多くはここが原因です。URL と変数名はこのゲーム用です。'
    },
    notes: {
      fa: [
        'خطای «Error 400: redirect_uri_mismatch» همیشه یعنی این آدرس در فهرست گوگل نیست — هیچ تنظیمی در Worker آن را درست نمی‌کند.',
        spec.platforms.android
          ? 'اگر Play App Signing روشن است، اثر انگشت SHA-1 خود گوگل را هم اضافه کن، نه فقط کلید آپلود خودت.'
          : 'برای بازی تحت وب نیازی به کلاینت اندروید و SHA-1 نیست.',
        'تا وقتی صفحه‌ی رضایت (consent screen) در حالت Testing است، فقط حساب‌های تست می‌توانند وارد شوند و توکن‌ها ۷ روزه منقضی می‌شوند.'
      ],
      en: [
        '"Error 400: redirect_uri_mismatch" always means this address is not on Google\'s list. No Worker setting can fix it.',
        spec.platforms.android
          ? 'With Play App Signing on, add Google\'s own SHA-1 as well as your upload key\'s — Play re-signs the build people install.'
          : 'A browser game needs no Android client and no SHA-1.',
        'While the consent screen is in Testing, only test accounts can sign in and their tokens expire after seven days.'
      ],
      ja: [
        '「Error 400: redirect_uri_mismatch」は常に「この URL が Google の一覧に無い」の意味です。Worker 側では直せません。',
        spec.platforms.android
          ? 'Play App Signing が有効な場合、アップロード鍵に加えて Google 側の SHA-1 も登録してください。'
          : 'ブラウザーゲームでは Android クライアントも SHA-1 も不要です。',
        '同意画面が Testing の間はテストユーザーのみログイン可能で、トークンは 7 日で失効します。'
      ]
    },
    code
  }
}


// ==========================================
// Module: README.md
// The order to do things in, which is the one thing a pile of
// files cannot say for itself.
// ==========================================
function readmeModule(spec, modules) {
  const list = modules
    .filter(module => module.id !== 'readme')
    .map(module => `      ${module.file.padEnd(30)} ${module.id === 'constants' ? '(add this first)' : ''}`)
    .join('\n')

  const caps = [
    ['login', 'Google sign-in'],
    ['cloudSave', 'Cloud save & profile'],
    ['leaderboard', 'Leaderboard'],
    ['store', 'In-app purchases'],
    ['onlinePlay', 'Online play']
  ].map(([key, label]) =>
    `      ${(spec.capabilities[key] ? '[x]' : '[ ]')} ${label}`).join('\n')

  const androidSteps = spec.platforms.android
    ? `
    5. Android only
       Assets/Plugins/Android/AndroidManifest.xml   the deep link
       Assets/link.xml                              IL2CPP stripping

       Project Settings ▸ Player ▸ Android:
         Package Name                ${spec.package}
         Minimum API Level           24 or higher
         Scripting Backend           IL2CPP
         Target Architectures        ARM64 (ARMv7 optional)
         Custom Main Manifest        ticked
`
    : `
    5. Browser build
       No manifest and no deep link: the OAuth code is shown on a
       page and handed to SubmitCode(). Nothing in this kit needs
       an Android setting.
`

  return {
    id: 'readme',
    file: 'README.md',
    icon: '📖',
    title: {
      fa: 'از کجا شروع کنم — ترتیب کارها',
      en: 'Start here — the order to do things in',
      ja: 'はじめに — 作業の順序'
    },
    summary: {
      fa: 'فهرست فایل‌ها، ترتیب اضافه کردنشان، تنظیمات لازم پروژه، و چک‌لیستی که با آن می‌فهمی چیزی جا نمانده.',
      en: 'The file list, the order to add them in, the project settings that matter, and a checklist for telling whether anything is missing.',
      ja: 'ファイル一覧、追加順序、必要なプロジェクト設定、そして不足がないか確認するチェックリスト。'
    },
    notes: {
      fa: [
        'اگر فقط یک فایل را اشتباه جا بیندازی، معمولاً ' + spec.pascal + 'Constants.cs است و نتیجه‌اش خطای کامپایل در همه‌ی فایل‌های دیگر است.',
        'همه‌ی فایل‌ها با دکمه‌ی «دانلود فایل» با اسم درست ذخیره می‌شوند.'
      ],
      en: [
        'The one file people miss is ' + spec.pascal + 'Constants.cs, and missing it is a compile error in every other file at once.',
        'Every block on this page has a download button that saves the file under its correct name.'
      ],
      ja: [
        '見落としやすいのは ' + spec.pascal + 'Constants.cs です。無いと他のすべてがコンパイルエラーになります。',
        '各ブロックのダウンロードボタンで正しいファイル名のまま保存できます。'
      ]
    },
    code: `# ${spec.name} — AmirCollider Unity kit

Generated by the TheGod panel for game id "${spec.id}".
Worker: ${spec.base}

This kit is what the game needs to talk to this Worker. Nothing
in it is a package to import - they are plain files, and they
are meant to be read.


    ------------------------------------------------------------
    WHAT THIS GAME USES
    ------------------------------------------------------------
${caps}

    Only the files for ticked capabilities are generated. Turn one
    on in Config.js and re-open this tab to get the rest.


    ------------------------------------------------------------
    THE ORDER
    ------------------------------------------------------------
    1. Create the folder
       Assets/Scripts/AmirCollider/

    2. Add ${spec.pascal}Constants.cs FIRST
       Every other file references it by name. Added last, the
       project shows twenty compile errors that all say the same
       thing.

    3. Add the rest of the .cs files to the same folder:

${list}

    4. Put AmirColliderAuth and AmirColliderBootstrap on ONE
       GameObject in the first scene. Nothing else in the kit is
       a MonoBehaviour, and both survive scene loads.
${androidSteps}
    6. Google
       Follow GOOGLE-SETUP.md. Sign-in cannot work before that is
       done, and its failures do not produce useful errors.


    ------------------------------------------------------------
    CHECKING IT WORKS
    ------------------------------------------------------------
    In the editor, in this order:

    1. Play. The console logs the manifest fetch. If it fails,
       the game still runs - that is deliberate.

    2. Call AmirColliderAuth.Instance.SignIn(). A browser opens
       and ends on a page showing a code.

    3. Paste the code into AmirColliderAuth.Instance.SubmitCode().
       The console logs a signed-in player.

    4. Open ${spec.base}/${spec.id}/leaderboard
       and confirm the same player is there.

    On a phone, step 2 and 3 are one step: the browser returns to
    the game by itself. If it does not, the manifest's scheme and
    the Constants' scheme disagree - that is the only cause.


    ------------------------------------------------------------
    WHEN SOMETHING IS WRONG
    ------------------------------------------------------------
    Sign-in opens the browser and never comes back
        Android only. The scheme in AndroidManifest.xml does not
        match ${spec.pascal}Constants.DeepLinkScheme, or
        launchMode="singleTask" is missing.

    "Error 400: redirect_uri_mismatch"
        ${spec.base}/oauth/callback is not on the Google client's
        authorized list. See GOOGLE-SETUP.md.

    Everything parses to null in the release build only
        link.xml is missing. IL2CPP stripped the response classes.

    A score submits and nothing changes
        The server keeps the HIGHER score and answers 200 with
        success:false. That is not an error.

    The leaderboard comes back empty
        The response was HTML, not JSON. Check the game id in
        ${spec.pascal}Constants.GameId.
`
  }
}


// ==========================================
// unityModules
// The whole kit, in the order somebody should read it.
//
// Which files appear is decided by what the game actually is: a
// browser game gets no AndroidManifest, a game without a store
// gets no entitlements client, and neither gets a file it would
// have to read before deleting.
// ==========================================
export function unityModules(game, origin, options = {}) {
  const spec = readGame(game, origin)
  const envKeys = envKeysFor(spec, options.envKeys)
  const capabilities = spec.capabilities

  const modules = [constantsModule(spec), apiModule(spec)]

  if (capabilities.login !== false) modules.push(authModule(spec))
  if (capabilities.cloudSave) modules.push(playerModule(spec))
  if (capabilities.leaderboard) modules.push(leaderboardModule(spec))
  if (capabilities.store) modules.push(storeModule(spec))

  modules.push(statusModule(spec))
  modules.push(bootstrapModule(spec))

  if (spec.platforms.android) {
    modules.push(manifestModule(spec))
    modules.push(linkModule(spec))
  }
  if (capabilities.login !== false) modules.push(googleModule(spec, envKeys))

  // Built last because it lists the others, and put first
  // because it is the file to read first.
  return [readmeModule(spec, modules), ...modules]
}


export function unityModule(game, origin, id, options = {}) {
  return unityModules(game, origin, options).find(module => module.id === id) || null
}


// ==========================================
// UNITY_KIT_INDEX
// What each file in the kit is for, as data.
//
// ------------------------------------------------------------
// WHY THIS EXISTS
// ------------------------------------------------------------
// Every module below is a finished, tested client for one part
// of this Worker's API. They are generated per game with that
// game's id, URLs, deep-link scheme and product catalogue
// already substituted in, which means they are not examples -
// they are the code, and writing a second implementation of any
// of them is writing a second thing that can disagree with the
// server.
//
// It has happened. An assistant asked to "connect this offline
// game to the server" read the ROUTES table in Worker.js,
// inferred the request shapes from it, and wrote a fresh HTTP
// layer, a fresh token cache and a fresh entitlements client -
// none of which knew that a score below the record comes back
// 200 with success:false rather than as an error, or that the
// score body is a bare integer and not JSON, or that the
// leaderboard returns a top-level array that JsonUtility cannot
// parse. All three are documented in the `notes` of the module
// that already solved them.
//
// So this index is the machine-readable answer to "is there
// already code for this?". It is served by the panel's `unity`
// action and named in CLAUDE.md. The rule it exists to support:
//
//   READ THIS FIRST. If a module covers the job, generate it
//   with unityModules() and use it verbatim. Say which modules
//   you are using and why. Only write new C# for something no
//   module covers - and then follow the conventions of the ones
//   beside it.
// ==========================================
export const UNITY_KIT_INDEX = [
  {
    id: 'readme', file: 'README.md', kind: 'doc',
    covers: 'The install order, what each file does, and the troubleshooting table.',
    endpoints: [], requires: [], gatedBy: null
  },
  {
    id: 'constants', file: '<Pascal>Constants.cs', kind: 'code',
    covers: 'Every URL, the game id, the Android package, the deep-link scheme and the product '
          + 'ids, as compile-time constants. Nothing else in the kit hard-codes a URL.',
    endpoints: ['all'], requires: [], gatedBy: null
  },
  {
    id: 'api', file: 'AmirColliderApi.cs', kind: 'code',
    covers: 'The HTTP layer: Get/Post/Put with the bearer token attached, timeouts, retry, and '
          + 'ParseArray for the top-level JSON array JsonUtility refuses.',
    endpoints: [], requires: ['constants'], gatedBy: null
  },
  {
    id: 'auth', file: 'AmirColliderAuth.cs', kind: 'code',
    covers: 'Google sign-in end to end: the browser hand-off, the deep-link return, the code '
          + 'exchange, token storage and refresh-on-resume.',
    endpoints: ['/oauth/auth', '/oauth/token', '/auth/refresh', '/auth/validate', '/auth/check'],
    requires: ['constants', 'api'], gatedBy: 'capabilities.login'
  },
  {
    id: 'player', file: 'AmirColliderPlayer.cs', kind: 'code',
    covers: 'The player row: profile, high score, play time and the free-form save document. '
          + 'Knows that the score body is a bare integer and that a score below the record is a '
          + '200 with success:false rather than an error.',
    endpoints: ['/database/get/games/:id/users/:uid', '/database/set/…', '/database/patch/…'],
    requires: ['constants', 'api', 'auth'], gatedBy: 'capabilities.cloudSave'
  },
  {
    id: 'leaderboard', file: 'AmirColliderLeaderboard.cs', kind: 'code',
    covers: 'The public board. Handles the top-level array and the fact that opted-out and '
          + 'banned players are simply absent rather than ranked and hidden.',
    endpoints: ['/:gameId/leaderboard'], requires: ['constants', 'api'],
    gatedBy: 'capabilities.leaderboard'
  },
  {
    id: 'store', file: 'AmirColliderStore.cs', kind: 'code',
    covers: 'Products, entitlements and consuming a consumable. The entitlements API is '
          + 'authoritative over any local mirror.',
    endpoints: ['/games/:id/products', '/games/:id/entitlements', '/games/:id/entitlements/consume'],
    requires: ['constants', 'api', 'auth'], gatedBy: 'capabilities.store'
  },
  {
    id: 'status', file: 'AmirColliderStatus.cs', kind: 'code',
    covers: 'The manifest: whether the build is too old, whether the download has been '
          + 'withdrawn, and which capabilities are switched on right now.',
    endpoints: ['/games/:id/manifest'], requires: ['constants', 'api'], gatedBy: null
  },
  {
    id: 'bootstrap', file: 'AmirColliderBootstrap.cs', kind: 'code',
    covers: 'One MonoBehaviour that wires the rest together: check status, resume a returning '
          + 'player, read the profile, submit a score, refresh entitlements. The file to read '
          + 'to see how the others are meant to be called.',
    endpoints: [], requires: ['constants', 'api', 'auth', 'status'], gatedBy: null
  },
  {
    id: 'manifest', file: 'AndroidManifest.xml', kind: 'config',
    covers: 'The intent-filter that lets Android deliver the sign-in code back to the game. '
          + 'Without it the browser opens a blank tab and nothing reports an error anywhere.',
    endpoints: [], requires: [], gatedBy: 'platform.android'
  },
  {
    id: 'link', file: 'link.xml', kind: 'config',
    covers: 'Keeps the IL2CPP stripper from removing the serialisable classes JsonUtility '
          + 'reflects over in a release build.',
    endpoints: [], requires: [], gatedBy: 'platform.android'
  },
  {
    id: 'google', file: 'GOOGLE-SETUP.md', kind: 'doc',
    covers: 'The Google Cloud console steps, the redirect URIs to authorise, and which Worker '
          + 'secrets hold which client id.',
    endpoints: [], requires: [], gatedBy: 'capabilities.login'
  }
]


/**
 * The index narrowed to what THIS game actually gets, so a
 * caller does not have to re-derive the capability gates.
 *
 * Returned alongside the generated files by the panel's `unity`
 * action; the two are always in step because both come from
 * unityModules().
 */
export function unityKitIndex(game, origin, options = {}) {
  const present = new Set(unityModules(game, origin, options).map(module => module.id))
  return UNITY_KIT_INDEX
    .filter(entry => present.has(entry.id))
    .map(entry => ({ ...entry }))
}
