// ==========================================
// pages/privacy.js
// Privacy Policy Page Handler
// AmirCollider Games - Worker Proxy
// ==========================================

import { CONFIG } from '../config.js'
import { getSharedCSS, getLogosHTML, getPageHead } from '../shared-styles.js'
import { validateGameId, createHtmlResponse, createErrorPage } from '../utils.js'

// ==========================================
// Route Handler
// ==========================================
export async function handlePrivacyPolicyWithGame(url, request, gameId, requestId, GAMES) {
  const game = validateGameId(gameId, GAMES)

  if (!game) {
    return createHtmlResponse(createErrorPage('بازی یافت نشد', {
      name: 'AmirCollider Games',
      icon: '🎮',
      color: '#667eea',
      logo: CONFIG.AMIR_LOGO
    }), 404)
  }

  return createHtmlResponse(createPrivacyPage(game, gameId, url.origin))
}

// ==========================================
// Date Helpers (CF Workers safe, no Intl locale dependency)
// ==========================================
function getJalaliDate(date = new Date()) {
  const gy = date.getFullYear()
  const gm = date.getMonth() + 1
  const gd = date.getDate()

  const gy2 = gy - 1600
  const gm2 = gm - 1
  const gd2 = gd - 1
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

  let gDayNo = 365 * gy2
    + Math.floor((gy2 + 3) / 4)
    - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400)

  const gDays = [31, isLeap(gy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  for (let i = 0; i < gm2; i++) gDayNo += gDays[i]
  gDayNo += gd2

  let jDayNo = gDayNo - 79
  const jNp = Math.floor(jDayNo / 12053)
  jDayNo %= 12053

  let jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461)
  jDayNo %= 1461

  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 1) / 365)
    jDayNo = (jDayNo - 1) % 365
  }

  const jDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29]
  let jm = 0
  for (; jm < 11 && jDayNo >= jDays[jm]; jm++) jDayNo -= jDays[jm]
  const jd = jDayNo + 1

  const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
                  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
  const toFa = (n) => String(n).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[x])

  return `${toFa(jd)} ${months[jm]} ${toFa(jy)}`
}

