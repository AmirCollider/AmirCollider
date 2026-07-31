// ==========================================
// Content/ToolsCatalog.js
// The catalogue of Unity tools, as data.
//
// Why this file exists
//
// So the catalogue is one array. A tool is added by
// appending one entry; every surface that lists tools
// reads this and renders whatever is in it.
//
// Public exports (do not break without updating callers):
//   TOOLS              -> the ordered catalogue
//   toolsFor(lang)     -> entries flattened to one language,
//                         which is what a renderer wants
// ==========================================

import { CONFIG } from '../Config.js'


// ==========================================
// Immutability
// The catalogue is read by every page and written by
// none, so freezing it turns "somebody mutated the
// shared array while rendering" from a class of bug
// into a TypeError.
// ==========================================
function deepFreeze(target) {
  if (target && typeof target === 'object' && !Object.isFrozen(target)) {
    for (const value of Object.values(target)) deepFreeze(value)
    Object.freeze(target)
  }
  return target
}


// ==========================================
// The catalogue
// ==========================================
const CATALOG = [
  {
    id: 'unity-docsnap',
    name: 'Unity DocSnap',
    mark: '🧋',
    href: '/unity-docsnap',
    repo: CONFIG.DOCSNAP.REPO_URL,
    version: CONFIG.DOCSNAP.VERSION,

    // The boba palette.
    accent: '#6d4ccc',
    accentSoft: '#a07be0',

    // Free tier plus two paid ones. The tags render in
    // this order and the first is always what it costs
    // to start.
    pricing: 'freemium',
    tags: [
      { kind: 'free', fa: 'رایگان', en: 'Free', ja: '無料版' },
      { kind: 'paid', fa: 'Plus $' + CONFIG.DOCSNAP.TIERS.plus.price, en: 'Plus $' + CONFIG.DOCSNAP.TIERS.plus.price, ja: 'Plus $' + CONFIG.DOCSNAP.TIERS.plus.price },
      { kind: 'paid', fa: 'Pro $' + CONFIG.DOCSNAP.TIERS.pro.price, en: 'Pro $' + CONFIG.DOCSNAP.TIERS.pro.price, ja: 'Pro $' + CONFIG.DOCSNAP.TIERS.pro.price }
    ],

    i18n: {
      tagline: {
        fa: 'کل پروژه‌ی یونیتی را می‌کند یک وب‌سایت آفلاین.',
        en: 'Snaps a whole Unity project into an offline website.',
        ja: 'Unity プロジェクト全体をオフラインの Web サイトに。'
      },
      description: {
        fa: 'هر سین، هر گیم‌آبجکت، هر کامپوننت و هر فیلد سریالایزشده را می‌گردد و می‌پزد توی یک سایت HTML تمیز که با دابل‌کلیک باز می‌شود — هم برای آدم‌ها، هم برای هوش مصنوعی. نسخه‌ی رایگان بدون کد و بدون حساب کاربری؛ نسخه‌های پولی خرید یک‌باره.',
        en: 'Walks every Scene, every GameObject, every Component and every serialized field, and bakes it into a clean offline HTML site you open with a double-click — for humans and AI alike. Free needs no key and no account; the paid editions are one-off.',
        ja: 'すべての Scene・GameObject・Component・シリアライズ済みフィールドを走査し、ダブルクリックで開けるオフライン HTML サイトに書き出します。人にも AI にも読める形で。無料版はキーもアカウントも不要、有料版は買い切りです。'
      },
      cta: { fa: 'ببین و بخر', en: 'See it', ja: '詳しく見る' }
    },

    highlights: [
      {
        fa: 'خروجی خلاصه‌ی آماده‌ی هوش مصنوعی',
        en: 'AI-ready project summaries',
        ja: 'AI 向けのプロジェクト要約'
      },
      {
        fa: 'صفحه‌ی تغییرات بین دو خروجی',
        en: 'A Changes page between two exports',
        ja: '2 つのエクスポート間の変更ページ'
      },
      {
        fa: 'گزارش سلامت پروژه و جست‌وجوی کامل',
        en: 'Project health report and full-text search',
        ja: 'プロジェクト健全性レポートと全文検索'
      }
    ]
  },

  {
    id: 'unity-directtmp',
    name: 'Unity DirectTMP',
    mark: '🖋️',
    href: '/unity-directtmp',
    repo: CONFIG.DIRECTTMP.REPO_URL,
    version: CONFIG.DIRECTTMP.VERSION,

    // The Inkwell palette, straight out of
    // DirectTMPConstants.cs. The tool's editor windows,
    // its README badges and this card all read the same
    // six values.
    accent: '#14808C',
    accentSoft: '#F0A73E',

    pricing: 'free',
    tags: [
      { kind: 'free', fa: 'رایگان', en: 'Free', ja: '無料' },
      { kind: 'plain', fa: 'MIT', en: 'MIT', ja: 'MIT' },
      { kind: 'plain', fa: 'متن‌باز', en: 'Open source', ja: 'オープンソース' }
    ],

    i18n: {
      tagline: {
        fa: 'فایل فونت رو مستقیم بده به TextMeshPro — هر زبونی، همون‌جوری که هست.',
        en: 'Hand TextMeshPro the font file itself — and every language just works.',
        ja: 'フォントファイルをそのまま TextMeshPro へ。どんな言語も、そのまま。'
      },
      description: {
        fa: 'به‌جای فونت‌اسِت SDF از پیش پخته‌شده، خودِ فایل .ttf یا .otf را به TextMeshPro می‌دهد؛ گلیف‌ها همان لحظه از فایل ساخته می‌شوند، پس فارسی و عربی و ژاپنی و کره‌ای بدون هیچ تنظیمی رندر می‌شوند. و از نسخه‌ی ۱.۰، فونت رابط خودِ یونیتی را هم عوض می‌کند — دیگر اسم فارسی پوشه‌ها توی Project مربع خالی نیست.',
        en: 'Gives TextMeshPro the .ttf or .otf itself instead of a pre-baked SDF font asset. Glyphs are rasterized from the file the moment they are first drawn, so Persian, Arabic, Japanese and Korean render with nothing to configure. And since 1.0 it restyles the Unity Editor itself — no more folders with Persian names showing up as empty boxes in the Project window.',
        ja: '焼き込み済みの SDF フォントアセットではなく、.ttf / .otf そのものを TextMeshPro に渡します。グリフは最初に描画された瞬間にファイルから生成されるため、ペルシャ語・アラビア語・日本語・韓国語が設定なしで表示されます。さらに 1.0 からは Unity 自身の UI フォントも変更でき、日本語名のフォルダーが Project ウィンドウで豆腐になることもなくなります。'
      },
      cta: { fa: 'ببین و بگیر', en: 'Take a look', ja: '詳しく見る' }
    },

    highlights: [
      {
        fa: 'روی خودِ ادیتور یونیتی هم اثر می‌گذارد',
        en: 'Restyles the Unity Editor itself',
        ja: 'Unity エディタ自身のフォントも変更'
      },
      {
        fa: 'کاتالوگ فونت با پوشش واقعی هر خط',
        en: 'A font catalog with real per-script coverage',
        ja: '文字体系ごとの実収録を示すフォントカタログ'
      },
      {
        fa: 'بدون Font Asset Creator، بدون رِنج کاراکتر',
        en: 'No Font Asset Creator, no character ranges',
        ja: 'Font Asset Creator も文字範囲指定も不要'
      }
    ]
  }
]

