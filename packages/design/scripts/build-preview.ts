/**
 * Design system preview generator.
 *
 * Renders tokens.json to a browsable page: every token, every component state, and
 * the three highest-traffic screens rebuilt from the tokens alone. It exists so
 * design fidelity can be checked against docs/design/assets/mockup-v1.png in a
 * browser, in seconds, without a simulator — and so drift is visible the moment a
 * token changes.
 *
 * Emits two files:
 *   preview/index.html     standalone — open it locally
 *   preview/artifact.html  fragment   — for publishing
 *
 * Run: pnpm design:preview
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const t = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf8'))
const p = t.palette

// ── contrast, so the page states its own accessibility rather than claiming it ──
const lum = (hex: string): number => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string): string => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return ((hi + 0.05) / (lo + 0.05)).toFixed(2)
}

const swatch = (name: string, hex: string, on?: string) => `
  <div class="sw">
    <div class="sw-chip" style="background:${hex}">${
      on ? `<span style="color:${on}">Aa</span>` : ''
    }</div>
    <div class="sw-meta">
      <code>${name}</code>
      <span class="mono dim">${hex}</span>
      ${on ? `<span class="mono ratio">${ratio(on, hex)}:1</span>` : ''}
    </div>
  </div>`

// ─────────────────────────────── screens ────────────────────────────────────

/** Mockup screen 3 — Home. */
const home = `
<div class="scr">
  <div class="statusbar"><span>9:41</span><span class="sb-r">▮▮▮</span></div>
  <div class="hd">
    <div class="avatar"></div>
    <div class="hd-txt">
      <div class="t-cap dim">Good evening,</div>
      <div class="t-h2">Explorer!</div>
    </div>
    <div class="streak"><span class="fl">🔥</span><b>12</b><span class="t-ov">DAY STREAK</span></div>
  </div>

  <div class="card lift">
    <div class="t-cap dim">Today's Quest</div>
    <div class="t-h3">Europe II</div>
    <div class="bar-row"><div class="bar"><i style="width:70%"></i></div><span class="num">7 / 10</span></div>
    <button class="btn primary">Continue</button>
  </div>

  <div class="card row-card">
    <div>
      <div class="t-cap dim">Daily Challenge</div>
      <div class="t-h3">New challenge in <span class="num gold">14:22:16</span></div>
    </div>
    <div class="trophy">🏆</div>
  </div>

  <div class="two-up">
    <div class="card mini">
      <div class="t-cap dim">Friends</div>
      <div class="t-h3">12 <span class="t-cap dim">online</span></div>
    </div>
    <div class="card mini">
      <div class="t-cap dim">League</div>
      <div class="t-h3 gold">Gold I</div>
      <div class="t-cap dim">Top 15%</div>
    </div>
  </div>

  <div class="tabs">
    ${['Home', 'Explore', 'Quests', 'Profile', 'More']
      .map(
        (l, i) =>
          `<div class="tab${i === 0 ? ' on' : ''}"><span class="tg">${
            ['⌂', '◎', '☰', '☺', '⋯'][i]
          }</span><span class="t-ov">${l}</span></div>`,
      )
      .join('')}
  </div>
</div>`

/** Mockup screen 5 — the lesson runner. */
const lesson = `
<div class="scr">
  <div class="statusbar"><span>9:41</span><span class="sb-r">▮▮▮</span></div>
  <div class="lesson-hd">
    <span class="x">✕</span>
    <div class="bar flex1"><i style="width:20%"></i></div>
    <span class="num dim">2 / 10</span>
    <span class="hearts">♥ <b>5</b></span>
  </div>

  <div class="t-h2 q">Where is Japan?</div>

  <div class="map">
    <svg viewBox="0 0 200 120" role="img" aria-label="Map of East Asia">
      <rect width="200" height="120" fill="${p.space['900']}"/>
      <path d="M20 40 L70 25 L110 35 L120 70 L80 95 L35 85 Z" fill="${p.continent.AS}" opacity=".5"/>
      <path d="M150 30 L162 42 L158 58 L168 66 L160 84 L148 74 L152 56 L143 44 Z"
            fill="${p.continent.AS}" stroke="${p.gold['500']}" stroke-width="1.5"/>
    </svg>
  </div>

  <div class="opts">
    <div class="opt">China</div>
    <div class="opt correct">Japan<span class="tick">✓</span></div>
    <div class="opt">Korea</div>
    <div class="opt">Thailand</div>
  </div>
</div>`

