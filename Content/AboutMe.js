// ==========================================
// Content/AboutMe.js
// The words on /about, in three languages.
//
// Public export:
//   ABOUT              the whole page as data, keyed by language
//   aboutFor(lang)     one language's pack
//   aboutFaq(lang)     the questions, flattened - for the FAQPage
//                      structured data, so the page and the markup
//                      a crawler reads can never say different
//                      things
//
// Authored data lives in Content/ on this site (the tools
// catalogue, the support templates, the Unity kit) and this is
// the same idea: Pages/About.js decides how a paragraph LOOKS,
// and nothing in it decides what a paragraph SAYS.
//
// Four rules this file follows, and they are the whole reason it
// is worth reading before editing:
//
//   • No real name, no age, no city, no photograph. Not in the
//     prose, not in a caption, not in the structured data. That
//     is the page's first request and it would be a strange page
//     that broke its own request one section later.
//
//   • Tell it, do not defend it. An early draft asked "after six
//     years, why is your resume so small?" and then answered it.
//     Both halves of that are a page apologising for its subject.
//     The same facts are here, as a story with a beginning: the
//     resume is small because everything in it was built from
//     zero, twice.
//
//   • The voice is spoken, not written. Persian in particular:
//     می‌خوام, می‌گم, می‌شه - the way somebody actually introduces
//     themselves, not the way a form does.
//
//   • Nothing about the site's plumbing. Cloudflare, Workers, the
//     licence server - none of it belongs on a page about a
//     person. It has its own pages.
// ==========================================


import { CONFIG } from '../Config.js'


