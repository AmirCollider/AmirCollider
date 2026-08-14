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
      // "Documentation" leads in every language. The product name
      // reads as a camera to anybody who has not used it, and a
      // catalogue entry is one of the places that misreading gets
      // repeated - see the note on KEYWORDS in Pages/UnityDocSnap.js.
      tagline: {
        fa: 'مستندسازی خودکار پروژه‌ی یونیتی، در یک وب‌سایت آفلاین.',
        en: 'Automatic Unity project documentation, as an offline website.',
        ja: 'Unity プロジェクトのドキュメントを自動生成し、オフライン Web サイトに。'
      },
      description: {
        fa: 'یک ابزار مستندسازی برای یونیتی: هر سین، هر گیم‌آبجکت، هر کامپوننت و هر فیلد سریالایزشده را می‌گردد و می‌پزد توی یک سایت HTML آفلاین که با دابل‌کلیک باز می‌شود — هم برای مرور خودت، هم به‌عنوان بک‌آپ خوانا از ساختار پروژه، هم برای دادن کل پروژه به هوش مصنوعی. نسخه‌ی رایگان بدون کد و بدون حساب کاربری؛ نسخه‌های پولی خرید یک‌باره.',
        en: 'A documentation generator for Unity: it walks every Scene, every GameObject, every Component and every serialized field, and bakes it into an offline HTML site you open with a double-click — to read yourself, to keep as a legible backup of the project’s structure, or to hand to an AI assistant. Free needs no key and no account; the paid editions are one-off.',
        ja: 'Unity 用のドキュメント生成ツールです。すべての Scene・GameObject・Component・シリアライズ済みフィールドを走査し、ダブルクリックで開けるオフライン HTML サイトに書き出します。自分で読むためにも、プロジェクト構成の読めるバックアップとしても、AI に渡すためにも使えます。無料版はキーもアカウントも不要、有料版は買い切りです。'
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
      // Rewritten 2026-08-14 against the shipping package. The
      // previous copy sold the Editor-UI restyling and the font
      // catalog, both of which 2.0.0 removed, and said nothing
      // about the letter shaping that release added - which is
      // the only reason most people install this.
      description: {
        fa: 'مشکل نمایش متن فارسی، عربی و اردو را در TextMeshPro حل می‌کند: حروف به هم می‌چسبند و ترتیب راست‌به‌چپ درست می‌شود، آن هم با خواندن جدول GSUB خودِ فونت و تست گلیف‌به‌گلیف با HarfBuzz. به‌جای فونت‌اسِت SDF از پیش پخته‌شده، خودِ فایل .ttf یا .otf را می‌گیرد، پس ژاپنی و چینی و کره‌ای و ایموجی هم بدون هیچ تنظیمی رندر می‌شوند.',
        en: 'Fixes right-to-left text in TextMeshPro: Persian, Arabic and Urdu come out with their letters joined and in reading order, using the font’s own GSUB table and verified glyph-for-glyph against HarfBuzz. It takes the .ttf or .otf itself instead of a pre-baked SDF font asset, so Japanese, Chinese, Korean and emoji render with nothing to configure either.',
        ja: 'TextMeshPro の右から左のテキスト表示を修正します。ペルシャ語・アラビア語・ウルドゥー語の文字が正しく連結され、読み順で表示されます。連結形はフォント自身の GSUB テーブルから読み出し、HarfBuzz とグリフ単位で照合済みです。焼き込み済みの SDF フォントアセットではなく .ttf / .otf をそのまま受け取るため、日本語・中国語・韓国語・絵文字も設定なしで表示されます。'
      },
      cta: { fa: 'ببین و بگیر', en: 'Take a look', ja: '詳しく見る' }
    },

    highlights: [
      {
        fa: 'فارسی و عربی چسبیده و راست‌به‌چپ',
        en: 'Persian and Arabic, joined and right-to-left',
        ja: 'ペルシャ語・アラビア語を連結して右から左に表示'
      },
      {
        fa: 'یک فونت جدا برای هر زبان، روی یک لیبل',
        en: 'A different font per language, on one label',
        ja: '1 つのラベルに言語ごとのフォント'
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
