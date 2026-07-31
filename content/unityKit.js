// ==========================================
// content/unityKit.js
// The Unity side of every game on this Worker, as code somebody
// can paste into a project.
//
// Public exports:
//   unityModules(game, origin)  -> [{ id, file, title, summary, notes, code }]
//   unityModule(game, origin, id)
//   MODULE_IDS
//
// ------------------------------------------------------------
// WHAT THIS IS FOR
// ------------------------------------------------------------
// The Worker's API is not hard, and it is also not guessable.
// A game developer opening it for the first time has to work
// out that the leaderboard is public and the profile is not,
// that a high score below the stored one is answered with 200
// and success:false rather than an error, that Android gets its
// OAuth code back on a deep link and the editor does not, and
// that a consumable is spent by product rather than by currency.
//
// All of that is written down here, in the only form that
// cannot go out of date without somebody noticing: working
// code, generated from the same game record the site renders
// from. The game id, the endpoints and the product ids in every
// snippet are this game's real ones.
//
// The code is deliberately plain C#. No async/await over
// UnityWebRequest, no third-party JSON, no DI container -
// coroutines and JsonUtility, which every Unity project already
// has and every Unity developer can already read. A sample that
// needs three packages installed before it compiles is a sample
// that gets skimmed and reimplemented badly.
// ==========================================

export const MODULE_IDS = ['api', 'auth', 'player', 'leaderboard', 'store', 'status']


// ==========================================
// helpers
// ==========================================
function pascal(id) {
  return String(id || 'game').split('-').filter(Boolean)
    .map(part => part[0].toUpperCase() + part.slice(1)).join('')
}

function csharpName(id) {
  const parts = String(id || 'item').split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const name = parts.map(part => part[0].toUpperCase() + part.slice(1)).join('')
  return /^[0-9]/.test(name) ? 'P' + name : (name || 'Item')
}

function base(origin) {
  return String(origin || 'https://amircollider.com').replace(/\/+$/, '')
}


// ==========================================
// Module: AmirColliderApi.cs
// ==========================================
function apiModule(game, origin) {
  const code = `// ==========================================
// AmirColliderApi.cs
// One place where HTTP happens.
//
// Every other file here calls through this one, which buys
// three things that are tedious to get right in six places:
// a timeout, a single decision about what counts as an error,
// and one line to change when a header is added.
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
            request.SetRequestHeader("X-Game-ID", ${pascal(game.id)}Constants.GameId);

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
function authModule(game, origin) {
  const name = pascal(game.id)
  const code = `// ==========================================
// AmirColliderAuth.cs
// Signing a player in with Google, through the Worker.
//
// The Worker is a proxy, and the reason it exists is the
// client secret: exchanging an authorization code for tokens
// needs one, and a secret shipped inside an APK is a secret
// anybody can read with a zip tool. So the game gets a code and
// the Worker turns it into tokens.
//
// Two platforms, one flow:
//
//   Android   the browser opens, Google returns to
//             ${game.deepLink ? game.deepLink.scheme || 'yourscheme' : 'yourscheme'}://oauth?code=...  and the app
//             wakes up holding the code.
//
//   Editor    there is no deep link, so the Worker shows the
//   / desktop code on a page and the player pastes it in. Ugly,
//             and it is the only honest option for a build with
//             no URL scheme registered.
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

        public event Action<bool> OnSignInFinished;

        private const string RefreshKey = "amircollider_refresh_${game.id}";

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);

            Application.deepLinkActivated += OnDeepLink;

            // A cold start from a deep link delivers the URL here
            // rather than through the event, because the event was
            // subscribed to after the activation happened.
            if (!string.IsNullOrEmpty(Application.absoluteURL))
            {
                OnDeepLink(Application.absoluteURL);
            }
        }

        // ==========================================
        // SignIn
        // Opens the browser. Everything after this happens in
        // OnDeepLink, or in the editor path below.
        // ==========================================
        public void SignIn()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
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
            Application.OpenURL(url);
        }

        // Paste-the-code path, for the editor and for any build
        // without a registered URL scheme.
        public void SubmitCode(string code)
        {
            StartCoroutine(ExchangeCode(code));
        }

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
            string body = "code=" + UnityWebRequestEscape(code) + "&platform="
#if UNITY_ANDROID && !UNITY_EDITOR
                        + "android";
#else
                        + "web";
