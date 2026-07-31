// ==========================================
// pages/releaseNotes.js
// Release Notes Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================
//
// Responsibilities
//   - Render the public Release Notes page: topbar, hero and a grouped
//     version changelog. Theme-aware (light/dark/auto) and tri-lingual
//     (fa/en/ja) with correct RTL/LTR, matching the dashboard chrome.
//
// Integration contract (do not break without updating callers)
//   - Public entry: handleReleaseNotes(url, request, gameId, requestId,
//                                      GAMES, env, availableEndpoints)
//   - Route: GET /release-notes  (registered in worker.js ROUTES)
//
// Extending
//   - Add a release:  prepend one entry to RELEASES below.
//   - Add a group:    push one object into release.groups.
//   - Add a language:  add one entry to RN_I18N and fill every group.
// ==========================================

import { CONFIG } from '../config.js'
import { getPageHead } from '../shared-styles.js'
import { createHtmlResponse } from '../utils.js'

// ==========================================
// SITE_NAME
// What the browser tab says.
//
// The <title> used to be "AmirCollider Proxy - v6.7.1", which put
// two things in a tab that has room for neither: "Proxy" is what
// the service is rather than what the site is called, and the
// version is already stamped on the page itself, where somebody
// looking for it can actually read it. A tab is a bookmark label.
// ==========================================
const SITE_NAME = 'AmirCollider'

const DEFAULT_LANG = 'fa'
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// ==========================================
// i18n - release notes chrome strings (fa / en / ja)
// ==========================================
const RN_I18N = {
  fa: {
    locale: 'fa-IR',
    title: 'یادداشت‌های انتشار',
    subtitle: 'تاریخچه‌ی تغییرات و نسخه‌های AmirCollider',
    langName: 'فارسی',
    backHome: 'بازگشت به صفحه‌ی اصلی',
    themeToLight: 'حالت روشن',
    themeToDark: 'حالت تاریک',
    latest: 'جدیدترین',
    back: 'بازگشت به خانه',
    footerTagline: 'سامانه پروکسی OAuth برای بازی‌های AmirCollider.',
    footerPowered: 'اجرا شده روی Cloudflare Workers'
  },
  en: {
    locale: 'en-US',
    title: 'Release notes',
    subtitle: 'Change history and versions of AmirCollider',
    langName: 'English',
    backHome: 'Back to the home page',
    themeToLight: 'Light mode',
    themeToDark: 'Dark mode',
    latest: 'Latest',
    back: 'Back to home',
    footerTagline: 'OAuth proxy for AmirCollider games.',
    footerPowered: 'Powered by Cloudflare Workers'
  },
  ja: {
    locale: 'ja-JP',
    title: 'リリースノート',
    subtitle: 'AmirCollider の変更履歴とバージョン',
    langName: '日本語',
    backHome: 'ホームに戻る',
    themeToLight: 'ライトモード',
    themeToDark: 'ダークモード',
    latest: '最新',
    back: 'ホームに戻る',
    footerTagline: 'AmirCollider ゲーム向けの OAuth プロキシ。',
    footerPowered: 'Cloudflare Workers で稼働'
  }
}

