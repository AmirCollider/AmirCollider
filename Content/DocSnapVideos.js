// ==========================================
// Content/DocSnapVideos.js
// The Unity DocSnap demo clips: what each one shows, in
// three languages, and where its file lives in R2.
//
// Public exports:
//   VIDEO_LANGS               the languages clips exist in
//   VIDEOS                    the catalogue, in play order
//   videosFor(lang)           the clips that exist for one language
//   totalSecondsFor(lang)     runtime of that language's set
//   formatDuration(seconds)   "0:14" / "2:30"
//   objectCandidatesFor(lang, video)  R2 keys to try, best first
//   prefixCandidatesFor(lang)         R2 prefixes to sweep as a fallback
//
// Two facts about the recordings drive the shape of this
// file:
//
//   • English has ten clips, Japanese and Persian have
//     nine. The tenth is the dark-mode-and-languages tour,
//     which was only ever recorded in English. So the
//     catalogue carries a per-clip `langs` list and the
//     page renders whatever actually exists rather than
//     ten cards, one of which 404s.
//
//   • Every clip is fourteen seconds except the first two.
//     The durations are stored rather than probed: reading
//     them out of the MP4 headers would mean a range read
//     per clip per page render, to print a number that has
//     not changed since the day it was recorded.
// ==========================================


// ==========================================
// Languages
// The clip languages, which are NOT the same list as the
// site's UI languages even though they spell the same.
// ==========================================
export const VIDEO_LANGS = ['en', 'ja', 'fa']


// ==========================================
// R2 layout
// Where each language's files sit inside the amircolliderr2
// bucket.
// ==========================================
const PREFIXES = {
  en: ['EN/', 'EN/EN/'],
  ja: ['JP/', 'JA/', 'JP/JP/', 'JP/JA/'],
  fa: ['FA/', 'FA/FA/']
}

// The tail a language's filenames carry before ".mp4".
// English has none; the other two were exported with a
// language marker in the name. Both spellings are tried,
// so a file uploaded without its marker still resolves.
const SUFFIXES = {
  en: ['', ' -EN-'],
  ja: [' -JA-', ''],
  fa: [' -FA-', '']
}