function getEnglishDate(date = new Date()) {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function getJapaneseDate(date = new Date()) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

// ==========================================
// Content Dictionary (single source of truth)
// Add or remove a language by editing this object only.
// Keys ending in body/box hold trusted authored HTML.
// ==========================================
function getStrings() {
  return {
    fa: {
      'meta.title': 'سیاست حفظ حریم خصوصی',
      'page.title': 'سیاست حفظ حریم خصوصی',
      'sec.intro.title': 'مقدمه',
      'sec.intro.body':
        '<p>ما در <strong>AmirCollider Games</strong> به حریم خصوصی شما اهمیت می‌دهیم. این سند توضیح می‌دهد چه اطلاعاتی از شما جمع‌آوری می‌شود و چگونه از آن استفاده می‌کنیم.</p>'
        + '<div class="callout callout-good"><p><strong>🔒 تعهد ما:</strong> ما هرگز اطلاعات شخصی شما را بدون رضایت شما به اشخاص ثالث نمی‌فروشیم.</p></div>',
      'sec.collect.title': 'اطلاعات جمع‌آوری شده',
      'sec.collect.body':
        '<p>هنگام استفاده از سرویس احراز هویت ما، اطلاعات زیر را دریافت می‌کنیم:</p>'
        + '<ul>'
        + '<li><strong>آدرس ایمیل:</strong> آدرس ایمیل گوگل شما</li>'
        + '<li><strong>عکس پروفایل:</strong> عکس پروفایل گوگل شما</li>'
        + '<li><strong>نام:</strong> نامی که در حساب گوگل شما ثبت شده است</li>'
        + '<li><strong>آمار بازی:</strong> امتیازات، سطح و دستاوردهای شما</li>'
        + '</ul>',
      'sec.usage.title': 'نحوه استفاده از اطلاعات',
      'sec.usage.body':
        '<p>ما از اطلاعات شما برای موارد زیر استفاده می‌کنیم:</p>'
        + '<ul>'
        + '<li>تحلیل و بهبود خدمات</li>'
        + '<li>نمایش امتیاز شما در جدول برترین‌ها</li>'
        + '<li>ذخیره پیشرفت و امتیازات بازی</li>'
        + '<li>بهبود تجربه کاربری و عملکرد بازی</li>'
        + '<li>احراز هویت و مدیریت حساب کاربری</li>'
        + '<li>ارسال اطلاعیه‌های مهم در صورت نیاز</li>'
        + '</ul>',
      'sec.security.title': 'امنیت اطلاعات',
      'sec.security.body':
        '<p>ما از پروتکل‌های امنیتی استاندارد برای محافظت از اطلاعات شما استفاده می‌کنیم:</p>'
        + '<ul>'
        + '<li><strong>پایش مستمر:</strong> نظارت ۲۴ ساعته بر امنیت سیستم</li>'
        + '<li><strong>محدودیت دسترسی:</strong> تنها کارکنان مجاز به داده‌ها دسترسی دارند</li>'
        + '<li><strong>رمزگذاری اتصالات:</strong> انتقال تمام داده‌ها با پروتکل HTTPS/TLS رمزگذاری می‌شود</li>'
        + '<li><strong>پایگاه داده Cloudflare D1:</strong> ذخیره‌سازی امن داده‌ها با پایگاه داده Cloudflare D1</li>'
        + '</ul>',
      'sec.sharing.title': 'عدم اشتراک‌گذاری اطلاعات',
      'sec.sharing.body':
        '<div class="callout callout-warn">'
        + '<p><strong>⚠️ مهم:</strong> ما هرگز اطلاعات شخصی شما را به اشخاص ثالث نمی‌فروشیم یا به اشتراک نمی‌گذاریم. تنها در موارد محدود زیر ممکن است اطلاعاتی افشا شود:</p>'
        + '<ul>'
        + '<li><strong>الزام قانونی:</strong> در صورتی که قانون یا یک دستور قانونی معتبر آن را ایجاب کند</li>'
        + '<li><strong>جلوگیری از سوءاستفاده:</strong> برای حفاظت از امنیت و یکپارچگی خدمات</li>'
        + '<li><strong>با رضایت شما:</strong> هنگامی که خودتان به‌صراحت اجازه دهید</li>'
        + '</ul>'
        + '</div>',
      'sec.cookies.title': 'کوکی‌ها و ذخیره‌سازی محلی',
      'sec.cookies.body':
        '<p>ما از کوکی‌ها برای حفظ نشست شما استفاده می‌کنیم. این کوکی‌ها:</p>'
        + '<ul>'
        + '<li>به مدت ۷ روز معتبر هستند</li>'
        + '<li>هر زمان که بخواهید قابل حذف هستند</li>'
        + '<li>هیچ اطلاعات حساسی ذخیره نمی‌کنند</li>'
        + '<li>تنها برای احراز هویت استفاده می‌شوند</li>'
        + '</ul>',
      'sec.rights.title': 'حقوق شما',
      'sec.rights.body':
        '<p>شما حق دارید:</p>'
        + '<ul>'
        + '<li><strong>حذف:</strong> حساب خود را به‌طور کامل حذف کنید</li>'
        + '<li><strong>انصراف:</strong> هر زمان از خدمات ما انصراف دهید</li>'
        + '<li><strong>انتقال داده:</strong> یک نسخه از داده‌های خود را دریافت کنید</li>'
        + '<li><strong>اصلاح:</strong> اطلاعات نادرست را اصلاح کنید</li>'
        + '<li><strong>محدودیت:</strong> پردازش داده‌های خود را محدود کنید</li>'
        + '<li><strong>دسترسی:</strong> به تمام اطلاعاتی که از شما داریم دسترسی داشته باشید</li>'
        + '</ul>',
      'sec.children.title': 'کودکان',
      'sec.children.body':
        '<p>بازی ما برای کاربران بالای <strong>۵ سال</strong> طراحی شده است. ما عمداً اطلاعات کودکان زیر ۵ سال را جمع‌آوری نمی‌کنیم. اگر متوجه شویم کودکی زیر ۵ سال ثبت‌نام کرده است، حساب او را فوراً حذف خواهیم کرد.</p>',
      'sec.intl.title': 'انتقال بین‌المللی داده',
      'sec.intl.body':
        '<p>اطلاعات شما ممکن است روی سرورهایی در کشورهای مختلف ذخیره شود. ما اطمینان می‌دهیم تمام انتقال‌های داده مطابق با استانداردهای بین‌المللی حفاظت از داده انجام می‌شود.</p>',
      'sec.changes.title': 'تغییرات در سیاست',
      'sec.changes.body':
        '<div class="callout callout-info"><p>ممکن است این سیاست را در هر زمان به‌روزرسانی کنیم. تغییرات مهم از طریق ایمیل یا اعلان درون‌بازی به اطلاع شما خواهد رسید. ادامه استفاده از سرویس پس از هر به‌روزرسانی به‌منزله پذیرش سیاست جدید است.</p></div>',
      'contact.title': 'تماس با ما',
      'contact.intro': 'در صورت هرگونه سوال درباره این سیاست، با ما تماس بگیرید:',
      'contact.game': 'بازی:',
      'contact.myket': 'صفحه مایکت:',
      'contact.myketLink': 'مشاهده در مایکت',
      'contact.email': 'ایمیل پشتیبانی:',
      'contact.web': 'وب‌سایت:',
      'footer.updated': 'آخرین به‌روزرسانی:',
      'footer.version': 'نسخه ',
      'footer.validity': 'این سند از لحظه انتشار معتبر است و برای همه کاربران لازم‌الاجرا می‌باشد.',
      'btn.home': 'بازگشت به صفحه اصلی',
      'btn.terms': 'شرایط و قوانین',
      'a11y.theme': 'تغییر تم روشن/تاریک'
    },
    en: {
      'meta.title': 'Privacy Policy',
      'page.title': 'Privacy Policy',
      'sec.intro.title': 'Introduction',
      'sec.intro.body':
        '<p>At <strong>AmirCollider Games</strong>, we take your privacy seriously. This document explains what information we collect from you and how we use it.</p>'
        + '<div class="callout callout-good"><p><strong>🔒 Our commitment:</strong> We will never sell your personal information to third parties without your consent.</p></div>',
      'sec.collect.title': 'Information We Collect',
      'sec.collect.body':
        '<p>When you use our authentication service, we receive the following information:</p>'
        + '<ul>'
        + '<li><strong>Email address:</strong> Your Google account email address</li>'
        + '<li><strong>Profile photo:</strong> Your Google account profile photo</li>'
        + '<li><strong>Name:</strong> The name associated with your Google account</li>'
        + '<li><strong>Game stats:</strong> Your scores, level, and achievements</li>'
        + '</ul>',
      'sec.usage.title': 'How We Use Your Information',
      'sec.usage.body':
        '<p>We use your information for the following purposes:</p>'
        + '<ul>'
        + '<li>Analyzing and improving our services</li>'
        + '<li>Displaying your score on leaderboards</li>'
        + '<li>Saving your game progress and scores</li>'
        + '<li>Improving user experience and game performance</li>'
        + '<li>User authentication and account management</li>'
        + '<li>Sending important notifications when necessary</li>'
        + '</ul>',
      'sec.security.title': 'Data Security',
      'sec.security.body':
        '<p>We use industry-standard security protocols to protect your information:</p>'
        + '<ul>'
        + '<li><strong>Continuous monitoring:</strong> 24/7 monitoring of system security</li>'
        + '<li><strong>Access control:</strong> Only authorized personnel can access your data</li>'
        + '<li><strong>Connection encryption:</strong> All data is encrypted in transit using HTTPS/TLS</li>'
        + '<li><strong>Cloudflare D1 database:</strong> Secure data storage powered by Cloudflare D1</li>'
        + '</ul>',
      'sec.sharing.title': 'No Data Sharing',
      'sec.sharing.body':
        '<div class="callout callout-warn">'
        + '<p><strong>⚠️ Important:</strong> We never sell or share your personal data with third parties. Information may only be disclosed in the following limited cases:</p>'
        + '<ul>'
        + '<li><strong>Legal compliance:</strong> When required by law or a valid legal request</li>'
        + '<li><strong>Abuse prevention:</strong> To protect the security and integrity of our services</li>'
        + '<li><strong>With your consent:</strong> When you explicitly authorize it</li>'
        + '</ul>'
        + '</div>',
      'sec.cookies.title': 'Cookies & Local Storage',
      'sec.cookies.body':
        '<p>We use cookies to maintain your session. These cookies:</p>'
        + '<ul>'
        + '<li>Remain valid for 7 days</li>'
        + '<li>Can be deleted by you at any time</li>'
        + '<li>Do not store any sensitive personal information</li>'
        + '<li>Are used exclusively for authentication</li>'
        + '</ul>',
      'sec.rights.title': 'Your Rights',
      'sec.rights.body':
        '<p>You have the right to:</p>'
        + '<ul>'
        + '<li><strong>Deletion:</strong> Delete your account entirely</li>'
        + '<li><strong>Opt-out:</strong> Opt out of our services at any time</li>'
        + '<li><strong>Portability:</strong> Receive a copy of your personal data</li>'
        + '<li><strong>Correction:</strong> Correct any inaccurate information</li>'
        + '<li><strong>Restriction:</strong> Restrict the processing of your data</li>'
        + '<li><strong>Access:</strong> Access all information we hold about you</li>'
        + '</ul>',
      'sec.children.title': 'Children',
      'sec.children.body':
        '<p>Our game is designed for users over the age of <strong>5</strong>. We do not knowingly collect data from children under 5. If we discover that a child under 5 has registered, we will immediately delete their account.</p>',
      'sec.intl.title': 'International Data Transfer',
      'sec.intl.body':
        '<p>Your data may be stored on servers located in different countries. We ensure all data transfers comply with international data protection standards.</p>',
      'sec.changes.title': 'Policy Changes',
      'sec.changes.body':
        '<div class="callout callout-info"><p>We may update this policy at any time. Important changes will be communicated via email or in-game notification. Continued use of the service after any update constitutes acceptance of the revised policy.</p></div>',
      'contact.title': 'Contact Us',
      'contact.intro': 'For any questions about this policy, please reach out to us:',
      'contact.game': 'Game:',
      'contact.myket': 'Myket page:',
      'contact.myketLink': 'View on Myket',
      'contact.email': 'Support email:',
      'contact.web': 'Website:',
      'footer.updated': 'Last updated:',
      'footer.version': 'Version ',
      'footer.validity': 'This document is valid from the moment of publication and is binding on all users.',
      'btn.home': 'Back to Home',
      'btn.terms': 'Terms of Service',
      'a11y.theme': 'Toggle light/dark theme'
    },
    ja: {
      'meta.title': 'プライバシーポリシー',
      'page.title': 'プライバシーポリシー',
      'sec.intro.title': 'はじめに',
      'sec.intro.body':
        '<p><strong>AmirCollider Games</strong>は、お客様のプライバシーを重視しています。本ポリシーでは、収集する情報とその利用方法について説明します。</p>'
        + '<div class="callout callout-good"><p><strong>🔒 お約束：</strong>お客様の同意なく、個人情報を第三者に販売することは決してありません。</p></div>',
      'sec.collect.title': '収集する情報',
      'sec.collect.body':
        '<p>認証サービスをご利用の際、当社は以下の情報を取得します。</p>'
        + '<ul>'
        + '<li><strong>メールアドレス：</strong>Googleアカウントのメールアドレス</li>'
        + '<li><strong>プロフィール写真：</strong>Googleアカウントのプロフィール写真</li>'
        + '<li><strong>お名前：</strong>Googleアカウントに登録された名前</li>'
        + '<li><strong>ゲーム統計：</strong>スコア、レベル、実績</li>'
        + '</ul>',
      'sec.usage.title': '情報の利用方法',
      'sec.usage.body':
        '<p>当社は以下の目的でお客様の情報を利用します。</p>'
        + '<ul>'
        + '<li>サービスの分析と改善</li>'
        + '<li>リーダーボードへのスコア表示</li>'
        + '<li>ゲームの進行状況とスコアの保存</li>'
        + '<li>ユーザー体験とゲーム性能の向上</li>'
        + '<li>認証およびアカウント管理</li>'
        + '<li>必要な場合の重要なお知らせの送信</li>'
        + '</ul>',
      'sec.security.title': 'データセキュリティ',
      'sec.security.body':
        '<p>当社は、お客様の情報を保護するために業界標準のセキュリティ対策を講じています。</p>'
        + '<ul>'
        + '<li><strong>常時監視：</strong>システムセキュリティを24時間体制で監視</li>'
        + '<li><strong>アクセス制限：</strong>権限を持つ担当者のみがデータにアクセス可能</li>'
        + '<li><strong>通信の暗号化：</strong>すべてのデータはHTTPS/TLSで暗号化して送信</li>'
        + '<li><strong>Cloudflare D1：</strong>Cloudflare D1データベースによる安全なデータ保管</li>'
        + '</ul>',
      'sec.sharing.title': 'データの非共有',
      'sec.sharing.body':
        '<div class="callout callout-warn">'
        + '<p><strong>⚠️ 重要：</strong>当社はお客様の個人情報を第三者に販売・共有しません。以下の限られた場合にのみ情報を開示することがあります。</p>'
        + '<ul>'
        + '<li><strong>法令の遵守：</strong>法律または正当な法的手続きにより求められた場合</li>'
        + '<li><strong>不正利用の防止：</strong>サービスの安全性と健全性を保護するため</li>'
        + '<li><strong>お客様の同意：</strong>お客様が明示的に許可した場合</li>'
        + '</ul>'
        + '</div>',
      'sec.cookies.title': 'Cookieとローカルストレージ',
      'sec.cookies.body':
        '<p>当社はセッションを維持するためにCookieを使用します。これらのCookieは：</p>'
        + '<ul>'
        + '<li>7日間有効です</li>'
        + '<li>いつでも削除できます</li>'
        + '<li>機密性の高い個人情報は保存しません</li>'
        + '<li>認証目的のみに使用されます</li>'
        + '</ul>',
      'sec.rights.title': 'お客様の権利',
      'sec.rights.body':
        '<p>お客様には以下の権利があります。</p>'
        + '<ul>'
        + '<li><strong>削除：</strong>アカウントを完全に削除する</li>'
        + '<li><strong>オプトアウト：</strong>いつでもサービスの利用を停止する</li>'
        + '<li><strong>データポータビリティ：</strong>個人データの写しを受け取る</li>'
        + '<li><strong>訂正：</strong>誤った情報を訂正する</li>'
        + '<li><strong>制限：</strong>個人データの処理を制限する</li>'
        + '<li><strong>アクセス：</strong>当社が保有する情報にアクセスする</li>'
        + '</ul>',
      'sec.children.title': '子どもについて',
      'sec.children.body':
        '<p>当ゲームは<strong>5歳</strong>以上の利用者を対象としています。当社は5歳未満の子どもの情報を意図的に収集しません。5歳未満の子どもが登録していると判明した場合、直ちにそのアカウントを削除します。</p>',
      'sec.intl.title': '国際的なデータ移転',
      'sec.intl.body':
        '<p>お客様のデータは、さまざまな国に所在するサーバーに保管される場合があります。当社は、すべてのデータ移転が国際的なデータ保護基準に準拠して行われることを保証します。</p>',
      'sec.changes.title': 'ポリシーの変更',
      'sec.changes.body':
        '<div class="callout callout-info"><p>当社は本ポリシーをいつでも更新することがあります。重要な変更は、メールまたはゲーム内通知でお知らせします。更新後も継続してサービスをご利用された場合、改定後のポリシーに同意したものとみなされます。</p></div>',
      'contact.title': 'お問い合わせ',
      'contact.intro': '本ポリシーに関するご質問は、以下までご連絡ください。',
      'contact.game': 'ゲーム：',
      'contact.myket': 'Myketページ：',
      'contact.myketLink': 'Myketで見る',
      'contact.email': 'サポートメール：',
      'contact.web': 'ウェブサイト：',
      'footer.updated': '最終更新：',
      'footer.version': 'バージョン ',
      'footer.validity': '本ポリシーは公開時点から有効であり、すべての利用者に適用されます。',
      'btn.home': 'ホームに戻る',
      'btn.terms': '利用規約',
      'a11y.theme': 'ライト／ダークの切り替え'
    }
  }
}

// Order in which policy sections render. Add or remove a section here.
const SECTION_ORDER = [
  { key: 'intro',    icon: '📋' },
  { key: 'collect',  icon: '📝' },
  { key: 'usage',    icon: '📊' },
  { key: 'security', icon: '🛡️' },
  { key: 'sharing',  icon: '🚫' },
  { key: 'cookies',  icon: '🍪' },
  { key: 'rights',   icon: '👤' },
  { key: 'children', icon: '👶' },
  { key: 'intl',     icon: '🌍' },
  { key: 'changes',  icon: '📄' }
]

const LANGUAGES = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' }
]

