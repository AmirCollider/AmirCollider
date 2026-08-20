// ==========================================
// Content/GameFacts.js
// What a policy page says that is true of ONE game.
//
// ------------------------------------------------------------
// WHY THIS FILE EXISTS
// ------------------------------------------------------------
// Search Console reported twenty URLs as "Discovered - currently
// not indexed": Google had found them in the sitemap and decided
// not to spend a fetch on any of them. Twelve were the per-game
// privacy and terms pages, in three languages.
//
// Measuring them explained it exactly. The Chrono Blades privacy
// policy differed from the site-wide privacy policy by THREE
// TOKENS - the game's emoji, and the words "Game" and "View" from
// a navigation link. The body text was byte-identical. Twelve
// addresses were serving one document, and Google was right.
//
// Deleting them is not an option and never was: Google's OAuth
// consent screen for each game points at /{game}/privacy and
// /{game}/terms, and a store listing links to them. They have to
// load, and they have to be about that application.
//
// So they say something now. Everything below is a FACT about the
// game, read from its GAME_REGISTRY entry - which is also what a
// verification reviewer is actually looking for on that page, and
// what a player wants before installing.
//
// ------------------------------------------------------------
// THE RULE THAT MATTERS
// ------------------------------------------------------------
// Every row is derived from `capabilities`, `package` and
// `download.links` - the same flags that decide whether the
// account, store and leaderboard pages exist at all. A game with
// no store therefore CANNOT claim purchases here, and a game that
// never signs anybody in cannot claim to read a Google profile.
// That is the same guarantee Content/GoogleDisclosure.js gives,
// for the same reason: a policy that describes a feature the
// build does not have is worse than no policy, and it is the kind
// of thing an OAuth review rejects.
//
// Public exports
//   gameFacts(game, lang, kind)   rows for one game, one language
//                                 kind: 'privacy' | 'terms'
// ==========================================