#endif

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

            if (OnSignInFinished != null) OnSignInFinished(!string.IsNullOrEmpty(IdToken));
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
        //
        // Local part, lowercased, first fifteen characters. It
        // has to match exactly: this is the key the player's row
        // and every entitlement are stored under, and a client
        // that computes it differently is a client that reads an
        // empty account.
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
        'روی اندروید کد از طریق deep link برمی‌گردد؛ در ادیتور صفحه‌ای کد را نشان می‌دهد تا دستی وارد شود.',
        'شناسه‌ی بازیکن دقیقاً مثل سرور ساخته می‌شود (بخش اول ایمیل، حروف کوچک، ۱۵ کاراکتر) — اگر فرق کند حساب خالی خوانده می‌شود.',
        'id_token حدود یک ساعت اعتبار دارد؛ روی OnApplicationPause و روی هر ۴۰۱، Refresh را صدا بزن.'
      ],
      en: [
        'On Android the code comes back on a deep link; in the editor the Worker shows it on a page to paste.',
        'The player id is derived exactly as the server derives it — local part, lowercased, 15 characters. Differ and you read an empty account.',
        'An id_token lasts about an hour. Call Refresh on resume and on any 401.'
      ],
      ja: [
        'Android ではディープリンクで code が戻り、エディタではページに表示されたコードを貼り付けます。',
        'プレイヤー ID はサーバーと同じ導出（ローカル部・小文字・15 文字）。違えば空のアカウントを読みます。',
        'id_token は約 1 時間有効。復帰時と 401 時に Refresh を呼んでください。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderPlayer.cs
// ==========================================
function playerModule(game, origin) {
  const name = pascal(game.id)
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
//
// The Worker checks that the id in the path matches the id in
// the token, so a client can only ever write its own row. That
// check is not something to work around - it is the reason none
// of this needs a secret.
// ==========================================

using System;
using System.Collections;
using UnityEngine;

namespace AmirCollider
{
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
    }

    public static class AmirColliderPlayer
    {
        // ==========================================
        // Load
        // The signed-in player's row.
        //
        // A 404 here is not an error: it is a player who has
        // signed in and never been written. Create the row with
        // Save() the first time.
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
        // A score that does not beat the stored one comes back
        // 200 with success:false, NOT an error - because it is
        // not one. Treating that as a failure is the mistake this
        // note exists to prevent: it produces a retry loop that
        // can never succeed.
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
        //
        // The username rules are enforced server-side: 3-12
        // characters, English letters and digits only, and a
        // profanity blocklist. A rejection comes back 400 with
        // the message in all three site languages, so the game
        // can show the player their own.
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
        '۴۰۴ روی خواندن پروفایل یعنی بازیکن هنوز ردیفی ندارد؛ اولین Save آن را می‌سازد.'
      ],
      en: [
        'A score below the record returns 200 with success:false — not an error. Treating it as one produces a retry loop that can never succeed.',
        'The score body is the bare number, not JSON.',
        'A 404 on the profile read means the player has no row yet; the first Save creates it.'
      ],
      ja: [
        '記録未満のスコアは 200 と success:false を返します。エラー扱いすると無限リトライになります。',
        'スコア送信のボディは JSON ではなく数値そのものです。',
        'プロフィール取得の 404 は「まだ行がない」の意味。最初の Save で作成されます。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderLeaderboard.cs
// ==========================================
function leaderboardModule(game, origin) {
  const name = pascal(game.id)
  const code = `// ==========================================
// AmirColliderLeaderboard.cs
// The public score table.
//
// No token. This endpoint is deliberately open: it is the same
// list the website renders at ${base(origin)}/${game.id}/leaderboard,
// and requiring a sign-in to read a public board would mean a
// player cannot see where they stand before they have an
// account.
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
function storeModule(game, origin) {
  const name = pascal(game.id)
  const products = (game.store && game.store.products) || []

  const code = `// ==========================================
// AmirColliderStore.cs
// What the player owns, and how they get more.
//
// There are two ways to buy in this game and they end in the
// same place:
//
//   in the game   the platform store (Google Play), handled by
//                 whatever IAP plugin the project uses.
//
//   on the site   ${base(origin)}/${game.id}/store
//                 The player signs in with the same Google
//                 account, pays with cryptocurrency, and the
//                 Worker grants the entitlement.
//
// Either way the answer to "what does this player own?" is the
// entitlements endpoint below. The game does not need to know
// which route a purchase came in by, and should not care.
//
// ------------------------------------------------------------
// SPENDING A CONSUMABLE
// ------------------------------------------------------------
// Balances are held per PRODUCT, not per currency. A player
// with both shard packs has two rows, and spending 1,500 shards
// takes them out of one row and then the other. Spend() below
// does that walk, so nothing else has to.
//
// It is per-product because the decrement is a conditional
// UPDATE on one row - "subtract this if there is this much" -
// and that is what makes two devices spending the last hundred
// shards at the same moment impossible to get wrong.
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
        //
        // Call it after sign-in, on resume, and after sending the
        // player to the web store - a purchase made in a browser
        // lands the moment the payment confirms, and the game
        // finds out by asking.
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
        //
        // The server refuses to go below zero, so a client that
        // asks for more than is there gets ok:false and nothing
        // moves. Trust that answer rather than the local copy:
        // the local copy is a cache and the other device is real.
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
        //
        // Not atomic across rows: two rows means two calls, and a
        // process killed between them leaves the first spent. The
        // alternative - one balance for a currency - loses the
        // per-product history that answers every refund question,
        // and the failure here costs a player some shards on a
        // crash rather than costing them a purchase.
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
  const code = product.grant && product.grant.code ? product.grant.code : ''
  const kind = product.kind === 'consumable' && code ? code : ''
  return `                case "${product.id}": return "${kind}";`
}).join('\n') || '                default: return "";'}
            }
            return "";
        }

        // ==========================================
        // OpenWebStore
        // Sends the player to the site to buy.
        //
        // Useful in three situations that are not edge cases: a
        // platform store that is unavailable in the player's
        // country, a payment method the store does not take, and
        // a build distributed outside a store entirely.
        //
        // They sign in with the same Google account, so whatever
        // they buy is already theirs the next time Refresh()
        // runs.
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
        'بعد از برگشتن از فروشگاه وب حتماً Refresh() را صدا بزن؛ خرید همان لحظه‌ی تأیید پرداخت ثبت می‌شود.'
      ],
      en: [
        'Balances are per product, not per currency. Spend() walks the rows so nothing else has to.',
        'Never decide ownership client-side. The server answer is the only one that counts.',
        'Call Refresh() after sending someone to the web store — the grant lands the moment the payment confirms.'
      ],
      ja: [
        '残高は通貨単位ではなく商品単位です。Spend() が行をまたいで消費します。',
        '所有判定をクライアントで行わないこと。サーバーの回答だけが正です。',
        'Web ストアから戻ったら必ず Refresh()。支払い確定と同時に付与されます。'
      ]
    },
    code
  }
}