const DEFAULT_LANG = 'fa'

// ==========================================
// Page-specific Styles
// Theme via CSS variables; direction via logical properties.
// ==========================================
function getPrivacyCSS() {
  return `
    :root {
      --acg-radius: 16px;
      --acg-ease: cubic-bezier(0.22, 1, 0.36, 1);
      --acg-bg-1: var(--acg-game);
      --acg-bg-2: #20143b;
      --acg-text: rgba(255, 255, 255, 0.96);
      --acg-text-soft: rgba(255, 255, 255, 0.82);
      --acg-heading: rgba(255, 255, 255, 0.98);
      --acg-surface: rgba(255, 255, 255, 0.10);
      --acg-surface-2: rgba(0, 0, 0, 0.26);
      --acg-border: rgba(255, 255, 255, 0.22);
      --acg-rule: rgba(255, 255, 255, 0.55);
      --acg-link: #ffe082;
      --acg-link-hover: #ffffff;
      --acg-bullet: rgba(255, 255, 255, 0.85);
      --acg-shadow: 0 30px 70px rgba(0, 0, 0, 0.35);
      --acg-good-bg: rgba(76, 175, 80, 0.20);
      --acg-good-bd: rgba(120, 220, 130, 0.75);
      --acg-warn-bg: rgba(210, 30, 20, 0.24);
      --acg-warn-bd: rgba(255, 110, 100, 0.80);
      --acg-info-bg: rgba(33, 150, 243, 0.20);
      --acg-info-bd: rgba(120, 190, 255, 0.70);
      --acg-ctl-bg: rgba(0, 0, 0, 0.45);
      --acg-ctl-text: rgba(255, 255, 255, 0.92);
    }

    :root[data-theme="light"] {
      --acg-bg-1: #eef1f8;
      --acg-bg-2: #e2e7f3;
      --acg-text: #2a2f3a;
      --acg-text-soft: #4b5160;
      --acg-heading: #1d2230;
      --acg-surface: rgba(255, 255, 255, 0.80);
      --acg-surface-2: rgba(20, 24, 40, 0.05);
      --acg-border: rgba(20, 24, 40, 0.10);
      --acg-rule: var(--acg-game);
      --acg-link: #b26a00;
      --acg-link-hover: #7a4600;
      --acg-bullet: var(--acg-game);
      --acg-shadow: 0 24px 60px rgba(40, 50, 90, 0.18);
      --acg-good-bg: rgba(76, 175, 80, 0.14);
      --acg-good-bd: rgba(56, 142, 60, 0.55);
      --acg-warn-bg: rgba(229, 57, 53, 0.10);
      --acg-warn-bd: rgba(198, 40, 40, 0.55);
      --acg-info-bg: rgba(33, 150, 243, 0.10);
      --acg-info-bd: rgba(25, 118, 210, 0.45);
      --acg-ctl-bg: rgba(255, 255, 255, 0.85);
      --acg-ctl-text: #2a2f3a;
    }

    body {
      background: linear-gradient(135deg, var(--acg-bg-1), var(--acg-bg-2));
      background-attachment: fixed;
      color: var(--acg-text);
      transition: background 0.4s var(--acg-ease), color 0.3s var(--acg-ease);
    }

    .container {
      background: var(--acg-surface);
      border: 1px solid var(--acg-border);
      box-shadow: var(--acg-shadow);
      transition: background 0.4s var(--acg-ease), border-color 0.3s var(--acg-ease);
    }

    h1 {
      color: var(--acg-heading);
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
    }

    h2 {
      color: var(--acg-heading) !important;
      border-right: 0;
      border-inline-start: 5px solid var(--acg-rule);
      padding-right: 0;
      padding-inline-start: 15px;
      transition: color 0.3s var(--acg-ease), border-color 0.3s var(--acg-ease);
    }

    p, li { color: var(--acg-text); }

    a { color: var(--acg-link); transition: color 0.2s var(--acg-ease); }
    a:hover { color: var(--acg-link-hover); text-decoration: underline; }

    /* Lists: logical padding + bullets that follow text direction */
    ul { list-style: none; padding-right: 0; padding-inline-start: 28px; }
    li { position: relative; }
    li::before {
      content: "✓";
      position: absolute;
      inset-inline-start: -24px;
      color: var(--acg-bullet);
      font-weight: bold;
      font-size: 1.15em;
    }
    .list-plain { padding-inline-start: 0; }
    .list-plain li::before { content: none; }

    /* Section reveal on load */
    .policy-section {
      opacity: 0;
      transform: translateY(14px);
      animation: sectionIn 0.5s var(--acg-ease) forwards;
    }
    @keyframes sectionIn { to { opacity: 1; transform: translateY(0); } }

    /* Callout boxes (theme-aware) */
    .callout {
      border-radius: var(--acg-radius);
      padding: 18px 20px;
      margin: 20px 0;
      border: 2px solid var(--acg-border);
      background: var(--acg-surface-2);
    }
    .callout p { margin: 0; }
    .callout-good { background: var(--acg-good-bg); border-color: var(--acg-good-bd); }
    .callout-warn { background: var(--acg-warn-bg); border-color: var(--acg-warn-bd); }
    .callout-info { background: var(--acg-info-bg); border-color: var(--acg-info-bd); }

    /* Game banner */
    .game-info {
      text-align: center;
      font-size: 1.15em;
      margin-bottom: 30px;
      padding: 15px;
      background: var(--acg-surface-2);
      border-radius: var(--acg-radius);
      border: 1px solid var(--acg-border);
    }
    .game-icon {
      font-size: 1.9em;
      margin: 0 10px;
      display: inline-block;
      animation: gameBounce 2.4s ease-in-out infinite;
    }
    @keyframes gameBounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }
    .section-icon { font-size: 1.15em; }

    /* Contact + footer readability on both themes */
    .contact-info {
      background: var(--acg-info-bg) !important;
      border-color: var(--acg-info-bd) !important;
    }
    .contact-info a { color: var(--acg-link); }
    .contact-info a:hover { color: var(--acg-link-hover); }
    .last-update { border-top-color: var(--acg-border); }
    .version-badge {
      background: var(--acg-surface-2);
      color: var(--acg-heading);
      border-color: var(--acg-rule);
    }

    /* Logo row follows direction automatically */
    [dir="ltr"] .header-logos { flex-direction: row; }

    /* ==========================================
       Floating control bar: language + theme
       Anchored to the start side (left in LTR, right in RTL)
       ========================================== */
    .float-bar {
      position: fixed;
      bottom: 24px;
      inset-inline-start: 24px;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px;
      border-radius: 50px;
      background: var(--acg-ctl-bg);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid var(--acg-border);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.30);
      animation: barFloat 4s ease-in-out infinite;
    }
    @keyframes barFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }
    .lang-btn, .theme-btn {
      border: none;
      cursor: pointer;
      color: var(--acg-ctl-text);
      background: transparent;
      font-family: inherit;
      font-weight: 700;
      border-radius: 40px;
      transition: background 0.2s var(--acg-ease), transform 0.15s var(--acg-ease);
    }
    .lang-btn {
      padding: 7px 13px;
      font-size: 0.9em;
    }
    .lang-btn:hover { background: rgba(127, 127, 127, 0.20); }
    .lang-btn.is-active {
      background: var(--acg-game);
      color: #fff;
    }
    .bar-divider {
      width: 1px;
      align-self: stretch;
      margin: 4px 2px;
      background: var(--acg-border);
    }
    .theme-btn {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15em;
    }
    .theme-btn:hover { background: rgba(127, 127, 127, 0.20); transform: rotate(-12deg); }
    .theme-btn .icon-sun { display: none; }
    :root[data-theme="light"] .theme-btn .icon-sun { display: inline; }
    :root[data-theme="light"] .theme-btn .icon-moon { display: none; }

    @media (max-width: 480px) {
      .float-bar { inset-inline-start: 12px; bottom: 12px; gap: 4px; padding: 5px; }
      .lang-btn { padding: 6px 9px; font-size: 0.82em; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
      }
      .policy-section { opacity: 1; transform: none; }
    }
  `
}