const I18N = {
  fa: {
    privacyTitle: 'این سیاست درباره‌ی کدام بازی است',
    termsTitle: 'این شرایط درباره‌ی کدام بازی است',
    privacyIntro: 'هر چیزی که در این صفحه می‌خوانی درباره‌ی همین یک بازی است. آن‌چه این بازی از حساب گوگل می‌خواند و آن‌چه روی سرور نگه می‌دارد، از قابلیت‌های خودش می‌آید — نه از فهرستی کلی.',
    termsIntro: 'این شرایط برای همین یک بازی است. آن‌چه می‌شود خرید و جایی که بازی از آن گرفته می‌شود، از تنظیمات خود بازی می‌آید.',

    game: 'نام بازی',
    packageId: 'شناسه‌ی بسته (اندروید)',
    platforms: 'اجرا روی',
    stores: 'محل دریافت',
    signIn: 'ورود با حساب گوگل',
    scopes: 'دسترسی‌هایی که خوانده می‌شود',
    cloud: 'ذخیره‌ی ابری',
    board: 'جدول امتیازات عمومی',
    purchases: 'خرید درون‌برنامه‌ای',
    deletion: 'حذف حساب و داده‌ها',
    progress: 'چه چیزی از پیشرفتت نگه داشته می‌شود',
    products: 'چه چیزهایی قابل خرید است',
    progressScore: 'بالاترین امتیاز',
    progressTime: 'مجموع زمان بازی',
    progressPlays: 'تعداد دفعات بازی',
    progressLevel: 'بالاترین مرحله',
    progressItem: 'وسیله‌ای که در دست داری',
    progressItems: 'چیزهایی که خریده‌ای',
    nothingStored: 'هیچ‌چیز روی سرور نگه داشته نمی‌شود',

    yes: 'دارد',
    no: 'ندارد',
    noSignIn: 'این بازی هیچ‌وقت درخواست ورود نمی‌کند و هیچ داده‌ای از حساب گوگل نمی‌خواند.',
    scopeList: 'openid، email و profile — یعنی نام، نشانی ایمیل و تصویر پروفایل. هیچ دسترسی دیگری خواسته نمی‌شود.',
    deleteHere: 'از صفحه‌ی حساب همین بازی، هر وقت خواستی',
    deleteMail: 'با ایمیل به پشتیبانی',
    androidLabel: 'اندروید',
    webLabel: 'مرورگر'
  },

  en: {
    privacyTitle: 'Which game this policy covers',
    termsTitle: 'Which game these terms cover',
    privacyIntro: 'Everything on this page is about this one game. What it reads from a Google account and what it keeps on the server comes from that game’s own capabilities, not from a general list.',
    termsIntro: 'These terms are for this one game. What can be bought, and where the game is obtained, come from that game’s own settings.',

    game: 'Game',
    packageId: 'Package id (Android)',
    platforms: 'Runs on',
    stores: 'Available from',
    signIn: 'Google sign-in',
    scopes: 'Scopes read',
    cloud: 'Cloud save',
    board: 'Public leaderboard',
    purchases: 'In-app purchases',
    deletion: 'Deleting your account and data',
    progress: 'What is kept about your progress',
    products: 'What can be bought',
    progressScore: 'highest score',
    progressTime: 'total play time',
    progressPlays: 'number of plays',
    progressLevel: 'furthest stage reached',
    progressItem: 'the item you have equipped',
    progressItems: 'what you have bought',
    nothingStored: 'Nothing is kept on the server',

    yes: 'Yes',
    no: 'No',
    noSignIn: 'This game never asks anyone to sign in and reads no Google account data at all.',
    scopeList: 'openid, email and profile — your name, email address and profile picture. Nothing else is requested.',
    deleteHere: 'From this game’s account page, at any time',
    deleteMail: 'By email to support',
    androidLabel: 'Android',
    webLabel: 'A browser'
  },

  ja: {
    privacyTitle: 'このポリシーの対象ゲーム',
    termsTitle: 'この規約の対象ゲーム',
    privacyIntro: 'このページの内容は、このゲーム 1 本についてのものです。Google アカウントから読み取る情報とサーバーに保存する情報は、そのゲーム自身の機能から決まります。',
    termsIntro: 'この規約はこのゲーム 1 本に適用されます。購入できるものと入手先は、そのゲーム自身の設定から決まります。',

    game: 'ゲーム名',
    packageId: 'パッケージ ID (Android)',
    platforms: '対応環境',
    stores: '入手先',
    signIn: 'Google サインイン',
    scopes: '読み取るスコープ',
    cloud: 'クラウドセーブ',
    board: '公開ランキング',
    purchases: 'アプリ内購入',
    deletion: 'アカウントとデータの削除',
    progress: '保存される進行状況',
    products: '購入できるもの',
    progressScore: '最高スコア',
    progressTime: '総プレイ時間',
    progressPlays: 'プレイ回数',
    progressLevel: '到達した最高ステージ',
    progressItem: '装備中のアイテム',
    progressItems: '購入済みのもの',
    nothingStored: 'サーバーには何も保存されません',

    yes: 'あり',
    no: 'なし',
    noSignIn: 'このゲームはサインインを求めず、Google アカウントの情報を一切読み取りません。',
    scopeList: 'openid・email・profile — 名前、メールアドレス、プロフィール画像です。ほかは要求しません。',
    deleteHere: 'このゲームのアカウントページからいつでも',
    deleteMail: 'サポート宛のメールで',
    androidLabel: 'Android',
    webLabel: 'ブラウザ'
  }
}

// The store keys a game's download links can use, as words. The
// same names Pages/GameLanding.js prints on its buttons - a policy
// page that calls Myket something else is a policy page describing
// a different product.
const STORE_NAMES = {
  fa: { myket: 'مایکت', googleplay: 'گوگل پلی', apk: 'دانلود مستقیم', web: 'بازی در مرورگر' },
  en: { myket: 'Myket', googleplay: 'Google Play', apk: 'Direct APK', web: 'Play in browser' },
  ja: { myket: 'Myket', googleplay: 'Google Play', apk: 'APK 直接', web: 'ブラウザーで遊ぶ' }
}


function pack(lang) {
  return I18N[lang] || I18N.fa
}

// The reader's own list separator. A Persian comma in an English
// sentence and an ASCII comma in a Japanese one both read as
// machine output, and this page is one a reviewer reads closely.
function joinList(items, lang) {
  if (lang === 'ja') return items.join('・')
  if (lang === 'en') return items.join(', ')
  return items.join('، ')
}