export const TOOLS = deepFreeze(CATALOG)


// ==========================================
// Lookups
// ==========================================


/**
 * Every tool except the one named, in catalogue order.
 * This is what a product page's footer wants: the rest
 * of the shelf, without itself on it.
 */
export function otherTools(id) {
  return TOOLS.filter(tool => tool.id !== id)
}


// ==========================================
// Flattening
// ==========================================
function pick(map, lang) {
  if (!map) return ''
  return map[lang] != null && map[lang] !== '' ? map[lang] : (map.en || '')
}

/**
 * The catalogue with every string resolved to one
 * language, ready to render.
 */
export function toolsFor(lang) {
  return TOOLS.map(tool => flatten(tool, lang))
}


function flatten(tool, lang) {
  return {
    id: tool.id,
    name: tool.name,
    mark: tool.mark,
    href: tool.href,
    repo: tool.repo,
    version: tool.version,
    accent: tool.accent,
    accentSoft: tool.accentSoft,
    pricing: tool.pricing,
    tagline: pick(tool.i18n.tagline, lang),
    description: pick(tool.i18n.description, lang),
    cta: pick(tool.i18n.cta, lang),
    tags: tool.tags.map(tag => ({ kind: tag.kind, label: pick(tag, lang) })),
    highlights: tool.highlights.map(highlight => pick(highlight, lang))
  }
}