// ==========================================
// The catalogue
// Play order, which is also the order the numbers in the
// filenames imply.
// ==========================================
export const VIDEOS = [
  {
    id: 1,
    file: 'Explain to AI',
    seconds: 21,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'کل پروژه را به هوش مصنوعی بده',
      en: 'Hand your whole project to an AI',
      ja: 'プロジェクト全体を AI に渡す'
    },
    blurb: {
      fa: 'یک فایل ai-bundle.md که همه‌ی سین‌ها و پوشه‌ها را خلاصه کرده — یک پیست به‌جای چهل اسکرین‌شات.',
      en: 'One ai-bundle.md summarising every Scene and folder — a single paste instead of forty screenshots.',
      ja: 'すべてのシーンとフォルダをまとめた ai-bundle.md。スクショ 40 枚の代わりに 1 回の貼り付けで済みます。'
    }
  },
  {
    id: 2,
    file: 'What Changed',
    seconds: 17,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'ببین از دفعه‌ی قبل چه عوض شده',
      en: 'See what changed since last time',
      ja: '前回からの変更点を見る'
    },
    blurb: {
      fa: 'صفحه‌ی تغییرات، دو خروجی را کنار هم می‌گذارد و می‌گوید چه اضافه، حذف یا جابه‌جا شده.',
      en: 'The Changes page diffs two exports and tells you what was added, removed or moved.',
      ja: '変更ページが 2 つのエクスポートを比較し、追加・削除・移動を表示します。'
    }
  },
  {
    id: 3,
    file: 'Find a File',
    seconds: 14,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'هر چیزی را در چند ثانیه پیدا کن',
      en: 'Find anything in seconds',
      ja: '数秒で目的のものを見つける'
    },
    blurb: {
      fa: 'جست‌وجوی سراسری روی گیم‌آبجکت‌ها، کامپوننت‌ها و اسست‌ها — بدون باز کردن یونیتی.',
      en: 'Search across every GameObject, Component and Asset — without opening Unity.',
      ja: 'GameObject・コンポーネント・アセットを横断検索。Unity を開く必要はありません。'
    }
  },
  {
    id: 4,
    file: 'Complete Archive',
    seconds: 14,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'یک آرشیو کامل از پروژه',
      en: 'A complete archive of the project',
      ja: 'プロジェクトの完全なアーカイブ'
    },
    blurb: {
      fa: 'هر سین، هر کامپوننت، هر فیلد سریالایزشده — همه در یک پوشه که هر وقت خواستی باز می‌شود.',
      en: 'Every Scene, Component and serialized field, in one folder you can open any time.',
      ja: 'すべてのシーン、コンポーネント、シリアライズフィールドを 1 つのフォルダに保存。'
    }
  },
  {
    id: 5,
    file: 'Offline No Unity',
    seconds: 14,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'بدون یونیتی، بدون اینترنت',
      en: 'No Unity, no internet',
      ja: 'Unity もインターネットも不要'
    },
    blurb: {
      fa: 'خروجی یک سایت HTML ساده است؛ با دابل‌کلیک باز می‌شود — روی هر کامپیوتری، حتی بدون یونیتی.',
      en: 'The output is plain HTML — double-click it on any computer, Unity or not.',
      ja: '出力は素の HTML。Unity のないマシンでもダブルクリックで開けます。'
    }
  },
  {
    id: 6,
    file: 'Share With Team',
    seconds: 14,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'با تیم به اشتراک بگذار',
      en: 'Share it with the team',
      ja: 'チームと共有する'
    },
    blurb: {
      fa: 'پوشه را زیپ کن و بفرست. آرتیست و پروداکشن هم می‌توانند پروژه را ببینند بدون اینکه چیزی نصب کنند.',
      en: 'Zip the folder and send it. Artists and producers can read the project with nothing installed.',
      ja: 'フォルダを zip で送るだけ。アーティストもプロデューサーも、何もインストールせずに閲覧できます。'
    }
  },
  {
    id: 7,
    file: 'Browse in Browser',
    seconds: 14,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'در مرورگر بگرد',
      en: 'Browse it in a browser',
      ja: 'ブラウザで見る'
    },
    blurb: {
      fa: 'سلسله‌مراتب، اینسپکتور و رفرنس‌های قابل کلیک — دقیقاً همان‌طور که در یونیتی سیم‌کشی شده.',
      en: 'Hierarchy, Inspector and clickable references — exactly as the Scene is wired in Unity.',
      ja: '階層・インスペクター・クリック可能な参照。Unity 上の配線そのままです。'
    }
  },
  {
    id: 8,
    file: 'Asset Settings',
    seconds: 14,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'تنظیمات ایمپورت هر اسست',
      en: 'Every asset’s import settings',
      ja: 'アセットのインポート設定'
    },
    blurb: {
      fa: 'هر تکسچر، مش و کلیپ صوتی با تنظیمات ایمپورتش — برای وقتی که باید بفهمی چرا بیلد سنگین شده.',
      en: 'Every texture, mesh and audio clip with its import settings — for when a build got heavy.',
      ja: 'テクスチャ・メッシュ・オーディオのインポート設定を一覧。ビルドが重い原因を追えます。'
    }
  },
  {
    id: 9,
    file: 'Versions Compare',
    seconds: 14,
    langs: ['en', 'ja', 'fa'],
    title: {
      fa: 'نسخه‌ها را نگه دار و مقایسه کن',
      en: 'Keep versions and compare them',
      ja: 'バージョンを保存して比較する'
    },
    blurb: {
      fa: 'هر اکسپورت یک اسنپ‌شات است. هر دوتایی را انتخاب کن و تفاوتشان را ببین.',
      en: 'Every export is a snapshot. Pick any two and read the difference between them.',
      ja: 'エクスポートごとにスナップショットを保存。任意の 2 つを選んで差分を確認できます。'
    }
  },
  {
    // English only. Recorded last, and the one clip that
    // was never re-cut in the other two languages - so it
    // simply does not appear when the player is set to
    // Japanese or Persian, rather than appearing and
    // failing to load.
    id: 10,
    file: 'Dark and Languages',
    seconds: 14,
    langs: ['en'],
    title: {
      fa: 'تم تاریک و سه زبان',
      en: 'Dark mode and three languages',
      ja: 'ダークモードと 3 言語'
    },
    blurb: {
      fa: 'خود خروجی هم تم روشن/تاریک دارد و به فارسی، انگلیسی و ژاپنی خوانده می‌شود.',
      en: 'The exported site itself has light and dark skins, and reads in Persian, English and Japanese.',
      ja: '出力サイト自体がライト/ダークに対応し、ペルシア語・英語・日本語で読めます。'
    }
  }
]


// ==========================================
// videosFor
// The clips that exist in one language, in play order.
// ==========================================
export function videosFor(lang) {
  return VIDEOS.filter(video => video.langs.indexOf(lang) !== -1)
}


// ==========================================
// totalSecondsFor
// Runtime of one language's set.
// ==========================================
export function totalSecondsFor(lang) {
  return videosFor(lang).reduce((sum, video) => sum + video.seconds, 0)
}


// ==========================================
// formatDuration
// Seconds to m:ss.
// ==========================================
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  return minutes + ':' + String(total % 60).padStart(2, '0')
}


// ==========================================
// pad2
// The number as it appears in the filename: "01", not "1".
// ==========================================
function pad2(value) {
  return String(value).padStart(2, '0')
}


// ==========================================
// objectCandidatesFor
// Every R2 key this clip could plausibly be stored under,
// most likely first.
// ==========================================
export function objectCandidatesFor(lang, video) {
  const prefixes = PREFIXES[lang] || []
  const suffixes = SUFFIXES[lang] || ['']
  const keys = []

  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      keys.push(`${prefix}${pad2(video.id)} ${video.file}${suffix}.mp4`)
    }
  }
  return keys
}


// ==========================================
// prefixCandidatesFor
// The folders to sweep when no candidate key hit.
// ==========================================
export function prefixCandidatesFor(lang) {
  return PREFIXES[lang] || []
}
