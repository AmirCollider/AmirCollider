// ==========================================
// Content/DirectTmpVideos.js
// The Unity DirectTMP demo clips: what each one shows, in
// three languages, and where its file lives.
//
// Public exports:
//   VIDEO_LANGS               the languages clips exist in
//   VIDEOS                    the catalogue, in play order
//   PUBLISHED                 the set's publication date
//   videoUrl(lang, video)     the absolute address of one clip
//   urlMap()                  every clip's address, for the player
//   totalSeconds()            runtime of the set
//   formatDuration(seconds)   "0:21" / "2:42"
//
// Three facts about these recordings shape this file, and each
// one is a difference from Content/DocSnapVideos.js - which
// looks like the same thing and is not.
//
//   • The files are NOT in this Worker's R2 bucket and are not
//     served by this Worker. They sit on the download host as
//     ordinary static files, so there is no key to probe for and
//     no /video/ route in front of them: the address is built by
//     string, once, and it is absolute. That is also why
//     Config.js has to name that host in media-src - a
//     cross-origin video is refused by the policy with no visible
//     error, and the page just looks like the files are missing.
//
//   • All nine clips exist in all three languages. DocSnap's
//     catalogue carries a per-clip `langs` list because its tenth
//     clip is English-only; there is nothing like that here, so
//     every language shows the same nine.
//
//   • The three languages do not agree on how a filename is
//     spelled. Persian puts its marker at the END of the name
//     with no separator (DirectTMP-01-Broken-PersianFA.mp4) while
//     English and Japanese put it after the prefix
//     (DirectTMP-EN-01-Broken-Persian.mp4). That is how they were
//     exported and renaming forty-odd files on a live host to
//     tidy it up is a worse trade than one switch here.
//
// Durations are stored rather than probed, for the same reason
// they are in the DocSnap catalogue: reading them out of the MP4
// headers would mean a range request per clip per page render,
// to print a number that has not changed since the day it was
// recorded. Whoever re-records a clip edits its number here.
// ==========================================


// ==========================================
// Languages
// ==========================================
export const VIDEO_LANGS = ['fa', 'en', 'ja']


// ==========================================
// When the clips were published.
//
// A constant and not a computed date, for exactly the reason
// CONFIG.SITEMAP_LASTMOD is one: uploadDate is a fact a crawler
// either trusts or learns to ignore, and a set of clips that
// claims to have been published today, and again tomorrow, is
// the second kind. Google requires the field for a video rich
// result and quietly drops a VideoObject without it.
//
// Whoever re-records the set moves this line in the same commit.
// ==========================================
export const PUBLISHED = '2026-09-11'


// ==========================================
// Where the files live.
//
// The host is a constant rather than url.origin because these
// are not served from the site's origin at all, and it is named
// once so that moving the files is one edit here plus one in the
// media-src list in Config.js. Those two must agree; if they
// ever do not, the clips stop playing and nothing is logged.
// ==========================================
const BASE = 'https://dl.amircollider.com/UnityDirectTMP'