// ==========================================
// Module: AmirColliderStatus.cs
// ==========================================
function statusModule(game, origin) {
  const name = pascal(game.id)
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
// ------------------------------------------------------------
// AND IF IT FAILS?
// ------------------------------------------------------------
// The game starts anyway.
//
// That is the important line in this file. ${game.capabilities && game.capabilities.onlinePlay
    ? 'This game needs the\n// network to play, so a failure here is worth a retry and a\n// message - but not a locked door on a plane.'
    : 'This game plays\n// offline; the network is only wanted for signing in and\n// buying. A manifest that does not load must never be a\n// player who cannot play.'}
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
        'حالت maintenance یعنی فقط لینک دانلود برداشته شده — ورود، خرید و جدول امتیازات همچنان کار می‌کنند.'
      ],
      en: [
        'If the fetch fails the game still starts. "The manifest did not load" must never mean "you cannot play".',
        'Versions are compared numerically, not as strings — "1.2.10" is newer than "1.2.9".',
        'Maintenance withdraws the download only. Sign-in, purchases and the leaderboard keep working.'
      ],
      ja: [
        '取得に失敗してもゲームは起動します。「マニフェスト未取得」が「プレイ不可」になってはいけません。',
        'バージョンは文字列でなく数値で比較します（1.2.10 > 1.2.9）。',
        'maintenance はダウンロードのみ停止。ログイン・購入・ランキングは動作します。'
      ]
    },
    code
  }
}


// ==========================================
// unityModules
// The whole kit, in the order somebody should read it.
//
// Ordered by dependency rather than by importance: nothing
// compiles without the constants and the API layer, and
// everything after those three is optional depending on what
// the game actually does.
// ==========================================
export function unityModules(game, origin) {
  const modules = [
    apiModule(game, origin),
    authModule(game, origin)
  ]

  if (game.capabilities && game.capabilities.cloudSave) modules.push(playerModule(game, origin))
  if (game.capabilities && game.capabilities.leaderboard) modules.push(leaderboardModule(game, origin))
  if (game.capabilities && game.capabilities.store) modules.push(storeModule(game, origin))

  modules.push(statusModule(game, origin))

  return modules
}


export function unityModule(game, origin, id) {
  return unityModules(game, origin).find(module => module.id === id) || null
}
