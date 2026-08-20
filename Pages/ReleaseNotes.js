// ==========================================
// Pages/ReleaseNotes.js
// Release Notes Page Handler
// AmirCollider Games - Worker Proxy


// ==========================================
// Responsibilities
//   - Render the public Release Notes page: topbar, hero and a grouped
//     version changelog. Theme-aware (light/dark/auto) and tri-lingual
//     (fa/en/ja) with correct RTL/LTR, matching the dashboard chrome.
//
// Integration contract (do not break without updating callers)
//   - Public entry: handleReleaseNotes(url, request, gameId, requestId,
//                                      GAMES, env, availableEndpoints)
//   - Route: GET /release-notes  (registered in Worker.js ROUTES)
//
// Extending
//   - Add a release:  prepend one entry to RELEASES below.
//   - Add a group:    push one object into release.groups.
//   - Add a language:  add one entry to RN_I18N and fill every group.
// ==========================================

import { CONFIG } from '../Config.js'
import { getPageHead } from '../Core/DesignSystem.js'
import { createHtmlResponse } from '../Core/Http.js'
import { escapeHtml } from '../Core/Html.js'
import { themeBootScript } from '../Core/PageChrome.js'
import { seoHead, breadcrumbLd, keywordList } from '../Core/Seo.js'
import {
  siteNavCss, siteHeader, siteBreadcrumb, siteFooter, siteBackToTop, siteChromeScript, NAV_I18N
} from '../Core/SiteNav.js'
import { dirFor, langCookieHeader, parseCookies, resolveLang, resolveRequestLang, resolveRequestTheme } from '../Core/RequestContext.js'