// ==========================================
// Release timeline (newest first)
// Each release has a localized summary and grouped change items.
// tag: 'latest' highlights the current version.
// ==========================================
const RELEASES = [
  {
    version: '6.7.2',
    date: '2026-07-31',
    tag: 'latest',
    summary: {
      fa: 'صفحه‌ی اختصاصی و صفحه‌ی نسخه‌ها برای هر بازی، بازنویسی کامل پنل بازیکن‌ها با امکان مسدودسازی، تکمیل پنل کاربری سایت، و ذخیره‌ی آزاد برای بازی‌ها بدون تغییر دیتابیس.',
      en: 'A landing page and a versions page for every game, a rebuilt players panel with real moderation, a complete site account panel, and free-form game saves that need no schema change.',
      ja: 'ゲームごとのランディングページとバージョンページ、モデレーション機能を備えたプレイヤーパネルの刷新、サイトアカウントパネルの完成、スキーマ変更不要の自由形式セーブ。'
    },
    groups: [
      {
        title: { fa: 'صفحه‌های تازه‌ی بازی', en: 'New game pages', ja: '新しいゲームページ' },
        items: {
          fa: [
            'صفحه‌ی اختصاصی هر بازی روی /{بازی}: لوگو، بنر، توضیح بلند، ویدیوهای تبلیغاتی و دستگاه‌های پشتیبانی‌شده.',
            'صفحه‌ی نسخه‌ها روی /{بازی}/versions: نسخه‌ی فعلی، تاریخ انتشار و فهرست تغییرات هر نسخه.',
            'هر دو از کارت بازی در صفحه‌ی اصلی لینک شده‌اند و عنوان کارت هم لینک صفحه‌ی بازی شد.',
            'ویدیوهای یوتیوب و آپارات جاسازی می‌شوند؛ هر آدرس دیگری فقط لینک ساده می‌شود — چون iframe با آدرس دلخواه یعنی اجرای کد دیگران داخل صفحه‌ی ما.',
            'همه‌ی این‌ها از دیتابیس خوانده می‌شود (مهاجرت 0005) و بدون deploy در پنل قابل تغییر است.'
          ],
          en: [
            'A landing page for every game at /{game}: logo, banner, the long pitch, promotional videos and supported devices.',
            'A versions page at /{game}/versions: the current version, its release date and what changed in each release.',
            'Both are linked from the game card, and the card title is now a link to the game page.',
            'YouTube and Aparat videos are embedded; any other address renders as a plain link — an iframe pointed at an arbitrary host is somebody else’s code inside our page.',
            'All of it is database-driven (migration 0005) and editable in the panel without a deploy.'
          ],
          ja: [
            '各ゲームのランディングページ /{game}：ロゴ、バナー、長い紹介文、プロモーション動画、対応デバイス。',
            'バージョンページ /{game}/versions：現在のバージョン、リリース日、各リリースの変更点。',
            '両方ともゲームカードからリンクされ、カードのタイトルもゲームページへのリンクになりました。',
            'YouTube と Aparat の動画は埋め込み、それ以外はリンク表示。任意のホストを指す iframe は他人のコードをページ内で実行することになるためです。',
            'すべてデータベース駆動（マイグレーション 0005）で、デプロイなしにパネルから編集できます。'
          ]
        }
      },
      {
        title: { fa: 'پنل بازیکن‌ها', en: 'The players panel', ja: 'プレイヤーパネル' },
        items: {
          fa: [
            'پنل بازیکن‌ها از اول نوشته شد. قبلاً فقط داخل جدول سفارش‌ها جست‌وجو می‌کرد، پس کسی که خرید نکرده بود اصلاً دیده نمی‌شد.',
            'حالا دیتابیس خودِ بازی خوانده می‌شود: نام کاربری، بالاترین امتیاز، تعداد بازی، مدت بازی، تاریخ عضویت و آخرین ورود.',
            'مسدود کردن، محدودیت زمانی (۷ یا ۳۰ روزه)، تغییر نام کاربری، یادداشت داخلی و حذف حساب.',
            'مسدودی واقعاً اعمال می‌شود: ثبت امتیاز جدید رد می‌شود و بازیکن از جدول امتیازات کنار گذاشته می‌شود.',
            'حذف حساب فقط ردیف بازیکن را پاک می‌کند؛ سفارش‌ها می‌مانند چون سند مالی‌اند.',
            'مهاجرت 0006 روی دیتابیس هر بازی اجرا می‌شود. اگر اجرا نشده باشد، پنل کار می‌کند و فقط دکمه‌های مسدودسازی را با توضیح غیرفعال نشان می‌دهد.'
          ],
          en: [
            'The players panel was rewritten. It used to search only the orders table, so anybody who had not bought something was invisible.',
            'It now reads the game’s own database: username, high score, runs, play time, join date and last login.',
            'Ban, time-boxed restriction (7 or 30 days), rename, an internal note, and account deletion.',
            'A ban actually bites: new score submissions are refused and the player is left off the leaderboard.',
            'Deleting an account removes the player row only — orders survive, because they are a financial record.',
            'Migration 0006 runs against each game’s own database. Without it the panel still works and simply disables the moderation buttons with an explanation.'
          ],
          ja: [
            'プレイヤーパネルを作り直しました。以前は注文テーブルのみを検索していたため、購入していない人は表示されませんでした。',
            'ゲーム自身のデータベースを読むようになりました：ユーザー名、ハイスコア、プレイ回数、プレイ時間、登録日、最終ログイン。',
            'BAN、期間制限（7 日／30 日）、名前変更、内部メモ、アカウント削除。',
            'BAN は実際に効きます：新しいスコア送信は拒否され、ランキングからも除外されます。',
            'アカウント削除はプレイヤー行のみを削除します。注文は財務記録のため残ります。',
            'マイグレーション 0006 は各ゲームのデータベースに対して実行します。未実行でもパネルは動作し、モデレーションのボタンが説明付きで無効になります。'
          ]
        }
      },
      {
        title: { fa: 'پنل کاربری سایت', en: 'The site account panel', ja: 'サイトのアカウントパネル' },
        items: {
          fa: [
            'دکمه‌ی کارت بازی دیگر به کسی که وارد شده «ورود به حساب» نمی‌گوید؛ «حساب من» می‌شود و نامش را نشان می‌دهد.',
            'صفحه‌ی حساب حالا بالاترین امتیاز، تعداد بازی، مدت بازی، تاریخ عضویت و آخرین ورود را نشان می‌دهد.',
            'تغییر نام کاربری و تصویر پروفایل از خود صفحه، با دکمه‌ی برگرداندن تصویر گوگل.',
            'شناسه‌ی بازیکن همیشه از کوکی امضاشده خوانده می‌شود، نه از فرم — پس هیچ فیلدی نمی‌تواند حساب دیگری را ویرایش کند.',
            'آدرس تصویر فقط https پذیرفته می‌شود، چون همان تصویر در جدول امتیازات برای بقیه بارگذاری می‌شود.'
          ],
          en: [
            'The game card no longer says “Sign in” to somebody who is signed in; it says “My account” and shows who.',
            'The account page now shows high score, runs, play time, join date and last seen.',
            'Change your username and profile picture from the page, with a button to put the Google one back.',
            'The player id always comes from the signed cookie, never from the form — so no field can edit another account.',
            'A picture URL must be https, because that image loads for every other player on the leaderboard.'
          ],
          ja: [
            'サインイン済みの人に「サインイン」と表示されなくなりました。「アカウント」と表示され、誰かが分かります。',
            'アカウントページにハイスコア、プレイ回数、プレイ時間、登録日、最終ログインを表示。',
            'ページ上でユーザー名とプロフィール画像を変更でき、Google の画像に戻すボタンもあります。',
            'プレイヤー ID は常に署名済み Cookie から取得し、フォームからは取りません。',
            '画像 URL は https のみ。ランキングで他のプレイヤーが読み込む画像だからです。'
          ]
        }
      },
      {
        title: { fa: 'انعطاف برای بازی‌های جدید', en: 'Flexibility for new games', ja: '新しいゲームへの柔軟性' },
        items: {
          fa: [
            'ستون data_json به جدول بازیکن‌ها اضافه شد (مهاجرت 0007): هر بازی هر چیزی که بخواهد داخلش ذخیره می‌کند.',
            'قبلاً هر فیلد قابل ذخیره باید یک ستون می‌بود و در سه جا تعریف می‌شد. حالا اضافه کردن یک فیلد فقط یک خط C# داخل همان بازی است.',
            'dataPatch کلید به کلید ادغام می‌کند، پس بیلد قدیمی فیلدی را که نمی‌شناسد پاک نمی‌کند؛ data کل سند را جایگزین می‌کند.',
            'کلاس GameData و متد SaveData به کیت یونیتی اضافه شد.',
            'کد یونیتی هیچ کد خرید مایکت یا گوگل پلی ندارد و نداشت — خرید از فروشگاه وب انجام می‌شود.'
          ],
          en: [
            'A data_json column on the players table (migration 0007): each game stores whatever it wants in it.',
            'Every savable field used to be a column defined in three places. Adding one is now a line of C# in that game and nothing else.',
            'dataPatch merges key by key, so an old build cannot wipe a field it has never heard of; data replaces the whole document.',
            'A GameData class and a SaveData method were added to the Unity kit.',
            'The Unity code has no Myket or Google Play billing and never did — purchases run through the web store.'
          ],
          ja: [
            'players テーブルに data_json 列を追加（マイグレーション 0007）。各ゲームが好きなものを保存できます。',
            '従来は保存項目ごとに列が必要で 3 箇所に定義していました。今は該当ゲームの C# 1 行だけです。',
            'dataPatch はキー単位でマージするため、古いビルドが知らない項目を消しません。data は文書全体を置き換えます。',
            'Unity キットに GameData クラスと SaveData メソッドを追加。',
            'Unity コードに Myket や Google Play の課金コードは元からありません。購入は Web ストアで行われます。'
          ]
        }
      },
      {
        title: { fa: 'رابط کاربری', en: 'Interface', ja: 'インターフェース' },
        items: {
          fa: [
            'عنوان تب مرورگر فقط «AmirCollider» شد؛ قبلاً «AmirCollider Proxy - v6.7.1» بود.',
            'در صفحه‌ی Release notes، لوگوی بالای صفحه به صفحه‌ی اصلی لینک شد.',
            'در پنل، نام‌های مجاز لینک دانلود (myket، googleplay، apk، web) با نمونه نشان داده می‌شود و با کلیک اضافه می‌شود.',
            'دکمه‌ی مبهم «باز کردن صفحه» با فهرست نام‌دار همه‌ی صفحه‌های بازی جایگزین شد.',
            'بهبود ظاهر در موبایل: دکمه‌های تمام‌عرض، جدول‌های قابل اسکرول و اندازه‌های متناسب‌تر.'
          ],
          en: [
            'The browser tab now says just “AmirCollider”; it used to say “AmirCollider Proxy - v6.7.1”.',
            'On the release-notes page the header logo is now a link home.',
            'The panel lists the recognised download-link names (myket, googleplay, apk, web) with examples you can click to insert.',
            'The vague “open the page” button was replaced with a labelled list of every page the game has.',
            'Mobile improvements: full-width buttons, scrollable tables and better proportions.'
          ],
          ja: [
            'ブラウザーのタブが「AmirCollider」だけになりました（以前は「AmirCollider Proxy - v6.7.1」）。',
            'リリースノートページのヘッダーロゴがホームへのリンクになりました。',
            'ダウンロードリンクで使える名前（myket、googleplay、apk、web）を例付きで表示し、クリックで挿入できます。',
            '曖昧だった「ページを開く」ボタンを、ゲームの全ページを名前付きで並べたものに置き換えました。',
            'モバイル改善：全幅ボタン、横スクロールする表、より適切なサイズ。'
          ]
        }
      }
    ]
  },
  {
    version: '6.7.1',
    date: '2026-07-31',
    summary: {
      fa: 'رفع اشکال‌های پنل‌ها و کارت بازی: هویت پنل تست، نمایش لوگوها، خروج اسکیم دیپ‌لینک از secretها، تب متغیرها، و پشتیبانی از چند روش دانلود.',
      en: 'Panel and game-card fixes: the test panel’s own identity, logo rendering, the deep-link scheme out of secrets, an Environment tab, and support for several download methods.',
      ja: 'パネルとゲームカードの修正：テストパネルの識別、ロゴ表示、ディープリンクのシークレット解除、環境変数タブ、複数の配信方法への対応。'
    },
    groups: [
      {
        title: { fa: 'پنل‌ها', en: 'Panels', ja: 'パネル' },
        items: {
          fa: [
            'پنل تست دیگر خودش را با نام و رنگ اولین بازی رجیستری معرفی نمی‌کند؛ نام سایت و رنگ صفحه‌ی ورود خودش را دارد.',
            'تب جدید «متغیرها» در پنل TheGod: فهرست همه‌ی متغیرهایی که Worker می‌خواند، وضعیت تنظیم‌شدن هرکدام، و آدرس redirect که باید در Google Cloud Console ثبت شود.',
            'مقدار هیچ secretی به مرورگر فرستاده نمی‌شود؛ فقط «تنظیم شده / نشده» و تعداد نویسه‌ها، که برای تشخیص paste اشتباه کافی است.',
            'برچسب «عمومی» و «محرمانه» برای هر ردیف جدا، تا معلوم باشد کدام مقدار از قبل قابل دیدن بوده و کدام هیچ‌وقت نمایش داده نمی‌شود.',
            'دکمه‌ی «پاک کردن ردیف‌های دیتابیس» و SQL معادلش، برای برگرداندن یک بازی به دقیقاً همان چیزی که در config.js نوشته شده.',
            'خروجی SQL تنظیمات حالا می‌نویسد کدام ستون‌ها واقعاً مقدار دارند، به‌جای چاپ یک دیوار NULL.'
          ],
          en: [
            'The test panel no longer introduces itself with the first registered game’s name and colour; it uses the site’s own brand and its login page’s accent.',
            'New Environment tab in TheGod: every variable the Worker reads, whether each one is set, and the redirect URI to register in the Google Cloud console.',
            'No secret’s value is sent to the browser — only “set / not set” and a character count, which is enough to spot a bad paste.',
            'Per-row “public” and “secret” tags, so it is clear which values were already visible and which are never shown.',
            'A “delete the database rows” button and the matching SQL, to put a game back to exactly what config.js says.',
            'The settings SQL now names which columns actually hold a value instead of printing a wall of NULLs.'
          ],
          ja: [
            'テストパネルが最初のゲームの名前と色を借りるのをやめ、サイト自身のブランドとログインページのアクセントを使うようになりました。',
            'TheGod に「環境変数」タブを追加：Worker が読むすべての変数、設定状況、Google Cloud コンソールに登録すべきリダイレクト URI を表示。',
            'シークレットの値はブラウザーに送信されません。「設定済み / 未設定」と文字数だけを表示します。',
            '行ごとの「公開」「秘密」タグにより、元から見えている値と決して表示されない値を区別。',
            'ゲームを config.js の状態に戻す「データベースの行を削除」ボタンと対応する SQL。',
            '設定 SQL が NULL の羅列ではなく、実際に値のある列を明示するようになりました。'
          ]
        }
      },
      {
        title: { fa: 'ورود با گوگل و دیپ‌لینک', en: 'Google sign-in & deep links', ja: 'Google サインインとディープリンク' },
        items: {
          fa: [
            'اسکیم دیپ‌لینک دیگر secret نیست. حالا به ترتیب از پنل، سپس متغیر Cloudflare، سپس مقدار پشتیبان داخل config.js خوانده می‌شود.',
            'قبلاً این متغیر در فهرست «الزامی» بود و پاک کردنش کل سایت را با خطای ۵۰۰ از کار می‌انداخت — از جمله خود پنل‌ها. دیگر این‌طور نیست.',
            'بررسی متغیرهای الزامی حالا از روی رجیستری بازی‌ها ساخته می‌شود، پس بازی دوم هم بررسی می‌شود.',
            'اسکیم دیپ‌لینک هنگام ذخیره و هنگام خواندن اعتبارسنجی می‌شود؛ مقداری که اسکیم معتبر نباشد پذیرفته نمی‌شود.',
            'مسیر /oauth/auth دیگر هر client_id دلخواهی را قبول نمی‌کند. فرستادن client_id اندروید به آن دقیقاً خطای redirect_uri_mismatch می‌ساخت.',
            'مهاجرت 0004_deeplink.sql: یک ستون deeplink_scheme به جدول game_settings اضافه می‌کند.'
          ],
          en: [
            'The deep-link scheme is no longer a secret. It now resolves from the panel, then a Cloudflare variable, then the fallback in config.js.',
            'It used to be on the required list, so deleting the variable took the whole site down with a 500 — including the panels. No longer.',
            'The required-variable check is now derived from the game registry, so a second game is actually checked.',
            'The scheme is validated on write and on read; a value that is not a URL scheme is refused.',
            '/oauth/auth no longer accepts an arbitrary client_id. Passing an Android client id there produced exactly the redirect_uri_mismatch error.',
            'Migration 0004_deeplink.sql adds one deeplink_scheme column to game_settings.'
          ],
          ja: [
            'ディープリンクのスキームはシークレットではなくなりました。パネル → Cloudflare 変数 → config.js の既定値の順で解決されます。',
            '以前は必須リストにあり、変数を削除するとパネルを含むサイト全体が 500 になりました。もう起きません。',
            '必須変数のチェックをゲームレジストリから導出するようになり、2 つ目のゲームも検査されます。',
            'スキームは書き込み時と読み込み時に検証され、URL スキームでない値は拒否されます。',
            '/oauth/auth は任意の client_id を受け付けなくなりました。Android の client id を渡すと redirect_uri_mismatch になっていました。',
            'マイグレーション 0004_deeplink.sql が game_settings に deeplink_scheme 列を追加します。'
          ]
        }
      },
      {
        title: { fa: 'کارت بازی و ظاهر', en: 'Game card & appearance', ja: 'ゲームカードと表示' },
        items: {
          fa: [
            'لوگوی بازی‌ها درست نمایش داده می‌شود. جعبه‌ی لوگو یک flex بود که اموجی و تصویر عرضش را بین خودشان تقسیم می‌کردند و از لوگو یک باریکه می‌ماند.',
            'پشتیبانی از چند روش دانلود: مایکت، گوگل پلی، APK مستقیم و بازی تحت وب — هرکدام با لوگوی خودش.',
            'یک روش یا چند روش، هر دو با یک فرم ساخته می‌شود؛ فیلد خالی یعنی آن دکمه ساخته نشود.',
            'مسیر /{بازی}/download?store=… فقط بین لینک‌های خود بازی انتخاب می‌کند، پس نمی‌شود از آن به‌عنوان redirect باز سوءاستفاده کرد.',
            'حذف جمله‌ی تکراری زیر برچسب «قابل بازی بدون اینترنت» — همان اطلاعات را چیپ‌های کنارش می‌گفتند.',
            'رفع اشکال «بدون برچسب»: برداشتن ریبون یک محصول ذخیره می‌شد ولی ریبون از config.js دوباره برمی‌گشت.'
          ],
          en: [
            'Game logos render correctly. The logo box was a flex container where the emoji and the image split the width, leaving a sliver of the logo.',
            'Support for several download methods: Myket, Google Play, a direct APK and a browser game — each with its own logo.',
            'One method or several are the same form; an empty field simply means that button is not rendered.',
            '/{game}/download?store=… only picks among the game’s own links, so it cannot be abused as an open redirect.',
            'Removed the sentence duplicating the “plays offline” chip — the chips beside it already said the same thing.',
            'Fixed “No ribbon”: taking a product’s ribbon off appeared to save and then came back from config.js.'
          ],
          ja: [
            'ゲームのロゴが正しく表示されます。ロゴ枠が flex で、絵文字と画像が幅を分け合っていました。',
            '複数の配信方法に対応：Myket、Google Play、APK 直リンク、ブラウザーゲーム。それぞれ専用ロゴ付き。',
            '1 つでも複数でも同じフォームで設定でき、空欄の項目はボタンが表示されません。',
            '/{game}/download?store=… はそのゲームのリンクからのみ選ぶため、オープンリダイレクトになりません。',
            '「オフラインで遊べる」チップの下にあった重複した一文を削除しました。',
            '「リボンなし」の不具合を修正：保存したように見えて config.js のリボンが戻っていました。'
          ]
        }
      }
    ]
  },
  {
    version: '6.7',
    date: '2026-06-24',
    summary: {
      fa: 'بازسازی کامل سایت: سیستم طراحی جدید، پشتیبانی سه‌زبانه، تم روشن/تاریک/خودکار، میزبانی فایل‌ها روی R2 و انتقال دامنه.',
      en: 'A full site rebuild: a new design system, trilingual support, light/dark/auto theming, R2-hosted assets and a domain migration.',
      ja: 'サイトの全面刷新：新しいデザインシステム、3言語対応、ライト/ダーク/自動テーマ、R2 によるアセット配信、ドメイン移行。'
    },
    groups: [
      {
        title: { fa: 'طراحی و رابط کاربری', en: 'Design & UI', ja: 'デザイン & UI' },
        items: {
          fa: [
            'بازطراحی کامل تمام صفحات (داشبورد، سلامت، پینگ، متریک‌ها، جدول امتیازات، حریم خصوصی، شرایط استفاده و پنل تست) با یک سیستم طراحی یکپارچه.',
            'جایگزینی ظاهر قدیمی شیشه‌ای/گرادیانی با سیستم مبتنی بر توکن‌های رنگ و فاصله.',
            'افزودن فونت Vazirmatn و مجموعه آیکون‌های SVG به‌جای ایموجی‌ها.',
            'ساختار CSS ماژولار (توکن‌ها، پایه، چیدمان، تایپوگرافی، کامپوننت‌ها، انیمیشن‌ها، واکنش‌گرایی).',
            'حذف بخش «ویژگی‌های کلیدی» از داشبورد برای ظاهری تمیزتر و حرفه‌ای‌تر.'
          ],
          en: [
            'Complete redesign of every page (dashboard, health, ping, metrics, leaderboard, privacy, terms and the test panel) under one unified design system.',
            'Replaced the old glass/gradient look with a color- and spacing-token based system.',
            'Added the Vazirmatn font and an SVG icon set in place of emojis.',
            'Modular CSS structure (tokens, base, layout, typography, components, animations, responsive).',
            'Removed the “Key features” section from the dashboard for a cleaner, more professional look.'
          ],
          ja: [
            '全ページ（ダッシュボード、ヘルス、Ping、メトリクス、リーダーボード、プライバシー、利用規約、テストパネル）を統一デザインシステムで再設計。',
            '旧来のガラス/グラデーション表現を、カラー・スペーシングのトークン方式に置き換え。',
            'Vazirmatn フォントと SVG アイコンセットを採用し、絵文字を廃止。',
            'モジュール化された CSS 構成（トークン、ベース、レイアウト、タイポグラフィ、コンポーネント、アニメーション、レスポンシブ）。',
            'ダッシュボードから「主な特徴」セクションを削除し、より洗練された見た目に。'
          ]
        }
      },
      {
        title: { fa: 'پشتیبانی چندزبانه', en: 'Multilingual support', ja: '多言語対応' },
        items: {
          fa: [
            'افزودن زبان‌های انگلیسی و ژاپنی در کنار فارسی در همه‌ی صفحات.',
            'چیدمان درست راست‌چین/چپ‌چین (RTL/LTR) بر اساس زبان انتخابی.',
            'سوییچ زبان با ماندگاری انتخاب از طریق کوکی و localStorage.',
            'تشخیص خودکار زبان: پارامتر آدرس ← کوکی ← هدر مرورگر ← پیش‌فرض.',
            'محلی‌سازی اعداد و تاریخ‌ها با Intl.'
          ],
          en: [
            'Added English and Japanese alongside Persian across every page.',
            'Correct RTL/LTR layout driven by the selected language.',
            'Language switcher whose choice persists via cookie and localStorage.',
            'Automatic language resolution: URL query → cookie → browser header → default.',
            'Localized numbers and dates via Intl.'
          ],
          ja: [
            '全ページでペルシャ語に加え英語・日本語を追加。',
            '選択言語に応じた正しい RTL/LTR レイアウト。',
            'Cookie と localStorage に選択を保存する言語スイッチャー。',
            '言語の自動判定：URL クエリ → Cookie → ブラウザヘッダー → 既定値。',
            'Intl による数値・日付のローカライズ。'
          ]
        }
      },
      {
        title: { fa: 'تم و حالت نمایش', en: 'Theming', ja: 'テーマ' },
        items: {
          fa: [
            'افزودن حالت‌های روشن، تاریک و خودکار (پیروی از سیستم‌عامل).',
            'دکمه‌ی تغییر دستی تم با ماندگاری انتخاب (localStorage + کوکی).',
            'اعمال تم پیش از اولین رنگ‌آمیزی صفحه برای جلوگیری از پرش لحظه‌ای.',
            'انیمیشن نرم هنگام جابه‌جایی بین روشن و تاریک با View Transitions API و احترام به prefers-reduced-motion.'
          ],
          en: [
            'Added light, dark and auto modes (auto follows the OS).',
            'A manual theme toggle that remembers your choice (localStorage + cookie).',
            'Theme applied before first paint to avoid a flash on load.',
            'Smooth animated light↔dark switch via the View Transitions API, honoring prefers-reduced-motion.'
          ],
          ja: [
            'ライト・ダーク・自動モードを追加（自動は OS に追従）。',
            '選択を記憶する手動テーマ切り替え（localStorage + Cookie）。',
            '初回描画前にテーマを適用し、読み込み時のちらつきを防止。',
            'View Transitions API によるスムーズなライト↔ダーク切り替え。prefers-reduced-motion を尊重。'
          ]
        }
      },
      {
        title: { fa: 'زیرساخت', en: 'Infrastructure', ja: 'インフラ' },
        items: {
          fa: [
            'میزبانی فایل‌های استاتیک (لوگوها و دارایی‌ها) روی فضای ذخیره‌سازی داخلی Cloudflare R2 از مسیر /assets به‌جای لینک‌های خارجی Google Drive؛ سریع‌تر، پایدارتر و بدون وابستگی به سرویس ثالث.',
            'انتقال دامنه از https://firebase-proxy.n95pluss.workers.dev/ به https://amircollider.n95pluss.workers.dev/.'
          ],
          en: [
            'Static files (logos and assets) are now served from internal Cloudflare R2 storage under /assets instead of external Google Drive links — faster, more reliable and free of third-party dependencies.',
            'Domain migrated from https://firebase-proxy.n95pluss.workers.dev/ to https://amircollider.n95pluss.workers.dev/.'
          ],
          ja: [
            '静的ファイル（ロゴ・アセット）を、外部の Google Drive リンクではなく Cloudflare R2 の内部ストレージから /assets 経由で配信。高速・安定し、サードパーティ依存を排除。',
            'ドメインを https://firebase-proxy.n95pluss.workers.dev/ から https://amircollider.n95pluss.workers.dev/ へ移行。'
          ]
        }
      },
      {
        title: { fa: 'امنیت و پایداری', en: 'Security & reliability', ja: 'セキュリティ & 信頼性' },
        items: {
          fa: [
            'پاسخ‌های خطا دیگر پیام داخلی یا stack trace را لو نمی‌دهند؛ تنها یک کد خطای پایدار و عمومی بازگردانده می‌شود.',
            'صفحه‌ی خطای محلی‌شده و تم‌آگاه (fa/en/ja) جایگزین صفحه‌ی تنها-فارسی شد.',
            'فریز عمیق (deep-freeze) درخت پیکربندی برای جلوگیری از تغییر در زمان اجرا.',
            'حذف هدر منسوخ X-XSS-Protection.'
          ],
          en: [
            'Error responses no longer leak internal messages or stack traces; only a stable, generic error code is returned.',
            'A localized, theme-aware error page (fa/en/ja) replaces the Persian-only one.',
            'The configuration tree is deep-frozen to prevent runtime mutation.',
            'Removed the deprecated X-XSS-Protection header.'
          ],
          ja: [
            'エラー応答が内部メッセージやスタックトレースを漏らさないよう変更。安定した汎用エラーコードのみを返却。',
            'ペルシャ語のみのエラーページを、ローカライズ済みでテーマ対応（fa/en/ja）のページに置換。',
            '設定ツリーをディープフリーズし、実行時の変更を防止。',
            '非推奨の X-XSS-Protection ヘッダーを削除。'
          ]
        }
      },
      {
        title: { fa: 'پاک‌سازی و ساده‌سازی', en: 'Cleanup & simplification', ja: 'クリーンアップ & 簡素化' },
        items: {
          fa: [
            'حذف محدودیت نرخ درخواست درون‌حافظه‌ای per-IP (ثابت‌های rate limit و تابع isRateLimited).',
            'حذف ثابت‌های بلااستفاده‌ی retry و حجم درخواست (MAX_RETRIES، RETRY_DELAY_MS، MAX_REQUEST_SIZE).',
            'تبدیل validateGameId به تابع خالص بدون خروجی لاگ.',
            'حذف وابستگی آواتارهای جدول امتیازات به via.placeholder.com.'
          ],
          en: [
            'Removed in-memory per-IP rate limiting (the rate-limit constants and the isRateLimited function).',
            'Removed unused retry and request-size constants (MAX_RETRIES, RETRY_DELAY_MS, MAX_REQUEST_SIZE).',
            'validateGameId is now a pure function with no console output.',
            'Leaderboard avatars no longer depend on via.placeholder.com.'
          ],
          ja: [
            'メモリ内の IP 単位レート制限（rate-limit 定数と isRateLimited 関数）を削除。',
            '未使用のリトライ・リクエストサイズ定数（MAX_RETRIES、RETRY_DELAY_MS、MAX_REQUEST_SIZE）を削除。',
            'validateGameId をログ出力のない純粋関数に変更。',
            'リーダーボードのアバターが via.placeholder.com に依存しないよう変更。'
          ]
        }
      },
      {
        title: { fa: 'دسترس‌پذیری', en: 'Accessibility', ja: 'アクセシビリティ' },
        items: {
          fa: [
            'رعایت prefers-reduced-motion در همه‌ی صفحات.',
            'افزودن خطوط فوکوس (focus-visible) و برچسب‌ها و نقش‌های ARIA به کنترل‌ها.'
          ],
          en: [
            'prefers-reduced-motion is honored across all pages.',
            'Added focus-visible outlines and ARIA labels/roles to controls.'
          ],
          ja: [
            '全ページで prefers-reduced-motion を尊重。',
            'コントロールに focus-visible のアウトラインと ARIA ラベル/ロールを追加。'
          ]
        }
      },
      {
        title: { fa: 'صفحه‌ها و نسخه‌گذاری', en: 'Pages & versioning', ja: 'ページ & バージョン' },
        items: {
          fa: [
            'افزودن همین صفحه‌ی «یادداشت‌های انتشار» به همراه لینک در داشبورد.',
            'تغییر شماره‌ی نسخه از 6.7.3 به 6.7 برای نشان‌دادن بازسازی کامل.'
          ],
          en: [
            'Added this Release notes page, plus a link to it on the dashboard.',
            'Version number changed from 6.7.3 to 6.7 to mark the full rebuild.'
          ],
          ja: [
            'このリリースノートページを追加し、ダッシュボードにリンクを設置。',
            '全面刷新を示すため、バージョン番号を 6.7.3 から 6.7 に変更。'
          ]
        }
      }
    ]
  }
]