export const ABOUT = {
  // ==========================================
  // فارسی
  // ==========================================
  fa: {
    locale: 'fa-IR',
    dir: 'rtl',

    metaTitle: 'درباره‌ی من — AmirCollider',
    metaDesc: 'AmirCollider (امیر کلایدر) کیست: بازی‌ساز مستقل، سازنده‌ی ابزارهای یونیتی و سازنده‌ی همین سایت. از کجا شروع شد و چرا هنوز ادامه دارد.',

    // The page's own terms. The name's other spellings are added
    // from CONFIG.BRAND where the tag is built - see Pages/About.js.
    keywords: ['AmirCollider کیست', 'بازی‌ساز مستقل ایرانی', 'توسعه‌دهنده یونیتی', 'سازنده Neon Katana'],

    breadcrumb: 'درباره‌ی من',
    hello: 'سلام، من AmirCollider هستم!',
    role: 'بازی‌ساز مستقل · سازنده‌ی ابزارهای یونیتی · سازنده‌ی کامل سایت، مثل همینی که الآن داری می‌بینی!',
    intro: 'از بچگی بازی می‌کردم، بعد شروع کردم به ساختنشون، و از یه جایی به بعد دیگه نتونستم بس کنم.',

    privacyTitle: 'یه خواهش کوچیک، قبل از هر چیز',
    privacyBody: 'ترجیح می‌دم اسم و سن و محل زندگیم مخفی بمونه. مرسی که درک می‌کنی! 🙏',
    privacyAside: 'اگه توی دنیای واقعی من رو می‌شناسی — به‌عنوان همکار، فامیل، دوست یا هر چیز دیگه‌ای — و اسم و سنم رو می‌دونی، خیلی خوشحال می‌شم موقع معرفی من به بقیه فقط از اسم AmirCollider استفاده کنی.',

    storyHead: 'از کجا شروع شد',
    story: [
      'از بچگی عاشق سه چیز بودم: بازی کردن، بازی ساختن، و تولید محتوا. اون‌قدر پای گوشی و کامپیوتر بودم که کم‌کم دیگه بازی کردن برام کافی نبود.',
      'اون موقع بازی‌های زیاد و باکیفیتی وجود نداشت، و من دلم می‌خواست دنیاهای خودم رو بسازم — دنیاهایی که بقیه هم ازشون لذت ببرن. کل ماجرا از همون‌جا شروع شد.'
    ],

    learningHead: 'مسیر یادگیری و چالش‌ها',
    learning: [
      'بی‌تجربه بودم، منبع آموزشی درست‌وحسابی نبود، سنم کم بود و همیشه تنهایی برای خودم کار می‌کردم. هوش مصنوعی‌ای هم نبود که ازش کمک بگیرم. یعنی هر چیزی که الآن بلدم رو از صفر ساختم.',
      'هزینه‌ش هم این بود که بیشتر نمونه‌کارهای قدیمیم رو از دست دادم. خیلی از چیزهایی که ساخته بودم رفتن — و من دوباره ساختمشون. نسخه‌ی دوم همیشه بهتر از اولی درمی‌اومد.',
      'برای همین چیزی که ازم مونده کوچیکه، و اصلاً اذیتم نمی‌کنه: هر چیزی که از دست رفت، مهارت ساختنش پیش خودم موند.'
    ],

    proofHead: 'ردپای زمان',
    proofLede: 'از کارهای قدیمی مدرک زیادی ندارم. این‌ها تنها تاریخ‌هایی‌ان که هنوز ثبت‌ان — و قبل از هر دوشون هم توی یونیتی و یوتیوب کار می‌کردم، فقط چیزی برای نشون دادنش ندارم.',
    proof: [
      {
        icon: '🎮',
        date: '۱۱ آگوست ۲۰۲۰',
        title: 'لایسنس یونیتیم',
        body: 'قدیمی‌ترین ردی که از کار کردنم مونده.'
      },
      {
        icon: '🎬',
        date: '۱۶ دسامبر ۲۰۲۰',
        title: 'اولین ویدیوی یوتیوبم',
        body: 'اولین چیزی که منتشر کردم و تاریخش هنوز هست.'
      },
      {
        icon: '🔁',
        date: '۲۶ دسامبر ۲۰۲۳',
        title: 'شروع دوباره‌ی یوتیوب',
        body: 'کانال رو از نو ساختم و از این تاریخ به بعد رو نگه داشتم.'
      }
    ],
    proofNote: 'مدرک‌هایی از آکادمی‌های مختلف و انستیتو ملی بازی‌سازی ایران هم دارم، ولی چون اسم واقعیم روشونه منتشرشون نمی‌کنم.',

    youtubeHead: 'داستان یوتیوب و ارتقا',
    youtube: [
      'ویدیوهای قبل از ۲۶ دسامبر ۲۰۲۳ رو خودم خصوصی کردم. کیفیتشون پایین بود و لگ داشتن، و دلم می‌خواست حرفم رو دوباره و کامل بسازم.',
      'همون موقع سیستمم رو ارتقا دادم و یه میکروفن ارزون هم خریدم، به امید اینکه این بار ویدیوها سالم دربیان. ولی سیستم هنوز اون‌قدری قوی نبود که بازی‌هایی رو که خودم دوست دارم و مردم بیشتر می‌خوان اجرا کنه، و میکروفن هم کیفیت قابل قبولی نداشت.',
      'کنارش اون‌قدر مشکل عجیب‌وغریب توی زندگی بود که حتی نمی‌تونم لیستشون کنم. با همه‌شون کنار اومدم و ادامه دادم، تا رسیدم به اینترنت. سرعت پایینش مشکلی نداشت؛ قیمتش داشت. اون‌قدر پول ندارم که بتونم بسته‌ی حجیم برای آپلود بگیرم :)',
      'هنوز عاشق این کارم، و اولین فرصتی که پیش بیاد یوتیوبم رو ادامه می‌دم.'
    ],

    askHead: 'چیزهایی که ازم می‌پرسن',
    ask: [
      {
        q: '«AmirCollider» یعنی چی؟',
        a: 'همیشه ویدیوهای ARIA KEOXER رو می‌دیدم و خودمم دنبال یه لقب بودم. یه اسم کوتاه به‌علاوه‌ی یه لقب: اسم Amir رو انتخاب کردم، و Collider هم اسم یکی از بخش‌های بازی‌سازی داخل یونیتیه. یعنی از روی لقبمم می‌شه فهمید که قبل از یوتیوب هم برنامه‌نویسی می‌کردم.'
      },
      {
        q: 'اولین بار کِی به ذهنت رسید که «خودم می‌خوام بازی بسازم»؟',
        a: 'از بچگی خیلی خیلی پای گوشی و کامپیوتر بودم، و اون موقع بازی‌های زیاد و باکیفیت وجود نداشت. دلم می‌خواست دنیاهای خودم رو بسازم که بقیه هم ازشون لذت ببرن. اولین بازی‌ای که می‌خواستم بسازم دقیقاً از همون‌جا اومد.'
      },
      {
        q: 'اولین موتور بازی‌سازی‌ای که استفاده کردی چی بود؟',
        a: 'یونیتی — از همون اول تا همین الآن. سبک بود و من سیستم قوی‌ای نداشتم، پس عملاً بین گزینه‌ها تنها گزینه‌م بود.'
      },
      {
        q: 'اولین پروژه‌ای که یادت می‌آد ساختی چی بود؟',
        a: 'یه بازی پلتفرمر کوچیک دوبعدی.'
      },
      {
        q: 'چرا بعد از این همه مشکل ادامه می‌دی؟',
        a: 'من توی مغزم چیزی به اسم بس کردن وجود نداره. همیشه ادامه می‌دم و خودمم نمی‌دونم چرا. انرژی مثبت زیادی درونمه و همیشه احساس خوشحالی می‌کنم که دارم ادامه می‌دم. عاشق بازی کردن و بازی ساختنم. فکر کنم اگه حتی هزار بار دیگه قرار بود به دنیا بیام، باز هم AmirCollider بودن رو انتخاب می‌کردم.'
      },
      {
        q: 'الآن روی چی کار می‌کنی؟ و هدفت چیه؟',
        a: 'اگه بخوام از بازی بگم: دارم روی یه بازی خیلی خاص کار می‌کنم که فرآیند ساخت طولانی‌ای داره. امیدوارم اون‌قدری که می‌خوام موفق و دیده بشه؛ جزئیاتش یه سوپرایزه. و هدف کلیم اینه که آدم خوبی باشم. کار سختیه، اما نمی‌خوام کسی با شنیدن اسمم ناراحت بشه یا خاطره‌ی بدی سراغش بیاد. این تمام خواسته‌ی من از زندگیمه.'
      },
      {
        q: 'چه چیزهایی دوست داری بسازی؟',
        a: 'واقعاً نمی‌دونم. بعضی وقت‌ها ایده‌ها بدون مقدمه می‌آن توی ذهنم. فقط دلم می‌خواد هر چیزی که می‌سازم باعث خوشحالی بقیه بشه.'
      },
      {
        q: 'اسمت رو AmirCollider می‌نویسی یا Amir Collider؟',
        a: 'یک کلمه، بدون فاصله: AmirCollider. ولی خیلی‌ها جدا می‌نویسنش — Amir Collider — و هر دوش من هستم. اگه یه جایی دنبالم گشتی و پیدام نکردی، معمولاً همون یه فاصله دلیلشه.'
      },
      {
        q: 'اسمت به فارسی و ژاپنی چطور نوشته می‌شه؟',
        a: 'به فارسی می‌شه «امیر کلایدر» — کِلایدر، نه کولایدر — و سرِ هم هم همون «امیرکلایدر» است. به ژاپنی می‌شه «アミールコライダー». همه‌ی این‌ها یک نفرن و یک سایت: {aliases}. اسم اصلی و رسمی همون AmirCollider لاتینه؛ بقیه همون اسمن به خط‌های دیگه.'
      },
      {
        q: 'اگه اسمت رو اشتباه بنویسم چی؟ مثلاً {typo1} یا {typo3}',
        a: 'پیدام می‌کنی، نگران نباش. بیشترین اشتباهی که می‌بینم یکی از دو تا l افتاده — {typo1} — یا حرف آخر عوض شده و {typo2} نوشته شده. به فارسی هم خیلی‌ها {typo3} می‌نویسن، چون «collider» توی فیزیک کولایدر خونده می‌شه؛ ولی اسم من کِلایدره. املای درستش AmirCollider است: یک کلمه، دو تا l، و «collider» دقیقاً همون اسم کامپوننته توی یونیتی — برای همین هم انتخابش کردم.'
      }
    ],

    factsHead: 'چند حقیقت کوچیک درباره‌ی من',
    facts: [
      { icon: '🎯', text: 'خیلی کمال‌گرام.' },
      { icon: '🧩', text: 'همیشه دلم می‌خواد همه‌ی کارها رو تنهایی انجام بدم.' },
      { icon: '📺', text: 'دلم می‌خواد انیمه و سریال ببینم، ولی مغزم ناخودآگاه حس می‌کنه دارم وقتم رو از دست می‌دم — با اینکه همون وقت‌ها رو توی اینستاگرام می‌چرخم و بیشترش رو هدر می‌دم!' },
      { icon: '🌱', text: 'همیشه خوشحالم تا وقتی بقیه خوشحال باشن. ناراحتی بقیه من رو هم ناراحت می‌کنه. امیدوارم هیچ‌کس هیچ‌وقت توی زندگیش احساس ناراحتی نکنه.' }
    ],

    findHead: 'کجا پیدام کنی',
    findLede: 'کارهای در جریان، تیزرها و هر چیزی که ارزش نشون دادن داشته باشه رو این‌جاها می‌ذارم.',

    supportHead: 'اگه دوست داشتی حمایت کنی',
    supportBody: 'همه‌ی بازی‌ها و ابزارهای این‌جا رایگانن و همین‌طور می‌مونن. اگه یکیشون به کارت اومد و دوست داشتی جبران کنی، یه صفحه‌ی کوچیک برای همین هست — با هر مبلغی که خودت بخوای. هیچ‌چیزی پشتش قفل نیست؛ فقط اگه دلت خواست.',
    supportCta: 'صفحه‌ی حمایت مالی',

    outro: 'مرسی که تا اینجا خوندی. 💜'
  },


  // ==========================================
  // English
  // ==========================================
  en: {
    locale: 'en-US',
    dir: 'ltr',

    metaTitle: 'About me — AmirCollider',
    metaDesc: 'Who AmirCollider (Amir Collider) is: an indie game developer, the author of the Unity tools on this site, and the person who built the site. How it started.',
    keywords: ['who is AmirCollider', 'indie game developer', 'Unity developer', 'Neon Katana developer'],

    breadcrumb: 'About',
    hello: 'Hi, I’m AmirCollider!',
    role: 'Indie game developer · Unity tool maker · built this whole site, the one you are looking at right now!',
    intro: 'I played games as a kid, then I started making them, and at some point I simply could not stop.',

    privacyTitle: 'One small request, before anything else',
    privacyBody: 'I would rather keep my name, my age and where I live private. Thank you for understanding! 🙏',
    privacyAside: 'If you know me in real life — as a colleague, a relative, a friend, anything — and you know my name and age, I would be really glad if you introduced me to other people as AmirCollider and nothing else.',

    storyHead: 'Where it started',
    story: [
      'Ever since I was a kid I have loved three things: playing games, making them, and making content. I spent so much time on a phone and a computer that playing eventually stopped being enough.',
      'There were not many good games around back then, and I wanted to build worlds of my own — ones other people would enjoy too. The whole thing started right there.'
    ],

    learningHead: 'Learning it, and what it cost',
    learning: [
      'I had no experience, there were no decent learning resources, I was young, and I always worked alone. There was no AI to ask for help either. Which means everything I know now, I built from zero.',
      'The price was that I lost most of my early work. A lot of what I had built simply went — and I built it again. The second version always came out better than the first.',
      'So what is left of it is small, and that does not bother me at all: whatever was lost, the ability to make it stayed with me.'
    ],

    proofHead: 'A trail of dates',
    proofLede: 'There is not much proof of the old work. These are the only dates still on record — and I was working in Unity and on YouTube before both of them, I just have nothing left to show for it.',
    proof: [
      {
        icon: '🎮',
        date: '11 August 2020',
        title: 'My Unity licence',
        body: 'The oldest trace of my work that still exists.'
      },
      {
        icon: '🎬',
        date: '16 December 2020',
        title: 'My first YouTube video',
        body: 'The first thing I published whose date is still on record.'
      },
      {
        icon: '🔁',
        date: '26 December 2023',
        title: 'Starting YouTube again',
        body: 'I rebuilt the channel and kept everything from this date onward.'
      }
    ],
    proofNote: 'I also have certificates from various academies and from Iran’s National Game Development Institute, but my real name is on them, so I do not publish them.',

    youtubeHead: 'The YouTube story',
    youtube: [
      'I made the videos before 26 December 2023 private myself. The quality was poor and they lagged, and I wanted to build what I had to say properly, from the start.',
      'At the same time I upgraded my machine and bought a cheap microphone, hoping the videos would finally come out clean. But the machine still was not strong enough to run the games I want to play and that people most want to watch, and the microphone was not good enough either.',
      'On top of that there were more strange problems in my life than I could list for you. I made peace with all of them and kept going, right up until the internet. The slow speed was not the problem; the price was. I do not have enough money for a data plan large enough to upload on :)',
      'I still love doing this, and the first chance I get, I will carry on with YouTube.'
    ],

    askHead: 'Things people ask me',
    ask: [
      {
        q: 'What does “AmirCollider” mean?',
        a: 'I always watched ARIA KEOXER’s videos and I was looking for a handle of my own. A short name plus a tag: I picked Amir for the name, and Collider is the name of one of the game-making pieces inside Unity. So you can tell from the handle alone that I was already programming before I started on YouTube.'
      },
      {
        q: 'When did “I want to make games myself” first occur to you?',
        a: 'I spent an enormous amount of time on a phone and a computer as a child, and back then there were not many good games around. I wanted to build my own worlds, ones other people would enjoy. The first game I ever wanted to make came straight out of that.'
      },
      {
        q: 'What was the first engine you used?',
        a: 'Unity — from the very beginning to right now. It was light and I did not have a strong machine, so in practice it was not a choice between options; it was the only option I had.'
      },
      {
        q: 'What is the first project you remember building?',
        a: 'A small 2D platformer.'
      },
      {
        q: 'After all these problems, why do you keep going?',
        a: 'There is no such thing as stopping in my head. I always keep going and I do not know why. There is a lot of positive energy in me and I always feel happy that I am still at it. I love playing games and I love making them. I think that if I were born a thousand more times, I would choose to be AmirCollider every single time.'
      },
      {
        q: 'What are you working on now, and what is the goal?',
        a: 'If we are talking about games: I am working on a very particular one with a long build process. I hope it does as well and gets seen as much as I want it to — the details are a surprise. And the wider goal is to be a good person. That is hard work, but I do not want anyone to feel bad, or to remember something bad, when they hear my name. That is the whole of what I want out of my life.'
      },
      {
        q: 'What kinds of things do you like to make?',
        a: 'I honestly do not know. Sometimes ideas just arrive in my head with no warning. I only want whatever I make to make other people happy.'
      },
      {
        q: 'Is it AmirCollider or Amir Collider?',
        a: 'One word, no space: AmirCollider. But a lot of people write it as two — Amir Collider — and both of them are me. If you have looked for me somewhere and come up empty, that single space is usually the reason.'
      },
      {
        q: 'How is the name written in Persian and Japanese?',
        a: 'In Persian it is «امیر کلایدر» — kolayder, not koolayder — and «امیرکلایدر» joined up. In Japanese it is «アミールコライダー». All of these are one person and one site: {aliases}. The official spelling is the Latin one, AmirCollider; the rest are the same name in another script.'
      },
      {
        q: 'What if I spell it wrong — {typo1}, {typo3}?',
        a: 'You will still find me. The mistake I see most is a dropped L — {typo1} — or the last vowel swapped, giving {typo2}. In Persian a lot of people write {typo3}, because “collider” as the physics term is read koolayder there; my name is kolayder. The correct spelling is AmirCollider: one word, two Ls, and “collider” exactly as Unity spells its component — which is why I picked it.'
      }
    ],

    factsHead: 'A few small things about me',
    facts: [
      { icon: '🎯', text: 'I am very much a perfectionist.' },
      { icon: '🧩', text: 'I always want to do everything by myself.' },
      { icon: '📺', text: 'I would love to watch anime and series, but some part of my brain insists I am wasting time — even though I spend that same time scrolling Instagram and waste far more of it!' },
      { icon: '🌱', text: 'I am happy as long as everyone else is happy. Other people being sad makes me sad. I hope nobody ever feels sad in their life.' }
    ],

    findHead: 'Where to find me',
    findLede: 'Work in progress, trailers and anything else worth showing goes up in these places.',

    supportHead: 'If you feel like supporting it',
    supportBody: 'Every game and every tool here is free and is staying that way. If one of them was useful to you and you feel like giving something back, there is a small page for exactly that — any amount you like. Nothing is locked behind it; it is only there if you want it.',
    supportCta: 'The donation page',

    outro: 'Thank you for reading this far. 💜'
  },


  // ==========================================
  // 日本語
  // ==========================================
  ja: {
    locale: 'ja-JP',
    dir: 'ltr',

    metaTitle: '自己紹介 — AmirCollider',
    metaDesc: 'AmirCollider (アミールコライダー) について。インディーゲーム開発者であり、このサイトの Unity ツールの作者であり、サイト自体も自作しています。',
    keywords: ['AmirCollider とは', 'インディーゲーム開発者', 'Unity 開発者', 'Neon Katana 開発者'],

    breadcrumb: '自己紹介',
    hello: 'こんにちは、AmirCollider です!',
    role: 'インディーゲーム開発者 · Unity ツール作者 · 今ご覧のこのサイトも、全部ひとりで作りました!',
    intro: '子どもの頃はゲームで遊んでいて、そのうち作る側になって、気づいたらもうやめられなくなっていました。',

    privacyTitle: 'はじめに、ひとつだけお願い',
    privacyBody: '本名・年齢・住んでいる場所は伏せさせてください。ご理解ありがとうございます! 🙏',
    privacyAside: 'もし現実世界で私をご存じの方 — 同僚、親戚、友人、どんな関係であれ — で名前や年齢を知っている方は、他の人に紹介するときは「AmirCollider」とだけ呼んでいただけるととても嬉しいです。',

    storyHead: '始まりの話',
    story: [
      '子どもの頃から、遊ぶこと・作ること・発信することの 3 つが大好きでした。スマホとパソコンに向かう時間があまりに長くて、そのうち遊ぶだけでは足りなくなりました。',
      '当時は良いゲームが多くなくて、自分の世界を作りたくなったんです。誰かにも楽しんでもらえる世界を。すべてはそこから始まりました。'
    ],

    learningHead: '学びの道のりと、その代償',
    learning: [
      '経験はなく、まともな学習教材もなく、年齢も若く、いつもひとりで作っていました。頼れる AI もありませんでした。つまり今できることは、すべてゼロから身につけたものです。',
      'その代償として、初期の作品はほとんど失いました。作ったものの多くは消えて、私はまた作り直しました。2 度目はいつも、1 度目より良いものになりました。',
      'だから手元に残っているものは少ないのですが、それは気になりません。失われても、作る力のほうは自分の中に残ったからです。'
    ],

    proofHead: '時間の足あと',
    proofLede: '昔の仕事の証拠はほとんど残っていません。記録が残っているのはこれだけです。この 2 つより前から Unity と YouTube を触っていましたが、見せられるものが残っていません。',
    proof: [
      {
        icon: '🎮',
        date: '2020年8月11日',
        title: 'Unity ライセンス',
        body: '作業していたことを示す、いちばん古い痕跡です。'
      },
      {
        icon: '🎬',
        date: '2020年12月16日',
        title: '最初の YouTube 動画',
        body: '公開したもののうち、日付が今も残っている最初のものです。'
      },
      {
        icon: '🔁',
        date: '2023年12月26日',
        title: 'YouTube の再スタート',
        body: 'チャンネルを作り直し、この日以降を残しています。'
      }
    ],
    proofNote: '各種アカデミーやイラン国立ゲーム開発研究所の修了証もありますが、本名が記載されているため公開していません。',

    youtubeHead: 'YouTube の話',
    youtube: [
      '2023年12月26日より前の動画は、自分で非公開にしました。画質が低くカクついていたので、言いたいことをもう一度きちんと作り直したかったのです。',
      '同じ時期に PC を新しくし、安価なマイクも買いました。今度こそきれいに撮れると思ったからです。それでも PC は、自分がやりたくて視聴者も見たいゲームを動かせるほどの性能ではなく、マイクの音質も十分ではありませんでした。',
      '加えて、とても書き並べられないほど不思議な問題が生活の中にありました。それらとは折り合いをつけて続けましたが、最後に残ったのがインターネットです。速度の遅さは問題ではなく、料金が問題でした。アップロードに足りる大容量プランを買えるだけのお金がありません :)',
      'それでもこの活動が好きなので、できる最初の機会に YouTube を再開します。'
    ],

    askHead: 'よく聞かれること',
    ask: [
      {
        q: '「AmirCollider」の意味は?',
        a: 'ARIA KEOXER さんの動画をいつも見ていて、自分にもハンドルネームが欲しくなりました。短い名前 + 呼び名という形で、名前は Amir を選び、Collider は Unity のゲーム制作で使う要素の名前です。つまりこの名前だけで、YouTube を始める前からプログラミングをしていたことが分かります。'
      },
      {
        q: '「自分でゲームを作りたい」と最初に思ったのはいつですか?',
        a: '子どもの頃、スマホとパソコンに向かう時間が本当に長く、当時は良いゲームが多くありませんでした。自分の世界を作って、他の人にも楽しんでほしいと思ったのです。最初に作りたかったゲームは、まさにそこから生まれました。'
      },
      {
        q: '最初に使ったゲームエンジンは?',
        a: 'Unity です。最初から今までずっと。軽く、当時の私は高性能な PC を持っていなかったので、選択肢の中から選んだというより、唯一の選択肢でした。'
      },
      {
        q: '覚えている最初のプロジェクトは?',
        a: '小さな 2D プラットフォーマーです。'
      },
      {
        q: 'これだけ問題があっても続けるのはなぜですか?',
        a: '私の頭の中には「やめる」という選択肢がありません。いつも続けてしまうし、その理由は自分でも分かりません。前向きなエネルギーが多く、続けていること自体がいつも嬉しいのです。遊ぶのも作るのも大好きです。もし千回生まれ変わっても、毎回 AmirCollider であることを選ぶと思います。'
      },
      {
        q: '今は何を作っていますか? 目標は?',
        a: 'ゲームの話なら、制作期間の長い、とても特別な一本に取り組んでいます。望むだけの成果と注目を得られたらと思っています。詳細はお楽しみに。もっと広い目標は、良い人間でいることです。難しいことですが、私の名前を聞いて嫌な気持ちや悪い記憶がよみがえる人を作りたくありません。人生に望むことはそれだけです。'
      },
      {
        q: 'どんなものを作るのが好きですか?',
        a: '正直に言うと分かりません。ときどき、前触れもなくアイデアが浮かんできます。ただ、自分が作るもので誰かが幸せになってくれたら、それでいいのです。'
      },
      {
        q: '表記は AmirCollider ですか、Amir Collider ですか?',
        a: 'スペースなしの一語で AmirCollider です。ただ、Amir Collider と二語で書く人も多く、どちらも私のことです。どこかで探して見つからなかったとしたら、たいていはその空白が原因です。'
      },
      {
        q: '日本語やペルシア語ではどう書きますか?',
        a: '日本語では「アミールコライダー」(「アミール・コライダー」と中黒を入れる書き方もあります)、ペルシア語では「امیر کلایدر」(コラユデルではなくクラユデル) です。いずれも同じ一人、同じサイトを指します: {aliases}。正式な表記はラテン文字の AmirCollider で、ほかは同じ名前を別の文字で書いたものです。'
      },
      {
        q: 'つづりを間違えたら見つかりませんか? ({typo1} など)',
        a: '見つかります。いちばん多いのは L が一つ抜けた {typo1} と、最後の母音が変わった {typo2} です。ペルシア語では {typo3} と書かれがちですが (物理用語の collider の読みに引かれるためです)、正しくは کلایدر です。正しいつづりは AmirCollider — 一語、L は二つ、"collider" は Unity のコンポーネント名そのままです。'
      }
    ],

    factsHead: '私についての小さな事実',
    facts: [
      { icon: '🎯', text: 'かなりの完璧主義です。' },
      { icon: '🧩', text: 'いつも何でも自分ひとりでやろうとしてしまいます。' },
      { icon: '📺', text: 'アニメやドラマを見たいのに、脳が勝手に「時間を無駄にしている」と感じてしまいます。実際にはその時間で Instagram を眺めて、もっと無駄にしているのに!' },
      { icon: '🌱', text: '周りの人が幸せなら、私も幸せです。誰かが悲しんでいると私も悲しくなります。誰も人生で悲しい思いをしませんように。' }
    ],

    findHead: '見つけられる場所',
    findLede: '制作中の様子やトレーラー、見せる価値のあるものはこれらの場所に上げています。',

    supportHead: 'もし支援したいと思ってくれたら',
    supportBody: 'ここにあるゲームもツールもすべて無料で、これからも変わりません。どれかが役に立って、何か返したいと思ってくれたなら、そのための小さなページがあります。金額はお好きなだけです。何かが制限されるわけではなく、望む人のためだけにあります。',
    supportCta: '支援ページ',

    outro: 'ここまで読んでくださってありがとうございます。💜'
  }
}