// ==========================================
// Section Renderer
// ==========================================
function renderSections(t) {
  return SECTION_ORDER.map((sec, i) => {
    const delay = (0.05 + i * 0.04).toFixed(2)
    return `
    <section class="policy-section" style="animation-delay:${delay}s">
      <h2><span class="section-icon">${sec.icon}</span><span data-i18n="sec.${sec.key}.title">${t(`sec.${sec.key}.title`)}</span></h2>
      <div data-i18n-html="sec.${sec.key}.body">${t(`sec.${sec.key}.body`)}</div>
    </section>`
  }).join('\n')
}

// ==========================================
// Page Template
// ==========================================
function createPrivacyPage(game, gameId, baseUrl) {
  const amirLogo = CONFIG.AMIR_LOGO
  const gameLogo = game.logo || CONFIG.DEFAULT_GAME_LOGO
  const now = new Date()

  const strings = getStrings()
  const t = (key) => (strings[DEFAULT_LANG][key] != null ? strings[DEFAULT_LANG][key] : '')

  // Language-specific dates injected into the dictionary so switching updates them.
  const dates = { fa: getJalaliDate(now), en: getEnglishDate(now), ja: getJapaneseDate(now) }
  for (const lang of Object.keys(strings)) {
    strings[lang]['footer.updatedDate'] = dates[lang]
  }

  const i18nPayload = JSON.stringify(strings).replace(/</g, '\\u003c')

  const langButtons = LANGUAGES.map(l =>
    `<button type="button" class="lang-btn${l.code === DEFAULT_LANG ? ' is-active' : ''}" data-lang-set="${l.code}" aria-pressed="${l.code === DEFAULT_LANG}">${l.label}</button>`
  ).join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa" data-theme="dark" id="root-html">
<head>
  ${getPageHead({
    title: `${t('meta.title')} - ${game.name}`,
    amirLogo,
    description: `${t('meta.title')} ${game.name} - AmirCollider Games`
  })}
  <script>
    (function () {
      try {
        var theme = localStorage.getItem('acg_theme');
        if (!theme) {
          theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
        }
        document.documentElement.setAttribute('data-theme', theme);
        var lang = localStorage.getItem('acg_lang') || '${DEFAULT_LANG}';
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
      } catch (e) {}
    })();
  </script>
  <style>
    ${getSharedCSS(game.color)}
    ${getPrivacyCSS()}
  </style>
</head>
<body>

  <div class="float-bar" role="group" aria-label="Site controls">
    ${langButtons}
    <span class="bar-divider" aria-hidden="true"></span>
    <button type="button" class="theme-btn" id="theme-toggle" aria-label="${t('a11y.theme')}" aria-pressed="false">
      <span class="icon-moon" aria-hidden="true">🌙</span>
      <span class="icon-sun" aria-hidden="true">☀️</span>
    </button>
  </div>

  <div class="container">
    ${getLogosHTML(amirLogo, gameLogo, game.name)}

    <h1 data-i18n="page.title">${t('page.title')}</h1>

    <div class="game-info">
      <span class="game-icon">${game.icon}</span>
      <strong>${game.name}</strong>
      <span class="game-icon">${game.icon}</span>
    </div>

    ${renderSections(t)}

    <section class="policy-section" style="animation-delay:0.45s">
      <h2><span class="section-icon">📧</span><span data-i18n="contact.title">${t('contact.title')}</span></h2>
      <div class="contact-info">
        <p data-i18n="contact.intro">${t('contact.intro')}</p>
        <ul class="list-plain" style="margin-top:15px;">
          <li style="margin:12px 0;">
            <strong>🎮 <span data-i18n="contact.game">${t('contact.game')}</span></strong> ${game.name}
          </li>
          <li style="margin:12px 0;">
            <strong>🛒 <span data-i18n="contact.myket">${t('contact.myket')}</span></strong>
            <a href="${game.myketUrl}" target="_blank" rel="noopener" data-i18n="contact.myketLink">${t('contact.myketLink')}</a>
          </li>
          <li style="margin:12px 0;">
            <strong>📧 <span data-i18n="contact.email">${t('contact.email')}</span></strong>
            <a href="mailto:${CONFIG.SUPPORT_EMAIL}">${CONFIG.SUPPORT_EMAIL}</a>
          </li>
          <li style="margin:12px 0;">
            <strong>🌐 <span data-i18n="contact.web">${t('contact.web')}</span></strong>
            <a href="${baseUrl}">${baseUrl}</a>
          </li>
        </ul>
      </div>
    </section>

    <div class="last-update">
      <p>
        <span data-i18n="footer.updated">${t('footer.updated')}</span>
        <strong data-i18n="footer.updatedDate">${dates[DEFAULT_LANG]}</strong>
      </p>
      <span class="version-badge">
        <span data-i18n="footer.version">${t('footer.version')}</span>${CONFIG.VERSION}
      </span>
      <p style="margin-top:15px; font-size:0.9em;" data-i18n="footer.validity">${t('footer.validity')}</p>
    </div>

    <div class="btn-container">
      <a href="${baseUrl}" class="btn">🏠 <span data-i18n="btn.home">${t('btn.home')}</span></a>
      <a href="${baseUrl}/${gameId}/terms" class="btn btn-secondary">📋 <span data-i18n="btn.terms">${t('btn.terms')}</span></a>
    </div>
  </div>

  <script>
    (function () {
      var I18N = ${i18nPayload};
      var GAME_NAME = ${JSON.stringify(game.name)};
      var DEFAULT_LANG = '${DEFAULT_LANG}';
      var langButtons = document.querySelectorAll('[data-lang-set]');
      var themeBtn = document.getElementById('theme-toggle');

      function read(key, fallback) {
        try { var v = localStorage.getItem(key); return v == null ? fallback : v; }
        catch (e) { return fallback; }
      }
      function write(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
      }

      function applyLang(lang) {
        if (!I18N[lang]) lang = DEFAULT_LANG;
        var dict = I18N[lang];
        var root = document.documentElement;
        root.setAttribute('lang', lang);
        root.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
          var v = dict[el.getAttribute('data-i18n')];
          if (v != null) el.textContent = v;
        });
        document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
          var v = dict[el.getAttribute('data-i18n-html')];
          if (v != null) el.innerHTML = v;
        });

        if (dict['meta.title']) document.title = dict['meta.title'] + ' - ' + GAME_NAME;

        langButtons.forEach(function (btn) {
          var on = btn.getAttribute('data-lang-set') === lang;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        write('acg_lang', lang);
      }

      function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeBtn) themeBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
        write('acg_theme', theme);
      }

      langButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          applyLang(btn.getAttribute('data-lang-set'));
        });
      });

      if (themeBtn) {
        themeBtn.addEventListener('click', function () {
          var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
          applyTheme(next);
        });
      }

      applyTheme(read('acg_theme', document.documentElement.getAttribute('data-theme') || 'dark'));
      applyLang(read('acg_lang', DEFAULT_LANG));
    })();
  </script>

</body>
</html>`
}