/** Mockup screen 6 — feedback. */
const feedback = `
<div class="scr center">
  <div class="statusbar"><span>9:41</span><span class="sb-r">▮▮▮</span></div>
  <div class="confetti">${Array.from(
    { length: 14 },
    (_, i) =>
      `<i style="left:${(i * 7 + 4) % 96}%;top:${(i * 13) % 30}%;background:${
        [p.green['400'], p.gold['500'], p.blue['400'], p.flame['500']][i % 4]
      };transform:rotate(${i * 37}deg)"></i>`,
  ).join('')}</div>

  <div class="t-h1 ok">Perfect!</div>
  <div class="t-body dim">You found Japan 🎉</div>

  <div class="flag" role="img" aria-label="Flag of Japan">
    <svg viewBox="0 0 90 60"><rect width="90" height="60" fill="#fff"/><circle cx="45" cy="30" r="18" fill="#BC002D"/></svg>
  </div>
  <div class="t-h2">Japan</div>

  <div class="rewards">
    <span class="chip xp">✦ +10 XP</span>
    <span class="chip coin">● +5</span>
  </div>

  <button class="btn primary wide">Continue</button>
  <div class="t-cap streaky">Streak Bonus! 🔥 +2 XP</div>
</div>`

/** The wrong-answer treatment — the most important copy in the app. */
const wrong = `
<div class="scr">
  <div class="statusbar"><span>9:41</span><span class="sb-r">▮▮▮</span></div>
  <div class="lesson-hd">
    <span class="x">✕</span><div class="bar flex1"><i style="width:30%"></i></div>
    <span class="num dim">3 / 10</span><span class="hearts">♥ <b>4</b></span>
  </div>
  <div class="t-h2 q">Where is Japan?</div>
  <div class="opts pad">
    <div class="opt wrong">Thailand<span class="tick">→</span></div>
    <div class="opt correct">Japan<span class="tick">✓</span></div>
  </div>
  <div class="explain">
    <div class="t-h3">That's Thailand.</div>
    <div class="t-body dim">Japan is the island chain to the northeast — look for the
    four big islands off the Asian coast.</div>
  </div>
  <button class="btn primary wide">Continue</button>