// ==========================================
// The catalogue, in play order.
//
// `slug` is the part of the filename after the number, shared by
// all three languages. `seconds` is that clip's runtime.
// ==========================================
export const VIDEOS = [
  {
    id: 1,
    slug: 'Broken-Persian',
    seconds: 21,
    title: {
      fa: 'پایان کابوس حروف برعکس و جدا در یونیتی',
      en: 'The end of backwards, disconnected text in Unity',
      ja: 'Unity の逆順・バラバラ文字はもう終わり'
    },
    blurb: {
      fa: 'رندر خودکار و بی‌نقص متن‌های فارسی و راست‌به‌چپ — بدون نیاز به پلاگین‌های جانبی و دست‌کاری رشته‌ها.',
      en: 'Persian and right-to-left text shaped and ordered automatically — no side plugins, no string manipulation.',
      ja: 'ペルシャ語や右から左に読む文字を、自動で正しく整形・配置します。外部プラグインも文字列の加工も不要です。'
    }
  },
  {
    id: 2,
    slug: 'No-Atlas',
    seconds: 18,
    title: {
      fa: 'خداحافظی با ساخت Font Atlas',
      en: 'No more building a font atlas',
      ja: 'フォントアトラスの作成はもう不要'
    },
    blurb: {
      fa: 'درگ‌واند‌راپ مستقیم فایل‌های TTF و OTF روی کامپوننت — رندر آنی بدون معطلی برای بیک‌کردن اطلس و گلیف‌ها.',
      en: 'Drag a TTF or OTF straight onto the component — it draws immediately, with no atlas or glyph set to bake first.',
      ja: 'TTF・OTF をコンポーネントに直接ドラッグするだけ。アトラスやグリフのベイクを待たずに即座に描画されます。'
    }
  },
  {
    id: 3,
    slug: 'Install',
    seconds: 17,
    title: {
      fa: 'نصب و راه‌اندازی در چند ثانیه',
      en: 'Installed and running in seconds',
      ja: '数秒でインストールして使い始められます'
    },
    blurb: {
      fa: 'نصب مستقیم از Package Manager تنها با یک آدرس گیت — آماده‌ی استفاده بدون هیچ کانفیگ و دردسر اضافه.',
      en: 'One git URL in the Package Manager and it is ready — no configuration, no setup step.',
      ja: 'Package Manager に Git の URL をひとつ貼るだけ。設定作業は一切ありません。'
    }
  },
  {
    id: 4,
    slug: 'Font-Per-Language',
    seconds: 19,
    title: {
      fa: 'فونت اختصاصی برای هر زبان',
      en: 'A different font for every language',
      ja: '言語ごとに別のフォントを指定'
    },
    blurb: {
      fa: 'تعیین فونت مجزا برای زبان‌های مختلف پروژه — سوییچ خودکار فونت هنگام تغییر زبان، بدون به‌هم‌ریختگی چیدمان UI.',
      en: 'Set a font per language and the right one is used as the text changes — without the UI layout shifting.',
      ja: '言語が切り替わると、自動で対応するフォントが使われます。UI のレイアウトが崩れることもありません。'
    }
  },
  {
    id: 5,
    slug: 'Outline',
    seconds: 18,
    title: {
      fa: 'آوت‌لاین تمیز و یکپارچه روی خط فارسی',
      en: 'A clean outline on joined Persian script',
      ja: 'つながった文字にもきれいなアウトライン'
    },
    blurb: {
      fa: 'تنظیم خط دور (Outline) شارپ بدون باگ‌های متریال و پدینگ — حفظ اتصالات یکدست و انحنای طبیعی حروف پیوسته.',
      en: 'Sharp outlines without the shared-material and padding bugs — the joins stay even and the curves stay natural.',
      ja: 'マテリアル共有やパディングの不具合なくシャープな縁取りを設定でき、文字の接続と曲線が保たれます。'
    }
  },
  {
    // The wording here is deliberately "verified against" rather
    // than "powered by", and it is not a softening: the package
    // ships no third-party dependency and does its own shaping
    // from the font's OpenType tables. HarfBuzz is the reference
    // the output was checked against, which is the stronger and
    // the true claim. The repository's own README says the same
    // thing in the same words, and this page and that file
    // disagreeing would be worse than either being vaguer.
    id: 6,
    slug: 'HarfBuzz',
    seconds: 18,
    title: {
      fa: 'چینشی که با HarfBuzz راستی‌آزمایی شده',
      en: 'Shaping verified against HarfBuzz',
      ja: 'HarfBuzz と照合して検証された整形処理'
    },
    blurb: {
      fa: 'خروجی حرف‌به‌حرف با HarfBuzz — همان موتوری که مرورگرها استفاده می‌کنند — مقایسه و تأیید شده: اعراب، نیم‌فاصله و اتصالات پیچیده، درست.',
      en: 'Compared glyph for glyph against the engine browsers use — diacritics, zero-width joiners and complex ligatures all land correctly.',
      ja: 'ブラウザが使う整形エンジンとグリフ単位で比較・検証済み。ダイアクリティカルマークやゼロ幅接合子、複雑な合字も正しく表示されます。'
    }
  },
  {
    id: 7,
    slug: 'Twelve-Languages',
    seconds: 17,
    title: {
      fa: 'پشتیبانی هم‌زمان از ۱۲ زبان زنده‌ی دنیا',
      en: 'Twelve languages at once',
      ja: '12 の言語を同時に表示'
    },
    blurb: {
      fa: 'نمایش بی‌نقص متون چندزبانه و ترکیبی (RTL و LTR) در یک صحنه — بین‌المللی‌سازی بازی برای بازار جهانی تنها با یک ابزار.',
      en: 'Mixed right-to-left and left-to-right text in one scene — one tool for shipping a game to a global market.',
      ja: '右から左に読む言語と左から右に読む言語が同じシーンに混在しても正しく表示。世界市場向けのローカライズをこれひとつで。'
    }
  },
  {
    id: 8,
    slug: 'Whole-Canvas',
    seconds: 17,
    title: {
      fa: 'تبدیل یک‌کلیکی کل کانواس به DirectTMP',
      en: 'Convert a whole Canvas in one click',
      ja: 'Canvas 全体をワンクリックで変換'
    },
    blurb: {
      fa: 'مهاجرت آنی تمام تکست‌های صحنه به کامپوننت جدید تنها با یک کلیک — بدون نیاز به بازسازی و جایگزینی دستی متن‌های UI.',
      en: 'Every text object in the scene moves to the new component at once — no rebuilding the UI by hand.',
      ja: 'シーン内のすべてのテキストを一度に新しいコンポーネントへ移行。UI を手作業で作り直す必要はありません。'
    }
  },
  {
    id: 9,
    slug: 'From-Code',
    seconds: 17,
    title: {
      fa: 'کنترل سریع و بی‌دردسر از طریق کد',
      en: 'Drive it from code, the ordinary way',
      ja: 'コードからも普通に扱えます'
    },
    blurb: {
      fa: 'تغییر متن در ران‌تایم با همان API استاندارد یونیتی — کدنویسی تمیز در سی‌شارپ بدون توابع جانبی معکوس‌سازی متن.',
      en: "Set text at runtime through Unity's own API — clean C# with no string-reversing helpers.",
      ja: 'Unity 標準の API でそのままテキストを変更。文字列を反転させるヘルパー関数は必要ありません。'
    }
  }
]