// ==========================================
// i18n helpers
// ==========================================
function resolveLang(lang) {
  return RN_I18N[lang] ? lang : DEFAULT_LANG
}

function pack(lang) {
  return RN_I18N[resolveLang(lang)]
}

function dirFor(lang) {
  return resolveLang(lang) === 'fa' ? 'rtl' : 'ltr'
}

function pick(map, lang) {
  if (!map) return ''
  return map[resolveLang(lang)] != null ? map[resolveLang(lang)] : (map[DEFAULT_LANG] || '')
}

// ==========================================
// Request helpers (language & theme resolution)
// ==========================================
function parseCookies(request) {
  const header = request && request.headers ? request.headers.get('Cookie') : ''
  const out = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function langFromAcceptHeader(request) {
  const header = request && request.headers ? request.headers.get('Accept-Language') : ''
  if (!header) return null
  for (const piece of header.toLowerCase().split(',')) {
    const code = piece.split(';')[0].trim().slice(0, 2)
    if (RN_I18N[code]) return code
  }
  return null
}

function resolveRequestLang(url, request, cookies) {
  const fromQuery = url && url.searchParams ? url.searchParams.get('lang') : null
  if (fromQuery && RN_I18N[fromQuery]) return fromQuery
  if (cookies.lang && RN_I18N[cookies.lang]) return cookies.lang
  return langFromAcceptHeader(request) || DEFAULT_LANG
}

function resolveRequestTheme(cookies) {
  return cookies.theme === 'light' || cookies.theme === 'dark' ? cookies.theme : null
}

// ==========================================
// Output-safety helper
// ==========================================
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ==========================================
// SVG icon set (stroke uses currentColor)
// ==========================================
const ICONS = {
  contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor" stroke="none"/>',
  home: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/>'
}

function icon(name, cls) {
  return '<svg class="' + (cls || 'd-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + (ICONS[name] || '') + '</svg>'
}

// ==========================================
// Stylesheet
// Theme via tokens; RTL/LTR via logical properties;
// theme switch animated via the View Transitions API.
// ==========================================
function getReleaseNotesCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }

    /* ==========================================
       Hide scrollbars (scrolling stays functional)
       ========================================== */
    html { scrollbar-width: none; -ms-overflow-style: none; }
    html::-webkit-scrollbar { width: 0; height: 0; display: none; }

    :root {
      --brand: #6c63ff;
      --brand-2: #a78bfa;
      --ok: #4caf50;
      --radius: 18px;
      --maxw: 920px;

      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    @media (prefers-color-scheme: light) {
      :root:not([data-theme]) {
        --bg-1: #f4f6fb;
        --bg-2: #e7ecf7;
        --surface: rgba(255,255,255,0.70);
        --surface-2: #ffffff;
        --border: rgba(20,22,33,0.10);
        --text: rgba(22,24,33,0.92);
        --text-dim: rgba(22,24,33,0.56);
        color-scheme: light;
      }
    }

    :root[data-theme="light"] {
      --bg-1: #f4f6fb;
      --bg-2: #e7ecf7;
      --surface: rgba(255,255,255,0.70);
      --surface-2: #ffffff;
      --border: rgba(20,22,33,0.10);
      --text: rgba(22,24,33,0.92);
      --text-dim: rgba(22,24,33,0.56);
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg-1: #0b0e16;
      --bg-2: #141a2e;
      --surface: rgba(255,255,255,0.045);
      --surface-2: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --text-dim: rgba(255,255,255,0.58);
      color-scheme: dark;
    }

    body {
      font-family: 'Vazirmatn', 'Segoe UI', Tahoma, Arial, sans-serif;
      min-height: 100vh;
      padding: 24px 20px 56px;
      color: var(--text);
      background:
        radial-gradient(1100px 520px at 78% -8%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 60%),
        radial-gradient(900px 480px at 8% 6%, color-mix(in srgb, var(--brand-2) 16%, transparent), transparent 60%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
      background-attachment: fixed;
    }

    .wrap { max-width: var(--maxw); margin: 0 auto; }

    /* ---------- top bar ---------- */
    .topbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; margin-block-end: 28px;
    }
    /* The brand block is a link home. It is the control people
       reach for first on a sub-page - the logo in the corner - and
       until now it was inert here while the dashboard's own header
       had nothing to go back to. */
    .brand {
      display: flex; align-items: center; gap: 14px; min-width: 0;
      text-decoration: none; color: inherit;
      padding: 6px 10px; margin: -6px -10px; border-radius: 14px;
      border: 1px solid transparent;
      transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
    }
    .brand:hover {
      background: var(--surface);
      border-color: var(--border);
      transform: translateY(-1px);
    }
    .brand:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
    .brand-back {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%;
      color: var(--text-dim);
      background: var(--surface); border: 1px solid var(--border);
      opacity: 0; transition: opacity 0.18s ease;
    }
    .brand-back svg { width: 16px; height: 16px; }
    .brand:hover .brand-back, .brand:focus-visible .brand-back { opacity: 1; }
    /* Touch has no hover, so the affordance is simply always on. */
    @media (hover: none) { .brand-back { opacity: 1; } }
    .brand-logo {
      width: 52px; height: 52px; border-radius: 15px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface-2); border: 1px solid var(--border);
      overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    .brand-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .brand-name { font-weight: 800; font-size: 1.05em; letter-spacing: 0.2px; line-height: 1.2; }
    .brand-sub  { font-size: 0.8em; color: var(--text-dim); }

    .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .seg {
      display: inline-flex; padding: 3px; gap: 2px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
    }
    .seg button {
      border: 0; cursor: pointer; padding: 7px 12px; border-radius: 9px;
      font: inherit; font-size: 0.82em; font-weight: 600;
      color: var(--text-dim); background: transparent;
      transition: color 0.18s ease, background 0.18s ease;
    }
    .seg button:hover { color: var(--text); }
    .seg button[aria-pressed="true"] {
      color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 4px 14px color-mix(in srgb, var(--brand) 40%, transparent);
    }
    .icon-btn {
      width: 40px; height: 40px; border-radius: 11px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      color: var(--text); background: var(--surface); border: 1px solid var(--border);
      transition: transform 0.18s ease, background 0.18s ease;
    }
    .icon-btn:hover { transform: translateY(-2px); background: var(--surface-2); }
    .icon-btn:active { transform: scale(0.95); }
    .d-ic { width: 18px; height: 18px; }
    .seg button:focus-visible,
    .icon-btn:focus-visible,
    .back-link:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    /* ---------- hero ---------- */
    .hero { text-align: center; margin: 18px 0 34px; }
    .hero h1 {
      font-size: clamp(2em, 5vw, 3em); font-weight: 800; letter-spacing: 0.3px;
      background: linear-gradient(135deg, var(--text), color-mix(in srgb, var(--brand) 55%, var(--text)));
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .hero p { margin-block-start: 8px; color: var(--text-dim); font-size: 1.02em; }

    /* ---------- releases ---------- */
    .releases { display: flex; flex-direction: column; gap: 20px; margin-block-end: 40px; }
    .release {
      padding: 24px 26px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border);
    }
    .release-head {
      display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
      margin-block-end: 12px;
    }
    .release-ver {
      font-weight: 800; font-size: 1.3em;
      color: color-mix(in srgb, var(--brand) 45%, var(--text));
    }
    .release-date { color: var(--text-dim); font-size: 0.86em; }
    .release-tag {
      margin-inline-start: auto; padding: 4px 12px; border-radius: 20px;
      font-size: 0.74em; font-weight: 700; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    .release-summary {
      color: var(--text-dim); font-size: 0.96em; line-height: 1.7;
      margin-block-end: 18px;
      padding-block-end: 16px; border-block-end: 1px solid var(--border);
    }

    .group { margin-block-start: 18px; }
    .group:first-of-type { margin-block-start: 0; }
    .group-title {
      display: flex; align-items: center; gap: 10px;
      font-weight: 700; font-size: 1.02em; margin-block-end: 10px;
      color: var(--text);
    }
    .group-title::before {
      content: ''; width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
    }
    .group ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .group li {
      position: relative; padding-inline-start: 20px;
      color: var(--text); font-size: 0.93em; line-height: 1.65;
    }
    .group li::before {
      content: ''; position: absolute; inset-inline-start: 3px; top: 0.62em;
      width: 6px; height: 6px; border-radius: 50%;
      background: color-mix(in srgb, var(--brand) 60%, var(--text-dim));
    }

    /* ---------- back link ---------- */
    .nav { display: flex; justify-content: center; margin-block-end: 38px; }
    .back-link {
      display: inline-flex; align-items: center; gap: 9px;
      padding: 11px 20px; border-radius: 13px; text-decoration: none;
      font-weight: 600; font-size: 0.9em; color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand-2));
      box-shadow: 0 8px 22px color-mix(in srgb, var(--brand) 34%, transparent);
      transition: transform 0.18s ease;
    }
    .back-link:hover { transform: translateY(-2px); }
    .back-link svg { width: 18px; height: 18px; }

    /* ---------- footer ---------- */
    footer {
      text-align: center; padding: 28px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border); color: var(--text-dim);
    }
    footer .f-name { color: var(--text); font-weight: 800; font-size: 1.05em; }
    footer .f-meta { margin-block-start: 6px; font-size: 0.85em; }
    footer .f-meta b { color: color-mix(in srgb, var(--brand) 45%, var(--text)); }

    /* ---------- smooth theme transition (light <-> dark) ---------- */
    @media (prefers-reduced-motion: no-preference) {
      body, .seg, .icon-btn, .release, .back-link, footer {
        transition:
          background-color 0.35s ease,
          color 0.35s ease,
          border-color 0.35s ease,
          box-shadow 0.35s ease;
      }
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation-duration: 0.4s;
        animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
      }
      .topbar, .hero, .release, footer { animation: rnRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
      .hero { animation-delay: 0.05s; }
    }
    @keyframes rnRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

    @media (max-width: 480px) {
      .seg button { padding: 6px 9px; }
      .release-tag { margin-inline-start: 0; }
      .release { padding: 20px 18px; }
    }
  `
}

// ==========================================
// Pre-paint theme bootstrap
// Applies the stored theme before first paint to avoid a flash.
// ==========================================
function getThemeBootScript() {
  return `<script>
    (function () {
      try {
        var t = localStorage.getItem('ac_theme');
        if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
      } catch (e) {}
    })();
  </script>`
}

// ==========================================
// Partial: Topbar (brand + language pills + theme toggle)
// ==========================================
function renderTopbar(lang, amirLogo) {
  const p = pack(lang)
  const cur = resolveLang(lang)
  const langs = [['fa', RN_I18N.fa.langName], ['en', RN_I18N.en.langName], ['ja', RN_I18N.ja.langName]]

  const segButtons = langs.map(([code, label]) =>
    '<button type="button" data-lang="' + code + '" aria-pressed="' + (code === cur ? 'true' : 'false') + '"'
    + ' onclick="acSetLang(\'' + code + '\')" lang="' + code + '">' + escapeHtml(label) + '</button>'
  ).join('')

  return `
    <div class="topbar">
      <a class="brand" href="/" title="${escapeHtml(p.backHome)}">
        <span class="brand-logo">
          <img src="${escapeHtml(amirLogo)}" alt="AmirCollider" onerror="this.style.display='none'">
        </span>
        <span>
          <span class="brand-name">AmirCollider</span><br>
          <span class="brand-sub">${escapeHtml(p.subtitle)}</span>
        </span>
        <span class="brand-back" aria-hidden="true">${ICONS.home}</span>
      </a>
      <div class="controls">
        <div class="seg" role="group" aria-label="${escapeHtml(p.langName)}">${segButtons}</div>
        <button type="button" id="themeBtn" class="icon-btn" onclick="acToggleTheme()"
                aria-label="${escapeHtml(p.themeToDark)}">${icon('contrast')}</button>
      </div>
    </div>`
}

// ==========================================
// Partial: Hero
// ==========================================
function renderHero(lang) {
  const p = pack(lang)
  return `
    <div class="hero">
      <h1>${escapeHtml(p.title)}</h1>
      <p>${escapeHtml(p.subtitle)}</p>
    </div>`
}

// ==========================================
// Partial: Release timeline (grouped changelog)
// ==========================================
function renderReleases(lang) {
  const p = pack(lang)
  const cards = RELEASES.map(rel => {
    const tag = rel.tag === 'latest'
      ? '<span class="release-tag">' + escapeHtml(p.latest) + '</span>'
      : ''

    const summary = rel.summary
      ? '<p class="release-summary">' + escapeHtml(pick(rel.summary, lang)) + '</p>'
      : ''

    const groups = (rel.groups || []).map(group => {
      const items = (pick(group.items, lang) || [])
        .map(n => '<li>' + escapeHtml(n) + '</li>').join('')
      return `
        <div class="group">
          <div class="group-title">${escapeHtml(pick(group.title, lang))}</div>
          <ul>${items}</ul>
        </div>`
    }).join('')

    return `
      <article class="release">
        <div class="release-head">
          <span class="release-ver">v${escapeHtml(rel.version)}</span>
          <span class="release-date">${escapeHtml(rel.date)}</span>
          ${tag}
        </div>
        ${summary}
        ${groups}
      </article>`
  }).join('')

  return `<div class="releases">${cards}</div>`
}

// ==========================================
// Partial: Back-to-home navigation
// ==========================================
function renderNav(lang) {
  const p = pack(lang)
  return `
    <div class="nav">
      <a class="back-link" href="/">${icon('home')}<span>${escapeHtml(p.back)}</span></a>
    </div>`
}

// ==========================================
// Partial: Footer
// ==========================================
function renderFooter(lang, version) {
  const p = pack(lang)
  return `
    <footer>
      <div class="f-name">AmirCollider Games</div>
      <div class="f-meta">${escapeHtml(p.footerTagline)}</div>
      <div class="f-meta">${escapeHtml(p.footerPowered)} &middot; <b>v${escapeHtml(version)}</b></div>
    </footer>`
}

// ==========================================
// Client runtime (theme toggle + language switch)
// Theme switch is animated via the View Transitions API.
// ==========================================
function getClientScript() {
  return `<script>
    (function () {
      function acById(id) { return document.getElementById(id); }

      function acApplyThemeLabel() {
        var btn = acById('themeBtn');
        if (!btn) return;
        var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
        btn.setAttribute('aria-label', dark ? 'Light mode' : 'Dark mode');
      }

      function acToggleTheme() {
        var dark = getComputedStyle(document.documentElement).colorScheme.indexOf('dark') !== -1;
        var next = dark ? 'light' : 'dark';
        var commit = function () {
          document.documentElement.setAttribute('data-theme', next);
          acApplyThemeLabel();
        };
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (document.startViewTransition && !reduce) {
          document.startViewTransition(commit);
        } else {
          commit();
        }
        try { localStorage.setItem('ac_theme', next); } catch (e) {}
        document.cookie = 'theme=' + next + ';path=/;max-age=31536000;samesite=lax';
      }
      window.acToggleTheme = acToggleTheme;

      function acSetLang(code) {
        try { localStorage.setItem('ac_lang', code); } catch (e) {}
        document.cookie = 'lang=' + code + ';path=/;max-age=31536000;samesite=lax';
        var u = new URL(window.location.href);
        u.searchParams.set('lang', code);
        window.location.href = u.toString();
      }
      window.acSetLang = acSetLang;

      acApplyThemeLabel();
    })();
  </script>`
}

// ==========================================
// Page: Release Notes
// ==========================================
function createReleaseNotesPage(lang, theme) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const dir = dirFor(resolved)
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title: SITE_NAME, amirLogo })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ${getThemeBootScript()}
  <style>${getReleaseNotesCSS()}</style>
</head>
<body>
  <div class="wrap">
    ${renderTopbar(resolved, amirLogo)}
    ${renderHero(resolved)}
    ${renderReleases(resolved)}
    ${renderNav(resolved)}
    ${renderFooter(resolved, CONFIG.VERSION)}
  </div>
  ${getClientScript()}
</body>
</html>`
}

// ==========================================
// Handler: Release Notes
// ==========================================
export async function handleReleaseNotes(url, request, gameId, requestId, GAMES, _env, availableEndpoints = []) {
  const cookies = parseCookies(request)
  const lang = resolveRequestLang(url, request, cookies)
  const theme = resolveRequestTheme(cookies)

  const headers = {}
  const requestedLang = url && url.searchParams ? url.searchParams.get('lang') : null
  if (requestedLang && RN_I18N[requestedLang]) {
    headers['Set-Cookie'] = `lang=${requestedLang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
  }

  return createHtmlResponse(createReleaseNotesPage(lang, theme), 200, headers)
}
