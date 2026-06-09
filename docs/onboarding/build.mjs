// Renders the onboarding decks to self-contained reveal.js HTML files.
// Single source of truth: content/*.json (shared with build_pptx.py).
// Usage: node docs/onboarding/build.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(ROOT, 'content');

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Allow a tiny inline markup in body strings: **bold**
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const WORDMARK_DARK = 'assets/renew-wordmark-black.png';
const WORDMARK_LIGHT = 'assets/renew-wordmark-white.png';

function foot(deckName, pg) {
  return `<div class="deckfoot"><img src="${WORDMARK_DARK}" alt="Renew Subastas"/><span class="pg">${esc(deckName)} · ${pg}</span></div>`;
}

function block(s) {
  let h = '';
  if (s.type === 'toc' || s.type === 'bullets') {
    const items = (s.items || [])
      .map((it, i) => {
        if (typeof it === 'string') return `<li><span class="txt">${rich(it)}</span></li>`;
        const lead = s.type === 'toc'
          ? `<span class="lead idx">${String(i + 1).padStart(2, '0')}</span>`
          : `<span class="lead">${rich(it.lead)}</span>`;
        return `<li>${lead}<span class="txt">${rich(it.text)}</span></li>`;
      })
      .join('');
    h += `<ul class="lead-list">${items}</ul>`;
  }
  if (s.type === 'steps') {
    const items = (s.steps || [])
      .map(
        (st, i) =>
          `<div class="step"><div class="n">${i + 1}</div><div class="body"><p class="st">${rich(st.title)}</p><p class="sd">${rich(st.text)}</p></div></div>`,
      )
      .join('');
    h += `<div class="steps">${items}</div>`;
  }
  if (s.type === 'statpair') {
    const tiles = (s.tiles || [])
      .map(
        (t) =>
          `<div class="tile ${t.strong ? 'strong' : ''}"><div class="tl">${esc(t.label)}</div><div class="tv">${esc(t.value)}</div></div>`,
      )
      .join('');
    h += `<div class="statpair">${tiles}</div>`;
  }
  if (s.type === 'kv') {
    const rows = (s.rows || [])
      .map(([k, v]) => `<tr><td class="k">${rich(k)}</td><td class="v">${rich(v || '—')}</td></tr>`)
      .join('');
    h += `<table class="kv">${rows}</table>`;
  }
  if (s.type === 'table') {
    const head = `<tr>${(s.head || []).map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    const rows = (s.rows || [])
      .map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join('')}</tr>`)
      .join('');
    h += `<table class="dtable"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }
  if (s.type === 'flow') {
    const parts = [];
    (s.stages || []).forEach((st, i) => {
      if (i) parts.push(`<div class="arr">&rsaquo;</div>`);
      parts.push(
        `<div class="stage"><div class="sl">${rich(st.label)}</div><div class="ss">${rich(st.sub)}</div></div>`,
      );
    });
    h += `<div class="flow">${parts.join('')}</div>`;
  }
  // optional trailing callout on any content slide
  if (s.callout) {
    const c = s.callout;
    h += `<div class="callout ${c.tone || 'neutral'}">${c.title ? `<span class="ct">${rich(c.title)}</span>` : ''}${rich(c.text)}</div>`;
  }
  return h;
}

function slideHTML(s, deckName, pg) {
  if (s.type === 'cover') {
    return `<section class="cover" data-transition="fade">
      <img class="cover-mark" src="${WORDMARK_LIGHT}" alt="Renew Subastas"/>
      ${s.eyebrow ? `<span class="eyebrow">${esc(s.eyebrow)}</span>` : ''}
      <h1>${rich(s.title)}</h1>
      ${s.subtitle ? `<p>${rich(s.subtitle)}</p>` : ''}
      <div class="deckfoot"><span>${esc(deckName)}</span><span class="pg">Santa Rosa Automotores · Paraguay</span></div>
    </section>`;
  }
  if (s.type === 'divider') {
    return `<section class="divider" data-transition="fade">
      ${s.num ? `<div class="secnum">${esc(s.num)}</div>` : ''}
      <h1>${rich(s.title)}</h1>
      ${s.subtitle ? `<p>${rich(s.subtitle)}</p>` : ''}
    </section>`;
  }
  if (s.type === 'closing') {
    return `<section class="closing" data-transition="fade">
      <img class="cmark" src="${WORDMARK_LIGHT}" alt="Renew Subastas"/>
      <h1>${rich(s.title)}</h1>
      ${(s.lines || []).map((l) => `<p>${rich(l)}</p>`).join('')}
      <div class="deckfoot"><span>${esc(deckName)}</span><span class="pg">Renew Subastas</span></div>
    </section>`;
  }
  // generic content slide
  return `<section>
    ${s.eyebrow ? `<span class="eyebrow pill">${esc(s.eyebrow)}</span>` : ''}
    ${s.title ? `<h1>${rich(s.title)}</h1>` : ''}
    ${s.intro ? `<p class="intro">${rich(s.intro)}</p>` : ''}
    ${block(s)}
    ${foot(deckName, pg)}
  </section>`;
}

function renderDeck(deck) {
  let pg = 0;
  const sections = deck.slides
    .map((s) => {
      const isChrome = s.type === 'cover' || s.type === 'divider' || s.type === 'closing';
      if (!isChrome) pg += 1;
      return slideHTML(s, deck.short || deck.title, pg);
    })
    .join('\n');

  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(deck.title)} · Renew Subastas</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css"/>
<link rel="stylesheet" href="theme.css"/>
<style>
  /* enable print-to-pdf: open with ?print-pdf then Cmd/Ctrl+P */
  .reveal .slides section { font-size: 1rem; }
</style>
</head><body>
<div class="reveal"><div class="slides">
${sections}
</div></div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
<script>
  Reveal.initialize({
    width: 1280, height: 720, margin: 0, center: false,
    hash: true, transition: 'slide', transitionSpeed: 'default',
    controls: true, progress: true, slideNumber: false,
    pdfSeparateFragments: false,
  });
</script>
</body></html>`;
}