/**
 * The rows a per-game policy page renders above everything else.
 *
 * Returns `null` for the site-wide pages, which are not about a
 * game and must not borrow one - filling them from the first entry
 * in the registry is what made /privacy read as Neon Katana's
 * policy to anyone arriving from the footer.
 *
 * Every row is `{ key, label, value }`. A row whose fact is absent
 * is omitted rather than rendered empty: "Package id: —" tells a
 * reader nothing and tells a reviewer that the page was generated
 * without checking.
 */
export function gameFacts(game, lang, kind = 'privacy') {
  if (!game || !game.id) return null

  const t = pack(lang)
  const stores = STORE_NAMES[lang] || STORE_NAMES.fa
  const capability = game.capabilities || {}
  const links = (game.download && game.download.links) || {}
  const keys = Object.keys(links)

  const places = []
  if (game.package || keys.some(key => key !== 'web')) places.push(t.androidLabel)
  if (keys.includes('web')) places.push(t.webLabel)

  const rows = [{ key: 'game', label: t.game, value: game.name }]

  if (game.package) rows.push({ key: 'packageId', label: t.packageId, value: game.package })
  if (places.length) rows.push({ key: 'platforms', label: t.platforms, value: joinList(places, lang) })
  if (keys.length) {
    rows.push({
      key: 'stores',
      label: t.stores,
      value: joinList(keys.map(key => stores[key] || key), lang)
    })
  }

  if (kind === 'privacy') {
    rows.push({ key: 'signIn', label: t.signIn, value: capability.login ? t.yes : t.no })

    if (capability.login) {
      rows.push({ key: 'scopes', label: t.scopes, value: t.scopeList })
      rows.push({ key: 'cloud', label: t.cloud, value: capability.cloudSave ? t.yes : t.no })
      rows.push({ key: 'board', label: t.board, value: capability.leaderboard ? t.yes : t.no })

      // ==========================================
      // The row that tells two games apart.
      //
      // Everything above is identical for any two games with the
      // same capability flags - which is what left Neon Katana's
      // policy and Chrono Blades' policy 99% alike even after the
      // name and package id were added.
      //
      // This is not padding to fix that number. It is the single
      // most important thing a privacy policy can say - WHICH
      // FIELDS are kept - and it genuinely differs: a game that
      // declares a `leaderboard.level` has a stage number stored
      // against it and a game that does not has no such column.
      // Chrono Blades keeps a stage and an equipped knife; Neon
      // Katana keeps neither, and its policy must not claim it
      // does.
      // ==========================================
      const kept = [t.progressScore, t.progressTime, t.progressPlays]
      const board = game.leaderboard || {}
      if (board.level) kept.push(t.progressLevel)
      if (board.item) kept.push(t.progressItem)
      if (capability.store) kept.push(t.progressItems)
      rows.push({ key: 'progress', label: t.progress, value: joinList(kept, lang) })

      rows.push({ key: 'deletion', label: t.deletion, value: t.deleteHere })
    } else {
      rows.push({ key: 'noSignIn', label: t.scopes, value: t.noSignIn })
      rows.push({ key: 'deletion', label: t.deletion, value: t.deleteMail })
    }
  }

  if (kind === 'terms') {
    rows.push({ key: 'purchases', label: t.purchases, value: capability.store ? t.yes : t.no })

    // Named, not counted. "In-app purchases: yes" is true of every
    // game with a store; the items are what these terms are
    // actually about, and they are the other thing that tells two
    // games' terms apart.
    const products = ((game.store && game.store.products) || [])
      .filter(product => product.enabled !== false)
      .map(product => (product.i18n && product.i18n.name && (product.i18n.name[lang] || product.i18n.name.en)) || '')
      .filter(Boolean)

    if (products.length) {
      rows.push({ key: 'products', label: t.products, value: joinList(products.slice(0, 6), lang) })
    }

    rows.push({ key: 'signIn', label: t.signIn, value: capability.login ? t.yes : t.no })
  }

  return {
    title: kind === 'terms' ? t.termsTitle : t.privacyTitle,
    intro: kind === 'terms' ? t.termsIntro : t.privacyIntro,
    rows
  }
}
