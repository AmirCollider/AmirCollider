// ==========================================
// Content/GoogleDisclosure.js
// The "what Google sign-in is used for here" section, as TEXT.
//
// Public exports:
//   googleDisclosureDefaults(game)   -> { head, body } per language
//   googleDisclosureFor(game, lang)  -> { enabled, head, body } resolved
//
// ------------------------------------------------------------
// WHY THIS IS ITS OWN FILE
// ------------------------------------------------------------
// This copy used to live inside Pages/GameLanding.js, hard-coded
// into the one page that renders it. That was defensible while
// nothing could edit it - it is not marketing copy, it is the
// disclosure an OAuth review reads: which scopes are requested,
// what each one is actually used for, and how to withdraw
// access - but it also meant the only way to change a word of it,
// or to take the section off a game that does not want it, was a
// deploy.
//
// It is panel content now, edited in /thegod -> Game page, with a
// switch per game. So the text has to be readable from two places
// at once: the public page renders it, and the panel shows it as
// the baseline behind an empty box. One copy, imported by both,
// rather than the page owning the words and the panel owning a
// paraphrase of them that drifts on the first edit.
//
// ------------------------------------------------------------
// WHY THE DEFAULT IS BUILT, NOT STORED
// ------------------------------------------------------------
// The bullet list is derived from the same `capabilities` flags
// that decide whether the account, store and leaderboard pages
// exist at all. A game without a store must not tell a reviewer
// that purchases are tied to their account, and the only way to
// guarantee that is to never write that sentence down for a game
// that has no store. So the default is assembled per game rather
// than kept as three finished paragraphs.
//
// An operator who overrides the text takes that guarantee on
// themselves, which is the trade every other field on that tab
// already makes.
//
// ------------------------------------------------------------
// THE SHAPE OF `body`
// ------------------------------------------------------------
// Plain text, not HTML: one lede paragraph, a run of lines
// starting with "- " for the list, then a closing paragraph,
// separated by blank lines. Pages/GameLanding.js turns that into
// <p> and <ul> with one small parser, and the SAME parser renders
// an operator's own text - so what the panel shows as the
// placeholder is exactly what the page would render, character
// for character, and "edit the default" is copy, paste, change a
// word.
// ==========================================

const LANGS = ['fa', 'en', 'ja']


// ==========================================
// The words themselves
//
// `uses` is keyed by capability. Only the keys a game actually
// has are emitted, and `account` is unconditional because a game
// that can sign in has an account page by definition.
// ==========================================
const DISCLOSURE = {
  fa: {
    head: 'ورود با گوگل در این بازی برای چیست',
    lede: 'بازی بدون ورود هم کامل کار می‌کند. اگر وارد شوی، فقط این سه چیز از حساب گوگلت خوانده می‌شود: نام، نشانی ایمیل و تصویر پروفایل — یعنی همان scopeهای openid، profile و email. هیچ دسترسی دیگری به حساب گوگلت خواسته نمی‌شود.',
    uses: {
      account: 'حساب بازیکن: صفحه‌ی حساب همین سایت با همان حساب باز می‌شود و اسم نمایشی و تصویرت را از آن‌جا تنظیم می‌کنی.',
      cloudSave: 'ذخیره‌ی ابری: پیشرفت بازی روی سرور نگه داشته می‌شود تا روی دستگاه بعدی از همان‌جا ادامه بدهی.',
      leaderboard: 'جدول امتیازات: امتیاز و نام نمایشی‌ات در جدول عمومی ثبت می‌شود.',
      store: 'خریدهای درون‌برنامه‌ای: هر خرید به همان حساب بسته می‌شود تا بعد از نصب دوباره برگردد.'
    },
    after: 'دسترسی این برنامه به حساب گوگلت را هر وقت خواستی می‌توانی از myaccount.google.com/permissions پس بگیری. حذف کامل حساب و داده‌هایش هم از صفحه‌ی حساب بازیکن انجام می‌شود.'
  },
  en: {
    head: 'What Google sign-in is used for here',
    lede: 'The game works fully without signing in. If you do sign in, exactly three things are read from your Google account: your name, your email address and your profile picture — the openid, profile and email scopes. No other access to your Google account is requested.',
    uses: {
      account: 'Player account: the account page on this site opens with that same account, and your display name and picture are set from there.',
      cloudSave: 'Cloud save: your progress is kept on the server so you can carry on from the same place on your next device.',
      leaderboard: 'Leaderboard: your score and display name appear on the public board.',
      store: 'In-app purchases: each purchase is tied to that account, so it comes back after a reinstall.'
    },
    after: 'You can withdraw this app’s access to your Google account at any time at myaccount.google.com/permissions. Deleting the account and its data outright is done from the player account page.'
  },
  ja: {
    head: 'Google サインインの用途',
    lede: 'サインインしなくてもゲームはすべて遊べます。サインインした場合に Google アカウントから読み取るのは、お名前・メールアドレス・プロフィール画像の 3 つだけです(openid・profile・email スコープ)。それ以外のアクセス権は一切要求しません。',
    uses: {
      account: 'プレイヤーアカウント：同じアカウントでこのサイトのアカウントページにログインでき、表示名と画像もそこで設定します。',
      cloudSave: 'クラウドセーブ：進行状況をサーバーに保存し、次の端末でも同じ場所から続けられます。',
      leaderboard: 'ランキング：スコアと表示名が公開ランキングに掲載されます。',
      store: 'アプリ内購入：購入はそのアカウントに紐づくため、再インストール後も復元されます。'
    },
    after: '本アプリの Google アカウントへのアクセスは myaccount.google.com/permissions でいつでも取り消せます。アカウントとデータの完全な削除は、プレイヤーアカウントページから行えます。'
  }
}