// ==========================================
// The name, filled in from CONFIG.BRAND.
//
// Three of the questions above answer "what is this name, and what
// if I write it differently", and the answers name every form of
// it: the Persian and Japanese spellings, and the spellings people
// get wrong. Those two lists live in Config.js because the
// structured data, the footer and this page all need them, and a
// second copy typed out here is a second copy that goes stale the
// first time one is edited.
//
// So the answers carry {aliases} and {typos} and this fills them
// in. It is also the reason this is the ONLY place misspellings
// appear on the site: written out as prose in an answer to the
// question "what if I spell it wrong", they are a real answer a
// search engine can learn a correction from. The same list in a
// meta tag, or claimed as an alternateName, would be neither
// honest nor useful.
// ==========================================
function fillBrand(text) {
  const brand = CONFIG.BRAND || {}
  // Named, not indexed. Taking these by position out of
  // MISSPELLINGS is what the previous version did, and it broke
  // silently when that list was reordered - the sentence saying
  // "one L dropped" printed a Persian spelling.
  const shown = brand.TYPOS_SHOWN || {}

  return String(text || '')
    // A middle dot rather than a comma: the alias list mixes Latin,
    // Persian and Japanese runs, and a comma is a different
    // character in each of them. A dot with spaces around it
    // separates them all without belonging to any.
    //
    // These ARE all genuine names for one thing, so listing them
    // is a list of names. The misspellings below are not, and they
    // are handled completely differently.
    .replace('{aliases}', (brand.ALIASES || []).join(' · '))

    // ==========================================
    // Three slots, in sentences. Not a list.
    //
    // The first version of this answer dropped all fourteen
    // misspellings into one line separated by middots, and that is
    // a keyword-stuffed page by Google's own definition - their
    // spam policy names "lists or groups of keywords, out of
    // context" as the pattern, and a run of fourteen near-identical
    // strings is precisely that shape whether or not the intent
    // was innocent.
    //
    // Three, each in a sentence that says WHY it is a common
    // mistake, is a real answer to a real question. It is also the
    // better signal: what teaches a search engine a spelling
    // correction is the wrong form appearing next to the right one
    // in ordinary prose, which is what this now is. The other
    // eleven stay in CONFIG.BRAND.MISSPELLINGS - they are the
    // reference list for whoever maintains this, and they are not
    // published anywhere.
    // ==========================================
    .replace('{typo1}', shown.droppedL || '')
    .replace('{typo2}', shown.swappedVowel || '')
    .replace('{typo3}', shown.persian || '')
}


/** One language's pack, falling back to the site default. */
export function aboutFor(lang) {
  const pack = ABOUT[lang] || ABOUT.fa

  // Only `ask` carries a placeholder, so only `ask` is rebuilt.
  // Copying the whole pack every call would be a new object for
  // every render of a page whose content never changes.
  // Both halves. The question used to be left alone, which is how
  // the English one came to name "AmirCollidor" - a fourth
  // misspelling, published, that TYPOS_SHOWN did not know about
  // and the answer did not explain. Scripts/CheckBrandCoverage.mjs
  // caught it as a leak.
  return {
    ...pack,
    ask: (pack.ask || []).map(entry => ({ q: fillBrand(entry.q), a: fillBrand(entry.a) }))
  }
}


/**
 * Every question on the page, in order.
 *
 * The FAQPage node is built from this rather than from a second
 * hand-written list, because structured data that says something
 * the page does not is the one kind of markup Google penalises
 * rather than ignores. The narrative sections are deliberately
 * absent: they are prose, not questions, and dressing them up as
 * a Q&A for a crawler would be exactly that kind of markup.
 */
export function aboutFaq(lang) {
  return aboutFor(lang).ask || []
}