const DEFAULT_LANG = 'fa'


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

    // The meta description, and NOT footerTagline - which is what
    // it used to be. That line says the site is an OAuth proxy:
    // true of one subsystem, years out of date as a summary, and
    // on this page it described neither the site nor the page. A
    // search result for "AmirCollider release notes" read "OAuth
    // proxy for AmirCollider games", which answers nobody.
    metaDesc: 'تاریخچه‌ی کامل تغییرات AmirCollider — هر نسخه‌ی سایت و سرویس‌هایش، با تاریخ و فهرست چیزهایی که اضافه، اصلاح یا حذف شده است.',
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
    metaDesc: 'The full changelog for AmirCollider — every release of the site and its services, dated, with what was added, fixed or removed in each one.',
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
    metaDesc: 'AmirCollider の変更履歴。サイトと各サービスのリリースごとに、日付と、追加・修正・削除された内容の一覧をまとめています。',
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
    version: '6.8.0',
    date: '2026-08-07',
    tag: 'latest',
    summary: {
      fa: 'زبان از داخل «؟» به داخل مسیر آدرس منتقل شد، و همین یک تغییر بود که باعث می‌شد سایت فقط به فارسی ایندکس شود. به‌علاوه: آیکون سایت که دیگر داخل دایره‌ی نتایج گوگل بریده نمی‌شود، یک پاراگراف واقعی روی صفحه‌ی اصلی، لینک شبکه‌های اجتماعی، و یک صفحه‌ی حمایت مالی.',
      en: 'The language moved out of the query string and into the URL path — the one change that was keeping this site indexed in Persian only. Plus: a site icon that no longer gets cropped inside Google’s circle, a real paragraph on the front page, social links, and a donation page.',
      ja: '言語がクエリ文字列から URL のパスへ移りました。これがこのサイトをペルシャ語だけでインデックスさせていた原因でした。ほかに、Google の円形の枠で切り取られなくなったサイトアイコン、トップページの本文段落、SNS リンク、支援ページを追加しました。'
    },
    groups: [
      {
        title: { fa: 'زبان، در مسیر آدرس', en: 'The language, in the path', ja: '言語を URL パスへ' },
        items: {
          fa: [
            'هر زبان حالا آدرس خودش را دارد: «/about» فارسی، «/en/about» انگلیسی و «/ja/about» ژاپنی. زبان پیش‌فرض (فارسی) بدون پیشوند می‌ماند.',
            'چرا مهم بود: قبلاً هر چهار آدرس «/»، «/?lang=fa»، «/?lang=en» و «/?lang=ja» همگی «/» را به‌عنوان canonical معرفی می‌کردند. گوگل خوشه‌ای از آدرس‌ها را که همه به یکی برمی‌گردند دور می‌ریزد و فقط همان یکی را نگه می‌دارد — یعنی کل سایت فقط یک آدرس قابل ایندکس داشت.',
            'و زبان آن یک آدرس را هدر Accept-Language تعیین می‌کرد. Googlebot این هدر را نمی‌فرستد، و زبان پیش‌فرض فارسی است — پس هر صفحه‌ای که گوگل تا امروز از این سایت دیده، نسخه‌ی فارسی بوده. این دلیل اصلی «سایت با آی‌پی خارجی پیدا نمی‌شود» بود.',
            'همه‌ی آدرس‌های قدیمی زنده‌اند: «/about?lang=en» با ۳۰۱ به «/en/about» می‌رود، پس اعتبار لینک‌هایی که تا حالا به اشتراک گذاشته شده از دست نمی‌رود.',
            'لینک‌های داخلی هر صفحه هم‌زبانِ خودش شدند — منو، فوتر، مسیر صفحه، کارت بازی‌ها و کارت ابزارها. قبلاً خواننده‌ی صفحه‌ی انگلیسی با اولین کلیک به فارسی می‌افتاد و خزنده هم هیچ صفحه‌ی انگلیسی‌ای برای دنبال کردن پیدا نمی‌کرد.',
            'sitemap.xml حالا هر صفحه را در هر سه زبان فهرست می‌کند (۴۸ آدرس به‌جای ۱۶) و هر کدام مجموعه‌ی کامل alternate را دارند.',
            'صفحه‌های پرداخت و پنل‌ها عمداً دست‌نخورده ماندند: ارائه‌دهنده‌ی پرداخت آدرس بازگشت را برای تمام عمر فاکتور نگه می‌دارد و این صفحه‌ها هم noindex هستند.'
          ],
          en: [
            'Every language has its own address now: /about is Persian, /en/about is English, /ja/about is Japanese. The default language keeps the bare path.',
            'Why it mattered: /, /?lang=fa, /?lang=en and /?lang=ja all declared / as their canonical. Google resolves a cluster whose members all point at one member by keeping that one and discarding the annotations — so the site had exactly one indexable address per page.',
            'And the language of that one address was decided by Accept-Language. Googlebot sends no Accept-Language header, and the default is Persian — so every page Google has ever indexed of this site is the Persian one. That is most of what "searching the brand from abroad finds nothing" was made of.',
            'Every old address still works: /about?lang=en is a 301 to /en/about, so the authority carried by links already shared moves to the new address instead of being stranded.',
            'Internal links now stay in the language of the page they are on — header, footer, breadcrumbs, game cards and tool cards. A reader on the English front page used to leave it into Persian on the first click, and a crawler reading that page found no English pages to follow at all.',
            'sitemap.xml lists every page in all three languages (48 URLs, up from 16), each carrying the full reciprocal set of alternates.',
            'The checkout and the operator panels were deliberately left alone: the payment provider holds a return URL for the life of an invoice, and those pages are noindex anyway.'
          ],
          ja: [
            '各言語が独自のアドレスを持つようになりました。/about はペルシャ語、/en/about は英語、/ja/about は日本語です。既定の言語はプレフィックスなしのままです。',
            '重要だった理由：/、/?lang=fa、/?lang=en、/?lang=ja のすべてが / を canonical として宣言していました。すべてが 1 つを指すクラスターを Google はその 1 つだけ残して解決するため、サイトはページごとに 1 つしかインデックス可能なアドレスを持っていませんでした。',
            'そしてその 1 つのアドレスの言語は Accept-Language が決めていました。Googlebot はこのヘッダーを送らず、既定はペルシャ語です。つまり Google がこれまでインデックスしたのはすべてペルシャ語版でした。',
            '古いアドレスはすべて生きています。/about?lang=en は /en/about へ 301 リダイレクトするので、共有済みのリンクの評価は新しいアドレスへ移ります。',
            '内部リンクはページの言語に追従するようになりました（ヘッダー、フッター、パンくず、ゲームカード、ツールカード）。以前は英語のトップページから最初のクリックでペルシャ語に移ってしまい、クローラーは辿れる英語ページを見つけられませんでした。',
            'sitemap.xml は全ページを 3 言語分（16 件から 48 件に）列挙し、それぞれが完全な相互 alternate を持ちます。',
            '決済ページと運用パネルは意図的にそのままです。決済プロバイダーは請求書の有効期間中ずっと戻り先 URL を保持しますし、これらは元々 noindex です。'
          ]
        }
      },
      {
        title: { fa: 'آیکون سایت', en: 'The site icon', ja: 'サイトアイコン' },
        items: {
          fa: [
            'گوگل آیکون سایت را داخل یک دایره نشان می‌دهد. لوگو یک مربع است که پس‌زمینه‌اش تا لبه‌ها رنگ شده، پس نتیجه یک مربع کوچک وسط یک دایره بود — دو شکل که با هم نمی‌خوانند.',
            'حالا رنگ پس‌زمینه (CONFIG.ICON_BG) اول روی کل بوم کشیده می‌شود و لوگو داخل ۷۰٪ میانی می‌نشیند؛ چیزی که دایره می‌برد فقط یک حلقه‌ی رنگ یکدست است.',
            'مسیر /favicon.ico اضافه شد. مرورگر این آدرس را چه سند لینکش بدهد چه ندهد درخواست می‌کند و تا امروز صفحه‌ی ۴۰۴ را می‌گرفت — یک سند HTML آن‌جا که تصویر انتظار می‌رفت، که خودش به‌تنهایی برای خالی ماندن آیکون تب کافی است.',
            'یک /site.webmanifest هم اضافه شد، با آیکون maskable برای لانچرهای اندروید.'
          ],
          en: [
            'Google draws a favicon inside a circle. The logo is a square that paints its background to its own edges, so what came back was a small square sitting inside a ring — two shapes disagreeing.',
            'The backdrop colour (CONFIG.ICON_BG) is now painted across the whole icon canvas first and the artwork placed inside the middle 70%, so a circular crop takes nothing but a ring of solid colour.',
            'A /favicon.ico route was added. A browser asks for that address whether the document links to an icon or not, and until now it got the 404 page — an HTML document served where an image was expected, which is enough on its own to leave a tab blank.',
            'A /site.webmanifest was added too, with a maskable icon for Android launchers.'
          ],
          ja: [
            'Google はファビコンを円の中に描画します。ロゴは背景を端まで塗った正方形なので、輪の中に小さな四角が浮く見た目になっていました。',
            '背景色（CONFIG.ICON_BG）をアイコン全体に先に塗り、その中央 70% にロゴを配置するようにしました。円形に切り取られるのは単色の縁だけです。',
            '/favicon.ico のルートを追加しました。ブラウザーは文書のリンク有無に関わらずこのアドレスを要求しますが、これまでは 404 ページ（画像が期待される場所に HTML）が返っていました。これだけでもタブのアイコンが空になる原因になります。',
            'Android ランチャー向けの maskable アイコンを含む /site.webmanifest も追加しました。'
          ]
        }
      },
      {
        title: { fa: 'متن، لینک‌ها و حمایت', en: 'Words, links and support', ja: '文章・リンク・支援' },
        items: {
          fa: [
            'صفحه‌ی اصلی حالا یک پاراگراف واقعی دارد. گوگل به‌جای متای صفحه، چیپ‌های کارت بازی را به‌عنوان توضیح سایت نشان می‌داد («قابل بازی بدون اینترنت ورود با گوگل ذخیره‌ی ابری…») چون تنها متن پیوسته‌ی صفحه همان‌ها بودند.',
            'لینک گیت‌هاب، یوتیوب، اینستاگرام و توییتر (X) در فوتر همه‌ی صفحه‌ها و در صفحه‌ی «درباره‌ی من»، با rel="me" و در فهرست sameAs داده‌ی ساختاریافته.',
            'صفحه‌ی جدید «حمایت مالی» در /donate: مبلغ دلخواه، پرداخت با ارز دیجیتال، بدون ثبت‌نام. چیزی تحویل داده نمی‌شود و چیزی هم پشتش قفل نیست — و سایت هیچ اطلاعاتی از آن ذخیره نمی‌کند.',
            'در صفحه‌ی «درباره‌ی من» توضیح داده شد که AmirCollider و Amir Collider یک نفرند؛ نصف کسانی که دنبال این اسم می‌گردند آن را با فاصله می‌نویسند.'
          ],
          en: [
            'The front page has a real paragraph now. Google was showing the game card\u2019s capability chips as the site\u2019s description ("Plays offline Google sign-in Cloud save\u2026") rather than the meta description, because those chips were the only continuous text on the page.',
            'GitHub, YouTube, Instagram and X links in the footer of every page and on the About page, carrying rel="me" and listed in the sameAs structured data.',
            'A new donation page at /donate: any amount, paid in cryptocurrency, no sign-up. Nothing is delivered and nothing is locked behind it — and the site stores nothing about it.',
            'The About page now says in words that AmirCollider and Amir Collider are the same person; roughly half the people looking for the name type it as two words.'
          ],
          ja: [
            'トップページに本文の段落を追加しました。ページ上で連続した文章がゲームカードのチップだけだったため、Google は meta description ではなくそれらを説明文として表示していました。',
            'GitHub・YouTube・Instagram・X へのリンクを全ページのフッターと自己紹介ページに追加しました（rel="me" 付き、構造化データの sameAs にも記載）。',
            '/donate に支援ページを新設しました。金額は自由、暗号資産で支払い、登録不要です。何も配布されず、何も制限されず、サイトは一切記録しません。',
            '自己紹介ページに、AmirCollider と Amir Collider が同一人物であることを明記しました。この名前を探す人のおよそ半数は二語で入力します。'
          ]
        }
      }
    ]
  },
  {
    version: '6.7.4',
    date: '2026-08-05',
    summary: {
      fa: 'سایت از چند صفحه‌ی جدا به یک سایت واحد تبدیل شد: هدر و فوتر مشترک روی همه‌ی صفحه‌ها، جدول امتیازات به بازی خودش وصل شد، صفحه‌ی ۴۰۴ واقعی، و آماده‌سازی کامل برای Google Search Console و Google Cloud Console.',
      en: 'The site stopped being a set of separate pages: one shared header and footer everywhere, the leaderboard reconnected to its game, a real 404 page, and a full SEO pass for Google Search Console and Google Cloud Console.',
      ja: '個別のページの寄せ集めから 1 つのサイトへ：全ページ共通のヘッダーとフッター、ゲームに接続されたリーダーボード、本物の 404 ページ、Google Search Console と Google Cloud Console 向けの SEO 対応。'
    },
    groups: [
      {
        title: { fa: 'ناوبری یکپارچه', en: 'One navigation surface', ja: '統一されたナビゲーション' },
        items: {
          fa: [
            'هدر مشترک روی همه‌ی صفحه‌ها: لوگو (لینک به خانه)، خانه، بازی‌ها، ابزارها، Unity DocSnap و Unity DirectTMP، به‌همراه انتخاب زبان و تم در یک جای ثابت. بدون پس‌زمینه و بدون چسبیدن به بالای صفحه — مثل هدر صفحه‌های محصول.',
            'فوتر کامل با چهار ستون روی همه‌ی صفحه‌ها؛ حریم خصوصی، شرایط استفاده، پیگیری سفارش و پشتیبانی همیشه یک کلیک فاصله دارند.',
            'مسیر صفحه (breadcrumb) روی صفحه‌های داخلی، هم برای کاربر و هم به‌صورت داده‌ی ساختاریافته برای گوگل.',
            'صفحه‌ی /tools دیگر بن‌بست نیست: نشان برند لینک خانه شد و هدر و فوتر مشترک گرفت. همین برای Unity DirectTMP و صفحه‌ی پرداخت هم انجام شد.',
            'صفحه‌ی ۴۰۴ واقعی با ناوبری کامل؛ پیش از این یک بدنه‌ی JSON بود. کلاینت‌هایی که JSON می‌خواهند دقیقاً همان پاسخ قبلی را می‌گیرند.',
            'دکمه‌ی «بازگشت به بالای صفحه» در گوشه‌ی پایین سمت راست همه‌ی صفحه‌ها، که بعد از کمی اسکرول ظاهر می‌شود.',
            'صفحه‌های /privacy و /terms دیگر بازی‌ای را که انتخاب نشده نشان نمی‌دهند: به‌جای لوگو و نام Neon Katana، از DefaultGameLogo و عنوان «همه‌ی بازی‌ها و ابزارها» استفاده می‌کنند.',
            'قابلیت‌های روی کارت بازی (ورود با گوگل، ذخیره‌ی ابری، جدول امتیازات، خرید درون‌برنامه‌ای) حالا واقعاً لینک‌اند و به صفحه‌ی خودشان می‌روند.',
            'در صفحه‌های حریم خصوصی و شرایط استفاده، لوگوی AmirCollider که کنار لوگوی بازی می‌نشیند دایره‌ای شد — قبلاً لبه‌های مربعی تصویر از داخل قاب گرد بیرون می‌زد. لوگوی هدر و فوتر مربع با گوشه‌های گرد ماند و بزرگ‌تر شد تا خواناتر باشد.'
          ],
          en: [
            'A shared header on every page: the logo (a link home), Home, Games, Tools, Unity DocSnap and Unity DirectTMP, with the language and theme controls always in the same corner. No surface of its own and not sticky, matching the product pages.',
            'A four-column footer on every page, so privacy, terms, order help and support are one click away from anywhere.',
            'Breadcrumbs on inner pages, both for readers and as BreadcrumbList structured data.',
            '/tools is no longer a dead end: its brand mark is a link home and it carries the shared header and footer. The same was done for Unity DirectTMP and the checkout.',
            'A real 404 page with full navigation, where there used to be a JSON body. Clients that ask for JSON still get exactly the response they got before.',
            'A back-to-top button in the bottom-right corner of every page, appearing once there is something to scroll back from.',
            '/privacy and /terms no longer show a game nobody chose: they use DefaultGameLogo and the heading "All games & tools" instead of Neon Katana\'s mark and name.',
            'The capability chips on a game card (Google sign-in, cloud save, leaderboard, in-app purchases) are real links now and open the page they name.',
            'On the privacy and terms pages, the AmirCollider mark that sits beside the game\'s logo is round - its square edges used to show through the round frame. The header and footer marks stay rounded squares, and are larger now so they can actually be read.'
          ],
          ja: [
            '全ページ共通のヘッダー：ロゴ（ホームへのリンク）、ホーム、ゲーム、ツール、Unity DocSnap、Unity DirectTMP。言語とテーマの切り替えは常に同じ位置に。背景を持たず固定もしない、製品ページと同じ形です。',
            '全ページに 4 列のフッター。プライバシー、利用規約、注文サポート、サポートへどこからでも 1 クリックで到達できます。',
            '下層ページにパンくずリストを追加。読者向けの表示と BreadcrumbList 構造化データの両方。',
            '/tools は行き止まりではなくなりました。ブランドマークがホームへのリンクになり、共通ヘッダーとフッターを持ちます。Unity DirectTMP と決済ページも同様です。',
            'JSON の本文だった 404 が、ナビゲーション付きの本物のページになりました。JSON を要求するクライアントには従来どおりの応答を返します。',
            '全ページの右下に「ページ上部へ戻る」ボタンを追加。少しスクロールすると表示されます。',
            '/privacy と /terms は選ばれていないゲームを表示しなくなりました。Neon Katana のロゴと名前ではなく、DefaultGameLogo と「すべてのゲームとツール」を使います。',
            'ゲームカードの機能チップ（Google サインイン、クラウドセーブ、ランキング、アプリ内購入）が実際のリンクになり、対応するページを開きます。',
            'プライバシーと利用規約のページで、ゲームのロゴの隣に並ぶ AmirCollider マークを円形にしました（従来は四角い縁が丸い枠から見えていました）。ヘッダーとフッターのマークは角丸の四角のままで、読み取りやすいよう大きくしました。'
          ]
        }
      },
      {
        title: { fa: 'جدول امتیازات', en: 'Leaderboard', ja: 'リーダーボード' },
        items: {
          fa: [
            'جدول امتیازات حالا یکی از صفحه‌های خودِ بازی است: رنگ اختصاصی بازی، نوار ناوبری بازی (صفحه‌ی بازی، حساب، فروشگاه، نسخه‌ها، دانلود) و بازگشت مستقیم به بازی.',
            'بازیکنان با امتیاز صفر دیگر نمایش داده نمی‌شوند؛ هم در جدول و هم در شمارش «بازیکنان دارای امتیاز».',
            'عدد «مجموع» دیگر تکرار تعداد ردیف‌های نمایش‌داده‌شده نیست و شمارش واقعی کل بازیکنان رتبه‌بندی‌شده است.',
            'تصویر پیش‌فرض بازیکنان بدون عکس، به‌جای درخواست به سرویس بیرونی placehold.co، به‌صورت محلی ساخته می‌شود.',
            'اگر پایگاه داده در دسترس نباشد، مرورگر یک صفحه‌ی قابل‌فهم می‌بیند نه یک متن JSON.'
          ],
          en: [
            'The leaderboard is now one of its game\'s own pages: the game\'s accent colour, the game\'s navigation (game page, account, store, versions, download) and a direct route back to the game.',
            'Players with a score of zero no longer appear, neither in the table nor in the "ranked players" count.',
            'The "total" figure is no longer a copy of the number of rows shown; it is a real count of every ranked player.',
            'The fallback avatar for a player with no photo is generated locally instead of fetched from placehold.co.',
            'When the database cannot be read, a browser gets a page it can understand rather than a JSON body.'
          ],
          ja: [
            'リーダーボードはゲーム自身のページになりました：ゲームのアクセントカラー、ゲームのナビゲーション（ゲームページ、アカウント、ストア、バージョン、ダウンロード）、ゲームへ戻る導線。',
            'スコアが 0 のプレイヤーは表にも「ランク入りプレイヤー」の集計にも表示されなくなりました。',
            '「合計」の数値は表示行数のコピーではなく、ランク入りプレイヤー全体の実数になりました。',
            '写真のないプレイヤーの代替アバターは placehold.co ではなくローカルで生成されます。',
            'データベースを読めない場合、ブラウザには JSON ではなく理解できるページが表示されます。'
          ]
        }
      },
      {
        title: { fa: 'SEO و آماده‌سازی برای گوگل', en: 'SEO and Google readiness', ja: 'SEO と Google 対応' },
        items: {
          fa: [
            'آدرس رسمی سایت به amircollider.com تغییر کرد. پیش از این تگ‌های canonical به دامنه‌ی workers.dev اشاره می‌کردند؛ یعنی به گوگل گفته می‌شد نسخه‌ی اصلی جای دیگری است.',
            'درخواست‌های صفحه روی دامنه‌های دیگر با ۳۰۱ به دامنه‌ی رسمی منتقل می‌شوند. مسیرهای API از این قاعده مستثنا هستند تا کلاینت‌های منتشرشده دست‌نخورده بمانند.',
            'sitemap.xml و robots.txt اضافه شدند؛ نقشه‌ی سایت از روی همان رجیستری‌ای ساخته می‌شود که صفحه‌ها از آن می‌آیند.',
            'روی هر صفحه: canonical، hreflang برای هر سه زبان، توضیحات متا، OpenGraph و Twitter Card.',
            'داده‌ی ساختاریافته: Organization، WebSite، VideoGame برای هر بازی و SoftwareApplication برای هر ابزار.',
            'صفحه‌های تشخیصی و مسیرهای پرداخت با noindex علامت خوردند تا اعتبار صفحه‌های اصلی را نگیرند.',
            'عنوان و توضیح صفحه‌ی اصلی از «پروکسی OAuth» به نام و کار واقعی برند تغییر کرد.'
          ],
          en: [
            'The canonical address is now amircollider.com. Canonical tags used to point at the workers.dev hostname, which told search engines the real site was somewhere else.',
            'Page requests on any other hostname are redirected with a 301. API paths are exempt, so shipped clients are untouched.',
            'sitemap.xml and robots.txt were added; the sitemap is generated from the same registry the pages render from.',
            'On every page: canonical, hreflang for all three languages, a meta description, OpenGraph and Twitter Card tags.',
            'Structured data: Organization, WebSite, a VideoGame node per game and a SoftwareApplication node per tool.',
            'Diagnostic pages and checkout steps are marked noindex so they cannot take authority from the pages that matter.',
            'The landing page title and description changed from "OAuth proxy" to what the brand is and does.'
          ],
          ja: [
            '正規のアドレスを amircollider.com に変更しました。従来 canonical は workers.dev を指しており、検索エンジンに「本体は別の場所」と伝えていました。',
            '他のホスト名へのページ要求は 301 で正規ドメインへ転送されます。API パスは対象外なので、公開済みクライアントに影響はありません。',
            'sitemap.xml と robots.txt を追加。サイトマップはページと同じレジストリから生成されます。',
            '全ページに canonical、3 言語分の hreflang、meta description、OpenGraph、Twitter Card を付与。',
            '構造化データ：Organization、WebSite、ゲームごとの VideoGame、ツールごとの SoftwareApplication。',
            '診断ページと決済ステップは noindex に。重要なページの評価を奪わないためです。',
            'トップページのタイトルと説明を「OAuth プロキシ」からブランドの実態に合わせて書き換えました。'
          ]
        }
      },
      {
        title: { fa: 'حریم خصوصی و امنیت', en: 'Privacy and security', ja: 'プライバシーとセキュリティ' },
        items: {
          fa: [
            'بخش «داده‌های حساب گوگل» به سیاست حریم خصوصی اضافه شد: فهرست دقیق scope‌های درخواستی و بیانیه‌ی Limited Use مطابق Google API Services User Data Policy.',
            'بخش «حذف حساب و داده‌ها» با روش درخواست و مهلت ۳۰ روزه اضافه شد — یکی از شرط‌های تأیید OAuth.',
            'صفحه‌های /privacy و /terms در سطح سایت اضافه شدند تا آدرسی ثابت برای Google Cloud Console و Play Console وجود داشته باشد. صفحه‌های هر بازی هم مثل قبل کار می‌کنند.',
            'یک Content-Security-Policy روی همه‌ی پاسخ‌ها: بدون افزونه، بدون قاب‌شدن، و فرم‌هایی که فقط به همین دامنه ارسال می‌شوند.'
          ],
          en: [
            'A "Google account data" section was added to the privacy policy: the exact scopes requested and the Limited Use statement the Google API Services User Data Policy asks for.',
            'An "account and data deletion" section with the request route and a 30-day commitment - one of the conditions of OAuth verification.',
            'Site-level /privacy and /terms pages, so Google Cloud Console and Play Console have a stable address to be given. The per-game pages still answer as before.',
            'A Content-Security-Policy on every response: no plugins, no framing, and forms that can only post back here.'
          ],
          ja: [
            'プライバシーポリシーに「Google アカウントデータ」の節を追加：要求するスコープの明示と、Google API サービスのユーザーデータに関するポリシーが求める限定的な使用の記載。',
            '「アカウントとデータの削除」の節を追加。申請方法と 30 日以内の対応を明記 — OAuth 審査の要件のひとつです。',
            'サイト全体の /privacy と /terms を追加し、Google Cloud Console と Play Console に渡せる固定アドレスを用意しました。ゲームごとのページも従来どおり動作します。',
            '全応答に Content-Security-Policy を追加：プラグインなし、フレーム埋め込みなし、フォームの送信先は自サイトのみ。'
          ]
        }
      },
      {
        title: { fa: 'رفع اشکال', en: 'Fixes', ja: '修正' },
        items: {
          fa: [
            'آدرسی با درصدِ نامعتبر (مثل /%E0%A4%A) دیگر خطای ۵۰۰ نمی‌دهد و مثل هر آدرس ناشناخته‌ی دیگری ۴۰۴ می‌گیرد. همین مشکل در مسیر /assets/ هم برطرف شد.',
            'شناسه‌ی بازی ناشناخته در آدرس (مثل /foo/leaderboard) دیگر بی‌سروصدا صفحه‌ی اولین بازی را نشان نمی‌دهد و ۴۰۴ می‌گیرد.',
            'الگوی مسیرها دیگر نقطه را به‌عنوان «هر کاراکتری» تفسیر نمی‌کند؛ /robots.txt فقط با خودش تطبیق می‌یابد.',
            'نشان برند در صفحه‌ی Unity DirectTMP و در صفحه‌ی پرداخت به خانه لینک شد.'
          ],
          en: [
            'A URL with an invalid percent escape (like /%E0%A4%A) no longer raises a 500; it answers 404 like any other unknown address. The same fix was applied to /assets/.',
            'An unknown game id in a path (like /foo/leaderboard) no longer quietly renders the first registered game; it answers 404.',
            'Route patterns no longer treat a dot as "any character", so /robots.txt matches only itself.',
            'The brand mark on the Unity DirectTMP page and on the checkout is now a link home.'
          ],
          ja: [
            '不正なパーセントエスケープを含む URL（例：/%E0%A4%A）で 500 が発生しなくなり、他の未知のアドレスと同じく 404 を返します。/assets/ も同様に修正しました。',
            'パス内の未知のゲーム ID（例：/foo/leaderboard）が最初のゲームを黙って表示することはなくなり、404 を返します。',
            'ルートパターンがドットを「任意の文字」として扱わなくなり、/robots.txt は自身にのみ一致します。',
            'Unity DirectTMP ページと決済ページのブランドマークをホームへのリンクにしました。'
          ]
        }
      }
    ]
  },
  {
    version: '6.7.3',
    date: '2026-07-31',
    tag: '',
    summary: {
      fa: 'بازسازی کامل کدها بدون هیچ تغییری در رفتار سایت: حذف کدهای تکراری و مرده، ماژول‌بندی دوباره‌ی پروژه، نام‌گذاری یکدست فایل‌ها و کوتاه‌کردن کامنت‌ها.',
      en: 'A full code remaster with no change in behaviour: duplicated and dead code removed, the project re-modularised, file naming made consistent and comments cut back to what earns its place.',
      ja: '動作を一切変えないコードの全面リマスター：重複コードと不要コードの削除、プロジェクトの再モジュール化、ファイル名の統一、コメントの整理。'
    },
    groups: [
      {
        title: { fa: 'حذف کدهای تکراری', en: 'Duplication removed', ja: '重複の削除' },
        items: {
          fa: [
            'لایه‌ی مشترک Core ساخته شد: Html، Http، Logging، RequestContext، PageChrome، DesignSystem، ErrorPage و GoogleOAuth.',
            'توابعی مثل escapeHtml، parseCookies، resolveLang و تشخیص تم که در ۱۰ تا ۱۳ فایل عیناً تکرار شده بودند، حالا یک نسخه بیشتر ندارند.',
            'اسکریپت سوییچ تم و زبان که در هفت صفحه کپی شده بود، به یک ماژول واحد منتقل شد؛ رفتار دکمه‌ها در همه‌ی صفحه‌ها یکسان شد.',
            'ساخت کوکی زبان که در هشت صفحه دستی نوشته شده بود، به langCookieHeader تبدیل شد.'
          ],
          en: [
            'A shared Core layer: Html, Http, Logging, RequestContext, PageChrome, DesignSystem, ErrorPage and GoogleOAuth.',
            'Helpers like escapeHtml, parseCookies, resolveLang and the theme resolver existed verbatim in 10-13 files each; there is now one copy of each.',
            'The theme and language switcher script was copied into seven pages. It now lives in one module, so the controls behave identically everywhere.',
            'The language cookie was hand-built in eight handlers; it is one call to langCookieHeader.'
          ],
          ja: [
            '共通レイヤー Core を追加：Html、Http、Logging、RequestContext、PageChrome、DesignSystem、ErrorPage、GoogleOAuth。',
            'escapeHtml、parseCookies、resolveLang、テーマ解決などは 10〜13 ファイルに全く同じ形で存在していました。今は 1 つだけです。',
            '7 ページにコピーされていたテーマ／言語切り替えスクリプトを 1 モジュールに統合し、全ページで同じ挙動になりました。',
            '8 か所で手書きしていた言語 Cookie は langCookieHeader の 1 呼び出しになりました。'
          ]
        }
      },
      {
        title: { fa: 'ماژول‌بندی دوباره', en: 'Re-modularised', ja: '再モジュール化' },
        items: {
          fa: [
            'فایل ورودی از ۲۱۶۳ خط به حدود ۳۵۰ خط رسید و فقط مسیریابی و اجرای کرون در آن ماند.',
            'پوشه‌ی Api ساخته شد: OAuthApi، AuthApi، PlayerDataApi، AssetApi، GameApi و TheGodApi.',
            'صفحه‌های جریان ورود و صفحه‌ی پروفایل بازیکن به Pages منتقل شدند.',
            'کار با جدول بازیکن‌ها (اعتبارسنجی نام، ادغام داده، مسدودسازی) در Games/PlayerRecord جمع شد.',
            'فایل utils.js حذف شد؛ محتوایش به ماژول‌های Core با نام روشن تقسیم شد.'
          ],
          en: [
            'The entry file went from 2,163 lines to about 350 and now holds routing and the cron, nothing else.',
            'A new Api layer: OAuthApi, AuthApi, PlayerDataApi, AssetApi, GameApi and TheGodApi.',
            'The sign-in flow pages and the player profile page moved into Pages.',
            'Everything about the players table — name rules, document merge, moderation — is now Games/PlayerRecord.',
            'utils.js is gone; its contents were split into Core modules that say what they hold.'
          ],
          ja: [
            'エントリーファイルは 2,163 行から約 350 行になり、ルーティングと cron だけになりました。',
            'Api 層を新設：OAuthApi、AuthApi、PlayerDataApi、AssetApi、GameApi、TheGodApi。',
            'サインインフローのページとプレイヤープロフィールページを Pages に移動。',
            'players テーブルに関する処理（名前規則、ドキュメントのマージ、モデレーション）を Games/PlayerRecord に集約。',
            'utils.js を廃止し、内容を役割の分かる Core モジュールに分割しました。'
          ]
        }
      },
      {
        title: { fa: 'کدهای مرده و نام‌گذاری', en: 'Dead code and naming', ja: '不要コードと命名' },
        items: {
          fa: [
            'توابع و ثابت‌هایی که هیچ‌جا صدا زده نمی‌شدند حذف شدند: toolFor، toolById، csharpName تکراری، catalogueSummary، renderHighlights و یک شاخه‌ی خطای غیرقابل‌دسترس.',
            'ایمپورت‌های بی‌استفاده و پارامترهای بی‌استفاده‌ی هندلرها پاک شدند.',
            'همه‌ی فایل‌ها و پوشه‌ها به قاعده‌ی Word1Word2Word3 درآمدند؛ shared-styles.js شد Core/DesignSystem.js و GAMES.md شد Docs/Games.md.',
            'پوشه‌ی migrations و assets عمداً دست‌نخورده ماند: نام فایل‌های مهاجرت را D1 دنبال می‌کند و آدرس تصویرها بیرون از این مخزن استفاده شده است.'
          ],
          en: [
            'Symbols nothing called are gone: toolFor, toolById, a duplicated csharpName, catalogueSummary, renderHighlights and an unreachable error branch.',
            'Unused imports and unused handler parameters were removed.',
            'Every file and folder now follows Word1Word2Word3: shared-styles.js became Core/DesignSystem.js, GAMES.md became Docs/Games.md.',
            'migrations/ and assets/ were deliberately left alone: D1 tracks migration filenames, and the image URLs are linked from outside this repository.'
          ],
          ja: [
            '呼び出されていないシンボルを削除：toolFor、toolById、重複した csharpName、catalogueSummary、renderHighlights、到達しないエラー分岐。',
            '未使用のインポートとハンドラーの未使用引数を削除。',
            'すべてのファイルとフォルダーを Word1Word2Word3 形式に統一：shared-styles.js は Core/DesignSystem.js、GAMES.md は Docs/Games.md へ。',
            'migrations/ と assets/ は意図的に据え置き：D1 が移行ファイル名を追跡しており、画像 URL はこのリポジトリの外から参照されているためです。'
          ]
        }
      },
      {
        title: { fa: 'مستندات', en: 'Documentation', ja: 'ドキュメント' },
        items: {
          fa: [
            'README مخزن بازنویسی شد و حالا معماری، مسیرها و نحوه‌ی راه‌اندازی پروژه را توضیح می‌دهد.',
            'کامنت‌های داستانی کوتاه شدند؛ فقط دلیل‌هایی ماند که از خود کد خوانده نمی‌شود.',
            'CHECKOUT.md، GAMES.md و LICENSING.md به پوشه‌ی Docs منتقل شدند.'
          ],
          en: [
            'The repository README was rewritten and now explains the architecture, the routes and how to run the project.',
            'Essay-length comments were cut back to the reasons the code itself cannot show.',
            'CHECKOUT.md, GAMES.md and LICENSING.md moved into Docs/.'
          ],
          ja: [
            'リポジトリの README を書き直し、アーキテクチャ、ルート、実行方法を説明するようにしました。',
            '長すぎるコメントを整理し、コードからは読み取れない理由だけを残しました。',
            'CHECKOUT.md、GAMES.md、LICENSING.md を Docs/ に移動しました。'
          ]
        }
      }
    ]
  },
  {
    version: '6.7.2',
    date: '2026-07-31',
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


function pack(lang) {
  return RN_I18N[resolveLang(lang)]
}


function pick(map, lang) {
  if (!map) return ''
  return map[resolveLang(lang)] != null ? map[resolveLang(lang)] : (map[DEFAULT_LANG] || '')
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

    /* The header spans the body's full width and puts the body's
       own gutter back inside itself, so its contents stay aligned. */
    .ac-nav { margin: -24px -20px 24px; padding-inline: 20px; }
    [id] { scroll-margin-top: 24px; }

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
    /* Scoped away from the shared site footer, which brings its
       own surface and must not be centred by this rule. */
    footer:not(.ac-foot) {
      text-align: center; padding: 28px; border-radius: var(--radius);
      background: var(--surface); border: 1px solid var(--border); color: var(--text-dim);
    }
    footer:not(.ac-foot) .f-name { color: var(--text); font-weight: 800; font-size: 1.05em; }
    footer:not(.ac-foot) .f-meta { margin-block-start: 6px; font-size: 0.85em; }
    footer:not(.ac-foot) .f-meta b { color: color-mix(in srgb, var(--brand) 45%, var(--text)); }

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


// ==========================================
// Partial: Footer
// ==========================================


// ==========================================
// Page: Release Notes
// ==========================================
function createReleaseNotesPage(lang, theme) {
  const amirLogo = CONFIG.AMIR_LOGO
  const resolved = resolveLang(lang)
  const dir = dirFor(resolved)
  const p = pack(resolved)
  const site = NAV_I18N[resolved]
  const themeAttr = theme === 'light' || theme === 'dark' ? ` data-theme="${theme}"` : ''
  const title = `${site.releaseNotes} — AmirCollider`
  const description = p.metaDesc
  const trail = [
    { href: '/', label: site.home },
    { href: '/release-notes', label: site.releaseNotes }
  ]

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${resolved}"${themeAttr}>
<head>
  ${getPageHead({ title, amirLogo, description })}
  ${seoHead({
    path: '/release-notes',
    title,
    description,
    lang: resolved,
    keywords: keywordList('release notes', 'changelog', site.releaseNotes),
    graph: [breadcrumbLd(trail, resolved)]
  })}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap"></noscript>
  ${themeBootScript()}
  <style>${siteNavCss()}${getReleaseNotesCSS()}</style>
</head>
<body>
  ${siteHeader({ lang: resolved, active: 'releaseNotes' })}
  <div class="wrap">
    ${siteBreadcrumb({ lang: resolved, trail })}
    <main id="main">
      ${renderHero(resolved)}
      ${renderReleases(resolved)}
    </main>
    ${siteFooter({ lang: resolved })}
  </div>
  ${siteBackToTop({ lang })}
  ${siteChromeScript()}
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

  const headers = langCookieHeader(url, lang)

  return createHtmlResponse(createReleaseNotesPage(lang, theme), 200, headers)
}