// The two policy buttons under the section. Labels, not copy:
// they name pages that exist whatever the disclosure says, so
// they are not part of what the panel edits.
export const POLICY_LABELS = {
  fa: { privacy: 'سیاست حریم خصوصی', terms: 'شرایط استفاده' },
  en: { privacy: 'Privacy policy', terms: 'Terms of service' },
  ja: { privacy: 'プライバシーポリシー', terms: '利用規約' }
}


// ==========================================
// disclosureBody
// One language's default text, assembled from the game's own
// capabilities.
// ==========================================
function disclosureBody(game, lang) {
  const copy = DISCLOSURE[lang] || DISCLOSURE.fa
  const capabilities = (game && game.capabilities) || {}

  const uses = [copy.uses.account]
  if (capabilities.cloudSave) uses.push(copy.uses.cloudSave)
  if (capabilities.leaderboard) uses.push(copy.uses.leaderboard)
  if (capabilities.store) uses.push(copy.uses.store)

  return copy.lede + '\n\n'
    + uses.map(use => '- ' + use).join('\n')
    + '\n\n' + copy.after
}


// ==========================================
// googleDisclosureDefaults
// What the section says when nobody has edited it.
//
// Takes a game - merged or raw, it only reads `capabilities` -
// and returns the heading and body for all three languages. The
// panel shows these as placeholders and the page renders them
// when the stored text is empty, which is the same field-by-field
// merge every other landing section gets.
// ==========================================
export function googleDisclosureDefaults(game) {
  const head = {}
  const body = {}

  for (const lang of LANGS) {
    head[lang] = (DISCLOSURE[lang] || DISCLOSURE.fa).head
    body[lang] = disclosureBody(game, lang)
  }

  return { head, body }
}


// ==========================================
// googleDisclosureFor
// The section as one language should see it right now.
//
// `enabled` is three-way in the database and two-way here: NULL
// means nobody has decided, which is ON - a disclosure that
// disappears because a column was never written is exactly the
// failure this section exists to prevent. A game with no sign-in
// is off regardless of what the row says, because there is
// nothing to disclose.
//
// The text falls back PER LANGUAGE to the generated default, and
// deliberately not to another language's stored text the way
// pickLang() does everywhere else on the page. The two rules pull
// in opposite directions here and the difference matters: a
// tagline nobody translated is better shown in English than not
// at all, but an English disclosure on a Persian page is worse
// than the correct Persian one - which exists, is accurate by
// construction, and is one field lookup away. So an operator who
// rewrites only the English text gets their English text in
// English and the standard wording in the other two, which is the
// same field-by-field merge every other landing field gets.
// ==========================================
export function googleDisclosureFor(game, lang) {
  const stored = ((game && game.landing) || {}).google || {}
  const defaults = googleDisclosureDefaults(game)
  const code = LANGS.includes(lang) ? lang : 'fa'

  return {
    enabled: Boolean(game && game.capabilities && game.capabilities.login) && stored.enabled !== false,
    head: (stored.head && stored.head[code]) || defaults.head[code],
    body: (stored.body && stored.body[code]) || defaults.body[code],
    custom: Boolean(stored.body && (stored.body.fa || stored.body.en || stored.body.ja))
  }
}