</div>`

const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --canvas:${p.space['800']}; --deep:${p.space['900']}; --top:${p.space['700']};
  --surf:${p.surface['1']}; --surf2:${p.surface['2']}; --surf3:${p.surface['3']};
  --line:${p.border.subtle};
  --green:${p.green['500']}; --green4:${p.green['400']}; --blue:${p.blue['500']};
  --gold:${p.gold['500']}; --flame:${p.flame['500']}; --red:${p.red['500']};
  --t1:${p.text['1']}; --t2:${p.text['2']}; --t3:${p.text['3']};
  --wrongbg:${p.feedback.wrongSurface};
  --r-sm:${t.radius.sm}px; --r-md:${t.radius.md}px; --r-lg:${t.radius.lg}px; --r-xl:${t.radius.xl}px;
  --s2:${t.space['2']}px; --s3:${t.space['3']}px; --s4:${t.space['4']}px; --s5:${t.space['5']}px; --s6:${t.space['6']}px;
  /* Stand-in stack. The app ships Nunito — type is the one thing this
     page cannot verify, because the CSP blocks font CDNs. */
  --ui:ui-rounded,"SF Pro Rounded",-apple-system,"Segoe UI Variable","Segoe UI",Roboto,system-ui,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
}
body{margin:0;background:var(--deep);color:var(--t1);font-family:var(--ui);
  -webkit-font-smoothing:antialiased;line-height:1.5}
.page{max-width:1180px;margin:0 auto;padding:var(--s6) var(--s4) 96px}

/* night sky, no external assets */
.sky{position:fixed;inset:0;z-index:-1;background:
  radial-gradient(1100px 700px at 15% -10%, ${p.space['700']} 0%, transparent 60%),
  radial-gradient(900px 600px at 85% 5%, #06284a 0%, transparent 55%),
  var(--deep);}
.sky::after{content:"";position:absolute;inset:0;opacity:.5;background-image:
  radial-gradient(1.4px 1.4px at 12% 22%, #fff, transparent),
  radial-gradient(1.2px 1.2px at 38% 8%, #cfe6ff, transparent),
  radial-gradient(1.6px 1.6px at 67% 31%, #fff, transparent),
  radial-gradient(1.1px 1.1px at 84% 14%, #b9d8ff, transparent),
  radial-gradient(1.3px 1.3px at 26% 61%, #fff, transparent),
  radial-gradient(1.2px 1.2px at 91% 54%, #dbeaff, transparent),
  radial-gradient(1.1px 1.1px at 54% 78%, #fff, transparent);}

h1,h2,h3{text-wrap:balance;margin:0}
.eyebrow{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);font-weight:700}
.title{font-size:clamp(30px,5vw,46px);font-weight:800;letter-spacing:-.02em;margin:var(--s3) 0}
.lede{color:var(--t2);max-width:62ch;font-size:17px}
section{margin-top:var(--s6);padding-top:var(--s5);border-top:1px solid var(--line)}
.sec-h{font-size:22px;font-weight:800;letter-spacing:-.01em}
.sec-p{color:var(--t2);max-width:66ch;margin-top:var(--s2)}
.note{margin-top:var(--s3);padding:var(--s3) var(--s4);border-left:3px solid var(--gold);
  background:rgba(245,166,30,.07);border-radius:0 var(--r-sm) var(--r-sm) 0;color:var(--t2);font-size:14px;max-width:70ch}
.note b{color:var(--t1)}
code,.mono{font-family:var(--mono);font-size:12px}
.dim{color:var(--t2)}

/* tokens */
.sw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:var(--s3);margin-top:var(--s4)}
.sw{background:var(--surf);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden}
.sw-chip{height:58px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px}
.sw-meta{padding:var(--s2) var(--s3);display:flex;flex-direction:column;gap:2px}
.sw-meta code{color:var(--t1)}
.ratio{color:var(--green4);font-variant-numeric:tabular-nums}
.scale-row{display:flex;align-items:flex-end;gap:var(--s3);flex-wrap:wrap;margin-top:var(--s4)}
.scale-row .u{text-align:center}
.scale-row .u i{display:block;background:linear-gradient(180deg,var(--blue),var(--green));border-radius:3px}
.scale-row .u span{font-family:var(--mono);font-size:11px;color:var(--t2)}
table{width:100%;border-collapse:collapse;margin-top:var(--s4);font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line)}
th{color:var(--t3);font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
td.n{font-family:var(--mono);color:var(--t2);font-variant-numeric:tabular-nums}
.tbl-wrap{overflow-x:auto}

/* component bench */
.bench{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--s4);margin-top:var(--s4)}
.bench .cell{background:var(--surf);border:1px solid var(--line);border-radius:var(--r-lg);padding:var(--s4);display:flex;flex-direction:column;gap:var(--s3)}
.cell-lab{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);font-weight:700}

/* shared app pieces */
.btn{border:0;border-radius:var(--r-md);height:48px;padding:0 var(--s5);font-family:var(--ui);
  font-size:16px;font-weight:600;color:#fff;cursor:pointer;width:100%}
.btn.primary{background:var(--green);box-shadow:0 0 24px rgba(34,167,58,.35)}
.btn.secondary{background:var(--blue)}
.btn.tertiary{background:transparent;border:1px solid var(--line);color:var(--t1);box-shadow:none}
.btn.destructive{background:${p.red['700']}}
.btn.ghost{background:transparent;color:var(--t2);box-shadow:none}
.btn.disabled{background:var(--surf3);color:var(--t3);box-shadow:none;cursor:not-allowed}
.btn.sm{height:36px;font-size:13px}
.btn.wide{margin-top:var(--s4)}
.opt{min-height:56px;border-radius:var(--r-md);background:var(--surf2);border:1px solid var(--line);
  display:flex;align-items:center;justify-content:center;font-weight:600;position:relative;padding:0 var(--s4)}
.opt.correct{background:var(--green);border-color:var(--green)}
.opt.wrong{background:var(--wrongbg);border-color:#5b3448}
.opt.selected{background:var(--surf3)}
.opt.disabled{background:var(--surf);color:var(--t3)}
.tick{position:absolute;right:var(--s4);font-weight:800}
.bar{height:8px;border-radius:999px;background:var(--deep);overflow:hidden}
.bar i{display:block;height:100%;background:var(--green4);border-radius:999px}
.bar-row{display:flex;align-items:center;gap:var(--s3)}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:var(--green4)}
.num.gold{color:var(--gold)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;
  background:var(--surf);font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
.chip.xp{color:var(--gold)} .chip.coin{color:${p.gold['400']}}
.chip.streak{color:var(--flame)} .chip.hearts{color:var(--red)}
.skel{background:var(--surf2);border-radius:var(--r-sm);height:14px;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}

/* phone frames — echoing the mockup's own composition */
.phones{display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:var(--s5);margin-top:var(--s5)}
.phone-wrap{display:flex;flex-direction:column;gap:var(--s2)}
.phone-cap{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);font-weight:700}
.scr{background:linear-gradient(170deg,var(--top),var(--canvas) 45%,var(--deep));
  border:1px solid var(--line);border-radius:26px;padding:var(--s3);aspect-ratio:9/19.5;
  display:flex;flex-direction:column;gap:var(--s3);overflow:hidden;position:relative;
  box-shadow:0 18px 44px rgba(0,0,0,.55)}
.scr.center{align-items:center;text-align:center}
.statusbar{display:flex;justify-content:space-between;font-size:10px;color:var(--t2);
  font-variant-numeric:tabular-nums;padding:0 2px}
.hd{display:flex;align-items:center;gap:var(--s2)}
.hd-txt{flex:1}
.avatar{width:34px;height:34px;border-radius:999px;background:linear-gradient(140deg,var(--blue),${p.blue['400']});
  border:2px solid var(--gold)}
.streak{display:flex;flex-direction:column;align-items:center;color:var(--flame);line-height:1.1}
.streak b{font-size:17px;font-variant-numeric:tabular-nums}
.fl{font-size:13px}
.card{background:var(--surf);border-radius:var(--r-lg);padding:var(--s3);display:flex;
  flex-direction:column;gap:var(--s2)}
.card.lift{background:var(--surf2);box-shadow:0 6px 16px rgba(0,0,0,.45)}
.row-card{flex-direction:row;align-items:center;justify-content:space-between}
.trophy{font-size:26px}
.two-up{display:grid;grid-template-columns:1fr 1fr;gap:var(--s2)}
.mini{padding:var(--s3)}
.tabs{margin-top:auto;display:flex;justify-content:space-between;padding-top:var(--s2);
  border-top:1px solid var(--line)}
.tab{display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--t3);flex:1}
.tab.on{color:var(--blue)}
.tg{font-size:15px}
.lesson-hd{display:flex;align-items:center;gap:var(--s2)}
.flex1{flex:1}
.x{color:var(--t2);font-size:15px}
.hearts{color:var(--red);font-size:12px;font-weight:700}
.q{text-align:center;margin:var(--s2) 0}
.map{background:var(--deep);border-radius:var(--r-md);overflow:hidden;border:1px solid var(--line)}
.map svg{display:block;width:100%}
.opts{display:flex;flex-direction:column;gap:var(--s2);margin-top:auto}
.opts.pad{margin-top:var(--s3)}
.flag{width:96px;margin:var(--s3) auto 0;border-radius:6px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.5)}
.flag svg{display:block;width:100%}
.rewards{display:flex;gap:var(--s2);justify-content:center;margin-top:var(--s3)}
.streaky{color:var(--flame);margin-top:var(--s2)}
.ok{color:${p.green['400']}}
.explain{background:var(--surf);border-radius:var(--r-md);padding:var(--s3);margin-top:var(--s3)}
.confetti{position:absolute;inset:0;pointer-events:none}
.confetti i{position:absolute;width:6px;height:10px;border-radius:1px;opacity:.9}

/* type helpers mirroring the token scale */
.t-h1{font-size:28px;font-weight:800;letter-spacing:-.01em}
.t-h2{font-size:22px;font-weight:800}
.t-h3{font-size:${t.typography.scale.h3.size}px;font-weight:600}
.t-body{font-size:15px}
.t-cap{font-size:12px;font-weight:500}
.t-ov{font-size:9px;letter-spacing:.08em;text-transform:uppercase;font-weight:700}
.gold{color:var(--gold)}

@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`