// ==========================================
// videoUrl
// One clip's absolute address.
//
// The number is two digits with a leading zero, matching the
// files as they were uploaded - clip 1 is "01" and not "1".
// ==========================================
export function videoUrl(lang, video) {
  const number = String(video.id).padStart(2, '0')

  // Persian carries its marker at the end of the name; the other
  // two carry it after the prefix. See the note at the top.
  const file = lang === 'fa'
    ? `DirectTMP-${number}-${video.slug}FA.mp4`
    : `DirectTMP-${lang.toUpperCase()}-${number}-${video.slug}.mp4`

  return `${BASE}/${lang.toUpperCase()}/${file}`
}


// ==========================================
// urlMap
// Every clip's address in every language, as a plain object the
// player script can be handed.
//
// The player switches both clip and language without a page
// load, so it needs all twenty-seven addresses up front. Building
// them here rather than in the browser keeps the filename rule -
// which is the fiddly part - in one place on the server.
// ==========================================
export function urlMap() {
  const map = {}
  for (const lang of VIDEO_LANGS) {
    map[lang] = {}
    for (const video of VIDEOS) map[lang][video.id] = videoUrl(lang, video)
  }
  return map
}


// ==========================================
// totalSeconds
// Runtime of the whole set. Every clip exists in every language,
// so this does not vary by language.
// ==========================================
export function totalSeconds() {
  return VIDEOS.reduce((sum, video) => sum + video.seconds, 0)
}


// ==========================================
// formatDuration
// Seconds as "0:21" or "2:42". Always at least one minute digit
// and always two second digits.
// ==========================================
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}


// ==========================================
// isoDuration
// The same runtime as ISO 8601, which is the form a VideoObject's
// `duration` has to be in. A number of seconds there is ignored.
// ==========================================
export function isoDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  return `PT${Math.floor(total / 60)}M${total % 60}S`
}
