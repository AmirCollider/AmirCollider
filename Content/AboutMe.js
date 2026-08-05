// ==========================================
// Content/AboutMe.js
// The words on /about, in three languages.
//
// Public export:
//   ABOUT              the whole page as data, keyed by language
//   aboutFor(lang)     one language's pack
//   aboutFaq(lang)     every question and answer, flattened - for
//                      the FAQPage structured data, so the page
//                      and the markup a crawler reads can never
//                      say different things
//
// Authored data lives in Content/ on this site (the tools
// catalogue, the support templates, the Unity kit) and this is
// the same idea: Pages/About.js decides how a paragraph LOOKS,
// and nothing in it decides what a paragraph SAYS.
//
// Two rules this file follows, and they are the whole reason it
// is worth reading before editing:
//
//   • No real name, no age, no city, no photograph. Not in the
//     prose, not in a caption, not in the structured data. That
//     is the page's first sentence and it would be a strange
//     page that broke its own request one section later.
//
//   • Nothing here is rounded up. The dates are the dates, the
//     resume is as small as it is, and the reasons for both are
//     written out rather than smoothed over. A biography that
//     oversells is one somebody catches, and this one has
//     nothing to gain from it.
// ==========================================


export const ABOUT = {
  // ==========================================
  // فارسی
  // ==========================================
  fa: {
    locale: 'fa-IR',
    dir: 'rtl',

    metaTitle: 'درباره‌ی من — AmirCollider',
    metaDesc: 'AmirCollider کیست: بازی‌ساز مستقل و سازنده‌ی ابزارهای یونیتی. داستان شروع کار، چیزهایی که از دست رفت، و جواب سؤال‌هایی که شاید برایت پیش بیاید.',

    breadcrumb: 'درباره‌ی من',
    hello: 'سلام، من AmirCollider هستم!',
    role: 'بازی‌ساز مستقل · سازنده‌ی ابزارهای یونیتی · کسی که بلد نیست بس کند',
    intro: 'اینجا یک صفحه‌ی ساده و دوستانه است درباره‌ی خودم — نه رزومه، نه معرفی رسمی. فقط داستان اینکه چطور شروع شد و چرا هنوز ادامه دارد.',

    privacyTitle: 'یک خواهش کوچک، قبل از هر چیز',
    privacyBody: 'ترجیح می‌دهم اسم و سن و محل زندگی‌ام مخفی بماند. مرسی که درک می‌کنی! 🙏',
    privacyAside: 'اگر توی دنیای واقعی من را می‌شناسی — به‌عنوان همکار، فامیل، دوست یا هر چیز دیگری — و اسم و سنم را می‌دانی، خیلی خوشحال می‌شوم موقع معرفی من به بقیه فقط از اسم AmirCollider استفاده کنی.',

    storyHead: 'از کجا شروع شد',
    story: [
      'از بچگی عاشق سه چیز بودم: بازی کردن، بازی ساختن، و تولید محتوا. آن‌قدر پای گوشی و کامپیوتر بودم که کم‌کم دیگر بازی کردن برایم کافی نبود — دلم می‌خواست دنیاهای خودم را بسازم که بقیه هم از آن‌ها لذت ببرند.',
      'اما بی‌تجربه بودم، منبع آموزشی درست‌وحسابی نبود، سنم کم بود و همیشه تنهایی برای خودم کار می‌کردم. نتیجه‌اش این شد که تقریباً همه‌ی اطلاعات و نمونه‌کارهای قدیمی‌ام را از دست دادم. خیلی از چیزهایی که ساخته بودم رفتند، دوباره از صفر ساختمشان — و نسخه‌ی دوم همیشه بهتر از اولی درآمد.'
    ],

    proofHead: 'تنها چیزی که از آن روزها مانده',
    proofLede: 'از کارهای قدیمی مدرک زیادی ندارم. این‌ها تنها چیزهایی هستند که هنوز تاریخشان ثبت است — و قبل از هر دویشان هم توی یونیتی و یوتیوب کار می‌کردم، فقط چیزی برای نشان دادنش ندارم.',
    proof: [
      {
        date: '۱۱ آگوست ۲۰۲۰',
        title: 'لایسنس یونیتی‌ام',
        body: 'قدیمی‌ترین رد پایی که از کار کردنم مانده.'
      },
      {
        date: '۱۶ دسامبر ۲۰۲۰',
        title: 'اولین ویدیوی یوتیوبم',
        body: 'اولین چیزی که منتشر کردم و تاریخش هنوز هست.'
      },
      {
        date: '۲۶ دسامبر ۲۰۲۳',
        title: 'شروع دوباره‌ی یوتیوب',
        body: 'ویدیوهای قبل از این را خودم خصوصی کردم و کانال را از نو ساختم.'
      }
    ],
    proofNote: 'مدرک‌هایی از آکادمی‌های مختلف و انستیتو ملی بازی‌سازی ایران هم دارم، اما چون اسم واقعی‌ام رویشان است منتشرشان نمی‌کنم.',

    fairHead: 'سؤال‌هایی که شاید برایت پیش بیاید',
    fairLede: 'و کاملاً هم منطقی‌اند. پس جوابشان را می‌نویسم.',
    fair: [
      {
        q: 'بعد از ۶ سال فعالیت، چرا این‌قدر رزومه‌ی کوچکی داری؟',
        a: 'چون خودم خیلی چیزها را بلد نبودم، منبع آموزشی نبود، و هوش مصنوعی هم نبود که ازش کمک بگیرم. هر چیزی که الآن دارم را از صفر ساختم. خیلی از چیزهایی را که ساخته بودم از دست دادم و دوباره به دستشان آوردم — و بهتر از قبل ساختمشان.'
      },
      {
        q: 'چرا اولین ویدیوی یوتیوبت برای ۲۶ دسامبر ۲۰۲۳ است؟',
        a: 'نیست — ویدیوهای قبل از آن را خودم خصوصی کردم. کیفیتشان پایین بود و لگ داشتند، و دلم می‌خواست حرفم را دوباره و کامل بسازم.'
      },
      {
        q: 'چرا در یوتیوب کم فعالیت کردی و کنارش گذاشتی؟',
        a: 'از ۲۶ دسامبر ۲۰۲۳ که دوباره شروع کردم، سیستمم را ارتقا دادم و یک میکروفن ارزان‌قیمت هم خریدم، به امید اینکه این بار ویدیوها سالم و بدون مشکل ضبط شوند. اما سیستمم باز آن‌قدری قوی نبود که بازی‌هایی را که می‌خواهم و مردم بیشتر دوست دارند اجرا کند، و میکروفن هم کیفیت قابل قبولی نداشت. کنار این‌ها آن‌قدر مشکل عجیب‌وغریب توی زندگی بود که حتی نمی‌توانم برایت لیستشان کنم — ولی با همه‌شان کنار آمدم و ادامه دادم، تا رسیدم به اینترنت. سرعت پایینش مشکلی نداشت؛ قیمت‌هایش داشت. آن‌قدر پول ندارم که بتوانم بسته‌ی حجیم برای آپلود بگیرم :) همیشه به این کار علاقه دارم و به اولین فرصتی که بتوانم، یوتیوبم را ادامه می‌دهم.'
      }
    ],

    moreHead: 'چند سؤال دیگر',
    more: [
      {
        q: '«AmirCollider» یعنی چی؟',
        a: 'همیشه ویدیوهای ARIA KEOXER را می‌دیدم و خودم هم دنبال یک لقب بودم. یک اسم کوتاه به‌علاوه‌ی یک لقب: اسم Amir را انتخاب کردم، و Collider هم اسم یکی از بخش‌های بازی‌سازی داخل یونیتی است. یعنی از روی لقبم هم می‌شود تشخیص داد که من برنامه‌نویسی را حتی قبل از یوتیوبم انجام می‌دادم.'
      },
      {
        q: 'اولین بار کِی به ذهنت رسید که «خودم می‌خواهم بازی بسازم»؟',
        a: 'از بچگی خیلی خیلی پای گوشی و کامپیوتر بودم، و آن موقع بازی‌های زیاد و باکیفیت وجود نداشت. دلم می‌خواست دنیاهای خودم را بسازم که بقیه هم ازشان لذت ببرند. اولین بازی‌ای که می‌خواستم بسازم دقیقاً از همان‌جا آمد.'
      },
      {
        q: 'اولین موتور بازی‌سازی‌ای که استفاده کردی چه بود؟',
        a: 'یونیتی — از همان اول تا همین الآن. سبک بود و من سیستم قوی‌ای نداشتم، پس عملاً بین گزینه‌ها تنها گزینه‌ام بود.'
      },
      {
        q: 'اولین پروژه‌ای که یادت می‌آید ساختی چه بود؟',
        a: 'یک بازی پلتفرمر کوچک دوبعدی.'
      },
      {
        q: 'چرا بعد از این همه مشکل ادامه می‌دهی؟',
        a: 'من توی مغزم چیزی به اسم بس کردن وجود ندارد. همیشه ادامه می‌دهم و خودم هم نمی‌دانم چرا. انرژی مثبت زیادی درونم هست و همیشه احساس خوشحالی می‌کنم که دارم ادامه می‌دهم. عاشق بازی کردن و بازی ساختنم. فکر کنم اگر حتی هزار بار دیگر قرار بود به دنیا بیایم، باز هم AmirCollider بودن را انتخاب می‌کردم.'
      },
      {
        q: 'الآن روی چی کار می‌کنی؟ و هدفت چیست؟',
        a: 'اگر بخواهم از بازی بگویم: دارم روی یک بازی خیلی خاص کار می‌کنم که فرآیند ساخت طولانی‌ای دارد. امیدوارم آن‌قدری که می‌خواهم موفق و دیده شود؛ جزئیاتش یک سوپرایز است. و هدف کلی‌ام این است که آدم خوبی باشم. کار سختی است، اما نمی‌خواهم کسی با شنیدن اسمم ناراحت شود یا خاطره‌ی بدی سراغش بیاید. این تمام خواسته‌ی من از زندگی‌ام است.'
      },
      {
        q: 'چه چیزهایی دوست داری بسازی؟',
        a: 'واقعاً نمی‌دانم. بعضی وقت‌ها ایده‌ها بدون مقدمه می‌آیند توی ذهنم. فقط دلم می‌خواهد هر چیزی که می‌سازم باعث خوشحالی بقیه بشود.'
      }
    ],

    factsHead: 'چند حقیقت کوچک درباره‌ی من',
    facts: [
      { icon: '🎯', text: 'خیلی کمال‌گرا هستم.' },
      { icon: '🧩', text: 'همیشه می‌خواهم همه‌ی کارها را تنهایی انجام بدهم.' },
      { icon: '📺', text: 'دلم می‌خواهد انیمه و سریال ببینم، اما مغزم ناخودآگاه احساس می‌کند دارم وقتم را از دست می‌دهم — با اینکه همان وقت‌ها را توی اینستاگرام می‌چرخم و بیشترش را هدر می‌دهم!' },
      { icon: '🌱', text: 'همیشه خوشحالم تا وقتی که بقیه خوشحال باشند. ناراحتی بقیه من را هم ناراحت می‌کند. امیدوارم هیچ‌کس هیچ‌وقت توی زندگی‌اش احساس ناراحتی نکند.' }
    ],

    siteHead: 'و این سایت چیست',
    siteBody: 'هر چیزی که در amircollider.com می‌بینی — صفحه‌ی بازی‌ها، فروشگاه، جدول امتیازات، حساب بازیکن و صفحه‌های ابزارها — روی یک Cloudflare Worker اجرا می‌شود که خودم نوشته‌ام. اینجا دو چیز پیدا می‌کنی: بازی‌هایی که می‌سازم، و ابزارهایی که اول برای پروژه‌های خودم ساختم و بعد دیدم به کار بقیه هم می‌آیند.',
    siteLinks: [
      { href: '/#games', label: 'بازی‌ها' },
      { href: '/tools', label: 'ابزارها' },
      { href: '/release-notes', label: 'یادداشت‌های انتشار' }
    ],

    outro: 'مرسی که تا اینجا خواندی. 💜',
    contactHead: 'اگر حرفی داشتی',
    email: 'ایمیل'
  },


  // ==========================================
  // English
  // ==========================================
  en: {
    locale: 'en-US',
    dir: 'ltr',

    metaTitle: 'About me — AmirCollider',
    metaDesc: 'Who AmirCollider is: an indie game developer and the author of the Unity tools on this site. How it started, what got lost along the way, and honest answers to the questions people ask.',

    breadcrumb: 'About',
    hello: 'Hi, I’m AmirCollider!',
    role: 'Indie game developer · Unity tool maker · someone who does not know how to stop',
    intro: 'This is a plain, friendly page about me — not a résumé and not a formal bio. Just the story of how it started, and why it is still going.',

    privacyTitle: 'One small request, before anything else',
    privacyBody: 'I would rather keep my name, my age and where I live private. Thank you for understanding! 🙏',
    privacyAside: 'If you know me in real life — as a colleague, a relative, a friend, anything — and you know my name and age, I would be really glad if you introduced me to other people as AmirCollider and nothing else.',

    storyHead: 'Where it started',
    story: [
      'Ever since I was a kid I have loved three things: playing games, making them, and making content. I spent so much time on a phone and a computer that playing eventually stopped being enough — I wanted to build worlds of my own, ones other people could enjoy too.',
      'But I had no experience, there were no decent learning resources, I was young, and I always worked alone. The result is that I lost almost everything old — my notes and nearly all of my early work. A lot of what I had built simply went, so I built it again from nothing — and the second version always came out better than the first.'
    ],

    proofHead: 'The only paper trail left',
    proofLede: 'There is not much proof of the old work. These are the only dates I can still point at — and I was working in Unity and on YouTube before both of them, I just have nothing left to show for it.',
    proof: [
      {
        date: '11 August 2020',
        title: 'My Unity licence',
        body: 'The oldest trace of my work that still exists.'
      },
      {
        date: '16 December 2020',
        title: 'My first YouTube video',
        body: 'The first thing I published whose date is still on record.'
      },
      {
        date: '26 December 2023',
        title: 'Starting YouTube again',
        body: 'I made everything before this private and rebuilt the channel.'
      }
    ],
    proofNote: 'I also have certificates from various academies and from Iran’s National Game Development Institute, but my real name is on them, so I do not publish them.',

    fairHead: 'Questions you might have',
    fairLede: 'They are fair ones, so here are the answers.',
    fair: [
      {
        q: 'Six years in — why is your résumé so small?',
        a: 'Because there was a lot I did not know, there were no learning resources, and there was no AI to ask for help. Everything I have now, I built from zero. A lot of what I made was lost and then made again — and the second time it came out better.'
      },
      {
        q: 'Why is your first YouTube video dated 26 December 2023?',
        a: 'It is not — I made the earlier ones private myself. The quality was poor and they lagged, and I wanted to build what I had to say properly, from the start.'
      },
      {
        q: 'Why did you post so little on YouTube, and then stop?',
        a: 'When I started again on 26 December 2023 I upgraded my machine and bought a cheap microphone, hoping the videos would finally come out clean. But the machine still was not strong enough to run the games I want to play and that people most want to watch, and the microphone was not good enough either. On top of that there were more strange problems in my life than I could list for you — I made peace with all of them and kept going, right up until the internet. The slow speed was not the problem; the price was. I do not have enough money for a data plan large enough to upload on :) I still love doing this, and the first chance I get, I will carry on with YouTube.'
      }
    ],

    moreHead: 'A few more questions',
    more: [
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
      }
    ],

    factsHead: 'A few small things about me',
    facts: [
      { icon: '🎯', text: 'I am very much a perfectionist.' },
      { icon: '🧩', text: 'I always want to do everything by myself.' },
      { icon: '📺', text: 'I would love to watch anime and series, but some part of my brain insists I am wasting time — even though I spend that same time scrolling Instagram and waste far more of it!' },
      { icon: '🌱', text: 'I am happy as long as everyone else is happy. Other people being sad makes me sad. I hope nobody ever feels sad in their life.' }
    ],

    siteHead: 'And what this site is',
    siteBody: 'Everything you see on amircollider.com — the game pages, the store, the leaderboard, the player account and the tool pages — runs on a single Cloudflare Worker that I wrote myself. There are two things here: the games I make, and the tools I first built for my own projects and then found were useful to other people too.',
    siteLinks: [
      { href: '/#games', label: 'Games' },
      { href: '/tools', label: 'Tools' },
      { href: '/release-notes', label: 'Release notes' }
    ],

    outro: 'Thank you for reading this far. 💜',
    contactHead: 'If you want to say something',
    email: 'Email'
  },


  // ==========================================
  // 日本語
  // ==========================================
  ja: {
    locale: 'ja-JP',
    dir: 'ltr',

    metaTitle: '自己紹介 — AmirCollider',
    metaDesc: 'AmirCollider について。インディーゲーム開発者であり、このサイトの Unity ツールの作者です。始まりの話、失ったもの、そしてよく聞かれる質問への正直な答え。',

    breadcrumb: '自己紹介',
    hello: 'こんにちは、AmirCollider です!',
    role: 'インディーゲーム開発者 · Unity ツール作者 · やめ方を知らない人間',
    intro: '履歴書でも公式なプロフィールでもない、ふつうの自己紹介ページです。どう始まって、なぜ今も続いているのか、それだけを書きました。',

    privacyTitle: 'はじめに、ひとつだけお願い',
    privacyBody: '本名・年齢・住んでいる場所は伏せさせてください。ご理解ありがとうございます! 🙏',
    privacyAside: 'もし現実世界で私をご存じの方 — 同僚、親戚、友人、どんな関係であれ — で名前や年齢を知っている方は、他の人に紹介するときは「AmirCollider」とだけ呼んでいただけるととても嬉しいです。',

    storyHead: '始まりの話',
    story: [
      '子どもの頃から、遊ぶこと・作ること・発信することの 3 つが大好きでした。スマホとパソコンに向かう時間があまりに長くて、そのうち遊ぶだけでは足りなくなりました。自分の世界を作って、それを誰かにも楽しんでほしくなったのです。',
      'けれど経験はなく、まともな学習教材もなく、年齢も若く、いつもひとりで作っていました。その結果、昔の記録も初期の作品もほとんど失いました。作ったものの多くは消えて、またゼロから作り直しました — そして 2 度目はいつも、1 度目より良いものになりました。'
    ],

    proofHead: '当時から残っている唯一の記録',
    proofLede: '昔の仕事の証拠はほとんど残っていません。日付をたどれるのはこれだけです。この 2 つより前から Unity と YouTube を触っていましたが、見せられるものが残っていません。',
    proof: [
      {
        date: '2020年8月11日',
        title: 'Unity ライセンス',
        body: '作業していたことを示す、いちばん古い痕跡です。'
      },
      {
        date: '2020年12月16日',
        title: '最初の YouTube 動画',
        body: '公開したもののうち、日付が今も残っている最初のものです。'
      },
      {
        date: '2023年12月26日',
        title: 'YouTube の再スタート',
        body: 'それ以前の動画は自分で非公開にし、チャンネルを作り直しました。'
      }
    ],
    proofNote: '各種アカデミーやイラン国立ゲーム開発研究所の修了証もありますが、本名が記載されているため公開していません。',

    fairHead: '聞かれそうな質問',
    fairLede: 'どれも当然の疑問だと思うので、答えを書いておきます。',
    fair: [
      {
        q: '6 年もやっていて、なぜ実績がこんなに少ないのですか?',
        a: '知らないことが多く、学べる教材がなく、頼れる AI もなかったからです。今持っているものはすべてゼロから作りました。作ったものの多くを失い、そのたびに取り戻し、前より良いものにしてきました。'
      },
      {
        q: '最初の YouTube 動画が 2023年12月26日なのはなぜですか?',
        a: '実際はそうではありません。それ以前の動画は自分で非公開にしました。画質が低くカクついていたので、言いたいことをもう一度きちんと作り直したかったのです。'
      },
      {
        q: 'なぜ YouTube の投稿が少なく、そのまま止まったのですか?',
        a: '2023年12月26日に再開したとき、PC を新しくし、安価なマイクも買いました。今度こそ問題なく撮れると思ったからです。それでも PC は、自分がやりたくて視聴者も見たいゲームを動かせるほどの性能ではなく、マイクの音質も十分ではありませんでした。加えて、とても書き並べられないほど不思議な問題が生活の中にありました。それらとは折り合いをつけて続けましたが、最後に残ったのがインターネットです。速度の遅さは問題ではなく、料金が問題でした。アップロードに足りる大容量プランを買えるだけのお金がありません :) それでもこの仕事が好きなので、できる最初の機会に YouTube を再開します。'
      }
    ],

    moreHead: 'もう少し質問',
    more: [
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
      }
    ],

    factsHead: '私についての小さな事実',
    facts: [
      { icon: '🎯', text: 'かなりの完璧主義です。' },
      { icon: '🧩', text: 'いつも何でも自分ひとりでやろうとしてしまいます。' },
      { icon: '📺', text: 'アニメやドラマを見たいのに、脳が勝手に「時間を無駄にしている」と感じてしまいます。実際にはその時間で Instagram を眺めて、もっと無駄にしているのに!' },
      { icon: '🌱', text: '周りの人が幸せなら、私も幸せです。誰かが悲しんでいると私も悲しくなります。誰も人生で悲しい思いをしませんように。' }
    ],

    siteHead: 'このサイトについて',
    siteBody: 'amircollider.com で見えるもの — ゲームページ、ストア、ランキング、プレイヤーアカウント、ツールのページ — はすべて、私が書いた 1 つの Cloudflare Worker で動いています。ここにあるのは 2 つです。私が作るゲームと、もともと自分のプロジェクトのために作り、他の方にも役立つと分かったツールです。',
    siteLinks: [
      { href: '/#games', label: 'ゲーム' },
      { href: '/tools', label: 'ツール' },
      { href: '/release-notes', label: 'リリースノート' }
    ],

    outro: 'ここまで読んでくださってありがとうございます。💜',
    contactHead: '何かひとこと',
    email: 'メール'
  }
}


/** One language's pack, falling back to the site default. */
export function aboutFor(lang) {
  return ABOUT[lang] || ABOUT.fa
}


/**
 * Every question on the page, in order.
 *
 * The FAQPage node is built from this rather than from a second
 * hand-written list, because structured data that says something
 * the page does not is the one kind of markup Google penalises
 * rather than ignores.
 */
export function aboutFaq(lang) {
  const pack = aboutFor(lang)
  return [...(pack.fair || []), ...(pack.more || [])]
}