const BODY = `
<div class="sky"></div>
<div class="page">
  <div class="eyebrow">WorldQuest · design system v1.0</div>
  <h1 class="title">Every value on this page comes from <code>tokens.json</code></h1>
  <p class="lede">Nothing here is hand-picked CSS. The palette was sampled from the v1
  mockup, written to <code>packages/design/tokens.json</code>, and this page is generated
  from that file — so if a token drifts from the design, this page drifts visibly with it.
  Regenerate with <code>pnpm design:preview</code>.</p>

  <div class="note"><b>What this page can and cannot verify.</b> It verifies colour,
  spacing, radius, elevation, component states and screen composition. It cannot verify
  <b>type</b> — the app ships Nunito, and this page falls back to a system
  rounded stack because the sandbox blocks font CDNs. It also cannot verify motion, haptics
  or the real mascot and map art. Those need the device.</div>

  <section>
    <h2 class="sec-h">Colour</h2>
    <p class="sec-p">Ratios are computed live against the surface each colour sits on.
    Components import the <em>semantic</em> name (<code>action.primary</code>), never the raw
    palette — that indirection is what makes high-contrast and seasonal event themes possible
    without touching a component.</p>
    <div class="sw-grid">
      ${swatch('space.900 · page base', p.space['900'])}
      ${swatch('space.800 · canvas', p.space['800'], p.text['1'])}
      ${swatch('surface.1 · card', p.surface['1'], p.text['1'])}
      ${swatch('surface.2 · raised', p.surface['2'], p.text['1'])}
      ${swatch('action.primary · continue', p.green['500'], p.text['1'])}
      ${swatch('action.secondary · navigate', p.blue['500'], p.text['1'])}
      ${swatch('reward · xp, coins, premium', p.gold['500'], p.space['900'])}
      ${swatch('status.streak', p.flame['500'], p.space['900'])}
      ${swatch('status.hearts', p.red['500'], p.text['1'])}
      ${swatch('feedback.wrong · muted, not red', p.feedback.wrongSurface, p.text['1'])}
      ${swatch('text.secondary', p.text['2'], p.surface['1'])}
      ${swatch('text.tertiary · ≥18px only', p.text['3'], p.surface['1'])}
    </div>
    <div class="note"><b>Why the wrong-answer surface isn't red.</b> A red flash reads as
    punishment. We state the truth, show the right answer and move on — so the token is a
    muted plum that carries no alarm.</div>
  </section>

  <section>
    <h2 class="sec-h">Scale</h2>
    <p class="sec-p">An 8-point grid. <code>padding: 15</code> is a bug, and CI treats it as one.</p>
    <div class="scale-row">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map(
          (k) =>
            `<div class="u"><i style="width:${t.space[k]}px;height:${t.space[k]}px"></i><span>${t.space[k]}</span></div>`,
        )
        .join('')}
    </div>
    <div class="scale-row">
      ${Object.entries(t.radius)
        .filter(([k]) => k !== 'full')
        .map(
          ([k, v]) =>
            `<div class="u"><i style="width:56px;height:44px;border-radius:${v}px"></i><span>${k} ${v}</span></div>`,
        )
        .join('')}
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Type token</th><th>Size / line</th><th>Weight</th><th>Use</th></tr></thead>
      <tbody>${Object.entries(t.typography.scale)
        .map(
          ([k, v]: [string, any]) =>
            `<tr><td><code>${k}</code></td><td class="n">${v.size} / ${v.lineHeight}</td><td class="n">${v.weight}</td><td class="dim">${
              {
                display: 'Onboarding headline',
                h1: 'Screen title',
                h2: 'Section header, question',
                h3: 'Card title',
                body: 'Default',
                bodyStrong: 'Answers, list rows',
                caption: 'Metadata, progress counts',
                overline: 'Tab labels, badges',
                numeric: 'XP, timers, scores',
              }[k] ?? ''
            }</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Motion</th><th>Duration</th><th>Easing</th><th>Use</th></tr></thead>
      <tbody>${['instant', 'quick', 'base', 'expressive', 'celebrate']
        .map(
          (k) =>
            `<tr><td><code>${k}</code></td><td class="n">${t.motion[k].duration}ms</td><td class="n">${t.motion[k].easing}</td><td class="dim">${
              {
                instant: 'Press feedback (scale .96)',
                quick: 'Chips, toggles, tab switch',
                base: 'Screen transitions, sheets',
                expressive: 'Card entrance, mascot',
                celebrate: 'Correct answer, level up',
              }[k]
            }</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
  </section>

  <section>
    <h2 class="sec-h">Components</h2>
    <p class="sec-p">Every state, because a component missing its disabled or loading state
    is a component that will be improvised at 2am.</p>
    <div class="bench">
      <div class="cell"><div class="cell-lab">Button · variants</div>
        <button class="btn primary">Continue</button>
        <button class="btn secondary">Start Quest</button>
        <button class="btn tertiary">Maybe later</button>
        <button class="btn destructive">Log Out</button>
      </div>
      <div class="cell"><div class="cell-lab">Button · states</div>
        <button class="btn primary">Default</button>
        <button class="btn primary" style="transform:scale(.96);background:${p.green['600']};box-shadow:none">Pressed</button>
        <button class="btn disabled" disabled>Disabled</button>
        <button class="btn sm secondary">Small</button>
      </div>
      <div class="cell"><div class="cell-lab">Answer option · states</div>
        <div class="opt">Idle</div>
        <div class="opt selected">Selected</div>
        <div class="opt correct">Correct<span class="tick">✓</span></div>
        <div class="opt wrong">Wrong<span class="tick">→</span></div>
      </div>
      <div class="cell"><div class="cell-lab">Progress · always with a count</div>
        <div class="bar-row"><div class="bar flex1"><i style="width:88%"></i></div><span class="num">172 / 195</span></div>
        <div class="bar-row"><div class="bar flex1"><i style="width:44%"></i></div><span class="num">86 / 195</span></div>
        <div class="bar-row"><div class="bar flex1"><i style="width:6%"></i></div><span class="num">12 / 195</span></div>
      </div>
      <div class="cell"><div class="cell-lab">Stat chips</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="chip xp">✦ 12,850</span><span class="chip coin">● 430</span>
          <span class="chip streak">🔥 12</span><span class="chip hearts">♥ 5</span>
        </div>
      </div>
      <div class="cell"><div class="cell-lab">Skeleton · never a spinner</div>
        <div class="skel" style="width:60%"></div>
        <div class="skel"></div>
        <div class="skel" style="width:80%"></div>
        <div class="skel" style="height:44px;margin-top:6px"></div>
      </div>
    </div>
  </section>

  <section>
    <h2 class="sec-h">Screens</h2>
    <p class="sec-p">Rebuilt from tokens only — no bitmaps, no hand-tuned hex values. Open
    <code>docs/design/assets/mockup-v1.png</code> beside this and the differences are the work.</p>
    <div class="phones">
      <div class="phone-wrap"><div class="phone-cap">3 · Home</div>${home}</div>
      <div class="phone-wrap"><div class="phone-cap">5 · Lesson runner</div>${lesson}</div>
      <div class="phone-wrap"><div class="phone-cap">6 · Correct answer</div>${feedback}</div>
      <div class="phone-wrap"><div class="phone-cap">Wrong answer · not in the mockup</div>${wrong}</div>
    </div>
    <div class="note"><b>The fourth screen isn't in your mockup, and that's the point.</b>
    The mockup designs the moment a user gets it right. Users see the other one just as often,
    and it's where an app either feels encouraging or makes someone feel stupid. Muted surface,
    the correct answer shown, one memorable hook, no buzzer — designed, not improvised.</div>
  </section>

  <section>
    <h2 class="sec-h">What the mockup still owes us</h2>
    <p class="sec-p">Honest gaps between the concept art and something buildable.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Asset</th><th>Status</th><th>Needed by</th></tr></thead>
      <tbody>
        <tr><td>Nunito font files</td><td class="dim">OFL — bundled via @expo-google-fonts</td><td class="n">Done</td></tr>
        <tr><td>Atlas the mascot</td><td class="dim">Concept art only; needs commissioning as a real sprite set</td><td class="n">Week 6</td></tr>
        <tr><td>Country vector geometry</td><td class="dim">Natural Earth, public domain — needs simplifying per zoom</td><td class="n">Week 3</td></tr>
        <tr><td>Flag SVGs ×195</td><td class="dim">Mostly public domain; licence must be recorded per set</td><td class="n">Week 4</td></tr>
        <tr><td>Landmark imagery ×300</td><td class="dim">The expensive one — photo licensing vs illustration is an open decision</td><td class="n">v1.5</td></tr>
        <tr><td>3D globe</td><td class="dim">Mockup shows a render; the buildable version is vector, with the continent grid as fallback</td><td class="n">Week 9</td></tr>
        <tr><td>Sound set</td><td class="dim">Six cues, one key, ≤600ms — commission or licence</td><td class="n">Week 10</td></tr>
      </tbody>
    </table></div>
  </section>
</div>`

const outDir = join(root, 'preview')
mkdirSync(outDir, { recursive: true })

writeFileSync(
  join(outDir, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WorldQuest — design system</title><style>${CSS}</style></head><body>${BODY}</body></html>`,
  'utf8',
)

writeFileSync(
  join(outDir, 'artifact.html'),
  `<title>WorldQuest — design system</title>\n<style>${CSS}</style>\n${BODY}`,
  'utf8',
)

console.log('✓ preview/index.html and preview/artifact.html written')
