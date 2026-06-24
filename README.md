<!-- ==========================================
     AmirCollider - GitHub Profile README
     Special repo: AmirCollider/AmirCollider
     Theme: neon / edge dark  •  Accent: #FF5722
     Sections are marked with HTML comments for easy editing.
     ========================================== -->

<!-- ==========================================
     Header Banner
     ========================================== -->
<a href="https://github.com/AmirCollider">
  <img width="100%" src="https://capsule-render.vercel.app/api?type=waving&height=220&color=0:0b0e16,50:7b1e0a,100:FF5722&text=AmirCollider&fontColor=ffffff&fontSize=64&fontAlignY=38&desc=Game%20Developer%20%C2%B7%20Edge%20%26%20Backend%20Engineer&descSize=18&descAlignY=60&animation=fadeIn" alt="AmirCollider" />
</a>

<!-- ==========================================
     Tagline (typing animation + trilingual line)
     ========================================== -->
<div align="center">

[![Typing SVG](https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=22&pause=1000&color=FF5722&center=true&vCenter=true&width=560&lines=I+build+games+and+the+systems+behind+them;Cloudflare+Workers+%E2%80%A2+D1+%E2%80%A2+R2;Unity+%E2%80%A2+C%23+%E2%80%A2+OAuth+2.0;Trilingual+UX%3A+fa+%E2%80%A2+en+%E2%80%A2+ja)](https://git.io/typing-svg)

**سازنده‌ی بازی و سیستم‌های پشت آن** &nbsp;·&nbsp; **Games & the infrastructure behind them** &nbsp;·&nbsp; **ゲームとその裏側のシステム**

<img src="https://komarev.com/ghpvc/?username=AmirCollider&label=Profile%20views&color=FF5722&style=flat" alt="profile views" />

</div>

<!-- ==========================================
     Social / Contact badges
     TODO(amir): replace placeholders with your real links.
     ========================================== -->
<div align="center">

[![Myket](https://img.shields.io/badge/Myket-Neon%20Katana-FF5722?style=for-the-badge&logo=android&logoColor=white)](https://myket.ir/app/com.AmirColliderGames.NeonKatana)
[![Email](https://img.shields.io/badge/Email-amircollider%40yahoo.com-7b1e0a?style=for-the-badge&logo=maildotru&logoColor=white)](mailto:amircollider@yahoo.com)
<!-- [![Website](https://img.shields.io/badge/Website-amircollider.dev-0b0e16?style=for-the-badge&logo=cloudflare&logoColor=white)](https://YOUR-DOMAIN) -->
<!-- [![X](https://img.shields.io/badge/X-@handle-0b0e16?style=for-the-badge&logo=x&logoColor=white)](https://x.com/YOUR-HANDLE) -->

</div>

---

<!-- ==========================================
     About
     ========================================== -->
## ⚡ About

I'm **Amir**, the developer behind **AmirCollider Games** — I design and ship complete products end to end, from the gameplay in **Unity** to the **edge backend** that powers sign-in, leaderboards and player profiles.

- 🎮 I build **Android games** with Unity / C# and publish them.
- ☁️ I run my own **serverless auth platform** on **Cloudflare Workers + D1 + R2** — a hardened OAuth 2.0 gateway every game client talks to.
- 🔐 I care about **security by default**: HMAC-signed state, strict security headers, redacted logging and input sanitization.
- 🌍 Everything I ship is **trilingual (Persian · English · Japanese)** with correct **RTL/LTR**, light/dark/auto theming, and a custom token-based design system.
- 🧩 I like clean, modular architectures where adding a feature means editing one registry, not ten files.

---

<!-- ==========================================
     Tech Stack
     ========================================== -->
## 🛠️ Tech Stack

**Games**
<p>
  <img src="https://img.shields.io/badge/Unity-000000?style=for-the-badge&logo=unity&logoColor=white" />
  <img src="https://img.shields.io/badge/C%23-512BD4?style=for-the-badge&logo=csharp&logoColor=white" />
  <img src="https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" />
</p>

**Edge & Backend**
<p>
  <img src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflareworkers&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare%20D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare%20R2-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
</p>

**Auth & Security**
<p>
  <img src="https://img.shields.io/badge/OAuth%202.0-EB5424?style=for-the-badge&logo=auth0&logoColor=white" />
  <img src="https://img.shields.io/badge/Google%20Identity-4285F4?style=for-the-badge&logo=google&logoColor=white" />
  <img src="https://img.shields.io/badge/HMAC%20%2F%20TLS-2C3E50?style=for-the-badge&logo=letsencrypt&logoColor=white" />
</p>

**Web & Languages**
<p>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" />
  <img src="https://img.shields.io/badge/SQL-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git&logoColor=white" />
</p>

---

<!-- ==========================================
     Featured Projects
     ========================================== -->
## 🚀 Featured Projects

<!-- ---------- Project 1: OAuth Proxy ---------- -->
### 🔐 AmirCollider OAuth Proxy &nbsp;·&nbsp; `v6.7`

> A production **OAuth 2.0 authentication gateway** for game clients, running entirely at the edge on **Cloudflare Workers**. It's the single login surface that **Unity, Android, Web and Desktop (loopback)** clients all depend on.

- **Auth surface** — Google sign-in with **HMAC-signed, expiry-checked state** that can't be forged in transit; token exchange, refresh, validate and existence checks.
- **Data surface** — per-game **leaderboards** and player records backed by **Cloudflare D1**, token-guarded on every mutation.
- **Server-rendered pages** — dashboard, health, ping, metrics, leaderboard, privacy, terms, release notes and a live self-test panel — all **trilingual (fa/en/ja)** with correct **RTL/LTR**.
- **Design system** — color & spacing **tokens**, Vazirmatn + SVG icon set, **light/dark/auto** theming with persisted choice.
- **Security & ops** — strict security headers, structured **redacted logging** (no secrets, no auth codes), input sanitization and a username policy.
- **Architecture** — fully modular (`worker.js` · `config.js` · `utils.js` · `shared-styles.js` · `pages/*`). Adding a new game = one entry in `GAME_REGISTRY`.

`Cloudflare Workers` `D1` `R2` `OAuth 2.0` `Google Identity` `i18n` `Design System`

<!-- TODO(amir): point this at the real repo once it's public -->
<!-- 🔗 https://github.com/AmirCollider/REPO-NAME -->

<!-- ---------- Project 2: Neon Katana ---------- -->
### ⚔️ Neon Katana &nbsp;·&nbsp; Android Game

> A **neon action sword game** for Android, built in **Unity / C#** and published on Myket. Players sign in with Google and compete on cloud leaderboards — powered by the OAuth Proxy above.

- Fast neon-styled action combat.
- Google sign-in, cloud-saved progress and global high-score leaderboards.
- Live on the **Myket** app store.

`Unity` `C#` `Android` `Google Sign-In` `Leaderboards`

[![Get it on Myket](https://img.shields.io/badge/▶%20Play%20on%20Myket-FF5722?style=for-the-badge&logo=android&logoColor=white)](https://myket.ir/app/com.AmirColliderGames.NeonKatana)

<!-- TODO(amir): drop a logo / 2-3 screenshots / a short gameplay GIF here.
     Suggested:  <p><img src="assets/neon-katana-1.png" width="32%"/> ...</p> -->

---

<!-- ==========================================
     GitHub Stats
     ========================================== -->
## 📊 GitHub Stats

<div align="center">

<img height="165" src="https://github-readme-stats.vercel.app/api?username=AmirCollider&show_icons=true&hide_border=true&count_private=true&include_all_commits=true&theme=tokyonight&title_color=FF5722&icon_color=FF5722" alt="stats" />
<img height="165" src="https://github-readme-stats.vercel.app/api/top-langs/?username=AmirCollider&layout=compact&hide_border=true&langs_count=8&theme=tokyonight&title_color=FF5722" alt="top languages" />

<br/>

<img height="165" src="https://streak-stats.demolab.com?user=AmirCollider&hide_border=true&theme=tokyonight&ring=FF5722&fire=FF5722&currStreakLabel=FF5722" alt="streak" />

<br/><br/>

<img width="100%" src="https://github-profile-trophy.vercel.app/?username=AmirCollider&theme=tokyonight&no-frame=true&no-bg=true&column=7&margin-w=8" alt="trophies" />

<br/>

<img width="95%" src="https://github-readme-activity-graph.vercel.app/graph?username=AmirCollider&bg_color=0b0e16&color=ffffff&line=FF5722&point=ffffff&area=true&hide_border=true" alt="activity graph" />

</div>

---

<!-- ==========================================
     Footer
     ========================================== -->
<div align="center">

### Let's build something. 🎮

[![Email](https://img.shields.io/badge/amircollider@yahoo.com-FF5722?style=flat-square&logo=maildotru&logoColor=white)](mailto:amircollider@yahoo.com)

<sub>© AmirCollider Games · Built on the edge ☁️ · fa · en · ja</sub>

<img width="100%" src="https://capsule-render.vercel.app/api?type=waving&height=120&section=footer&color=0:FF5722,100:0b0e16" alt="" />

</div>