const files = readdirSync(CONTENT).filter((f) => f.endsWith('.json')).sort();
const index = [];
for (const f of files) {
  const deck = JSON.parse(readFileSync(join(CONTENT, f), 'utf8'));
  const out = f.replace(/\.json$/, '.html');
  writeFileSync(join(ROOT, out), renderDeck(deck));
  const count = deck.slides.filter((s) => !['cover', 'divider', 'closing'].includes(s.type)).length;
  index.push({ file: out, ...deck.meta, title: deck.title, short: deck.short, count });
  console.log(`built decks/${out}  (${deck.slides.length} slides)`);
}

// index landing
const cards = index
  .map(
    (d) =>
      `<a class="card" href="${d.file}"><span class="role">${esc(d.short)}</span><span class="t">${esc(d.title)}</span><span class="d">${esc(d.blurb || '')}</span><span class="n">${d.slides || ''}</span></a>`,
  )
  .join('');
writeFileSync(
  join(ROOT, 'index.html'),
  `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Renew Subastas · Manuales</title>
<link rel="stylesheet" href="theme.css"/>
<style>
  body { margin:0; background: var(--ink); color:#fff; font-family: var(--sans); min-height:100vh; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 80px 32px 64px; }
  .wrap > img { height: 34px; margin-bottom: 56px; }
  h1 { font-size: 44px; font-weight: 800; letter-spacing: -.02em; margin: 0 0 .25em; }
  .sub { color:#a1a1aa; font-size: 18px; max-width: 56ch; margin: 0 0 48px; line-height:1.5; }
  .grid { display:grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .card { display:flex; flex-direction:column; gap:6px; text-decoration:none; background:#161616; border:1px solid #262626; border-radius:16px; padding:24px 26px; transition: border-color .2s, transform .2s; }
  .card:hover { border-color:#52525b; transform: translateY(-2px); }
  .card .role { font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#71717a; }
  .card .t { font-size:22px; font-weight:800; color:#fff; letter-spacing:-.01em; }
  .card .d { font-size:14px; color:#a1a1aa; line-height:1.45; }
  .foot { margin-top:56px; color:#52525b; font-size:13px; }
</style></head><body>
<div class="wrap">
  <img src="assets/renew-wordmark-white.png" alt="Renew Subastas"/>
  <h1>Manuales de la plataforma</h1>
  <p class="sub">Guía completa de Renew Subastas paso a paso: el proyecto general y un manual dedicado para cada tipo de usuario.</p>
  <div class="grid">${cards}</div>
  <p class="foot">Renew Subastas · Santa Rosa Automotores · Paraguay</p>
</div>
</body></html>`,
);
console.log('built index.html');
