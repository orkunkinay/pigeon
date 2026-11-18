// Static docs build: node website/build.mjs  (no dependencies)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shots } from './src/shots.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const REPO = 'https://github.com/orkunkinay/pigeon';
const pages = [
  ['index', 'Overview', 'Start'], ['getting-started', 'Getting started', 'Start'],
  ['slack-setup', 'Slack setup', 'Set up'], ['codex-integration', 'Codex integration', 'Set up'],
  ['using-pigeon', 'Using Pigeon', 'Use'], ['routing', 'How messages are routed', 'Use'], ['sessions', 'Sessions and recovery', 'Use'],
  ['troubleshooting', 'Troubleshooting', 'Reference'], ['status', 'Supported, experimental, unsupported', 'Reference'],
  ['architecture', 'Architecture', 'Reference'], ['security', 'Security', 'Reference'], ['contributing', 'Contributing', 'Reference'],
];
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function shortcodes(html) {
  html = html.replace(/\{\{sh(?::([^}]*))?\}\}\n?([\s\S]*?)\{\{\/sh\}\}/g, (_, label, code) => `<div class="code">${label ? `<span class="pill ok lbl" style="background:var(--card)">${esc(label)}</span>` : ''}<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre></div>`);
  html = html.replace(/\{\{shot:([\w-]+)\|([^}]*)\}\}/g, (_, k, cap) => {
    if (!shots[k]) throw new Error('missing shot ' + k);
    return `<figure class="shot"><button type="button">${shots[k]}</button><figcaption><span class="kind">Illustrative diagram</span> · ${cap}</figcaption></figure>`;
  });
  html = html.replace(/\{\{img:([^|}]+)\|([^|}]*)\|([^}]*)\}\}/g, (_, f, alt, cap) => `<figure class="shot"><button type="button"><img src="../assets/screenshots/${f}" alt="${esc(alt)}" loading="lazy"></button><figcaption><span class="kind" style="color:var(--green)">Real rendering</span> · ${cap}</figcaption></figure>`);
  html = html.replace(/\{\{pill:(ok|exp|no)\}\}/g, (_, k) => `<span class="pill ${k}">${{ ok: 'Verified', exp: 'Experimental', no: 'Not built' }[k]}</span>`);
  return html;
}
const index = [];
const built = pages.map(([id, title, group]) => {
  const src = readFileSync(join(root, 'src/docs', id + '.html'), 'utf8');
  const [head, ...rest] = src.split('\n---\n');
  const desc = head.replace(/^desc:\s*/m, '').trim();
  let body = shortcodes(rest.join('\n---\n'));
  const toc = [];
  body = body.replace(/<h([23])(?: id="([^"]+)")?>([\s\S]*?)<\/h\1>/g, (_, lv, id, inner) => {
    id = id || slug(inner);
    if (lv === '2') toc.push([id, inner.replace(/<[^>]+>/g, '')]);
    index.push({ u: `${id === 'index' ? '' : id}`, h: inner.replace(/<[^>]+>/g, ''), p: title, id });
    return `<h${lv} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${lv}>`;
  });
  return { id, title, group, desc, body, toc };
});
// search index: page + heading text
const plain = (h) => h.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
const sidx = [];
built.forEach((p) => {
  const parts = p.body.split(/(?=<h2 )/);
  parts.forEach((part) => {
    const m = part.match(/<h2 id="([^"]+)">([\s\S]*?)<a class="anchor"/);
    sidx.push({ u: `${p.id}.html${m ? '#' + m[1] : ''}`, h: m ? plain(m[2]).trim() : p.title, p: p.title, t: plain(part).slice(0, 1400) });
  });
});
writeFileSync(join(root, 'assets/scripts/search-index.js'), 'window.PIGEON_INDEX=' + JSON.stringify(sidx) + ';window.PIGEON_BASE="";\n');
const nav = (cur) => ['Start', 'Set up', 'Use', 'Reference'].map((g) => `<h5>${g}</h5>` + built.filter((p) => p.group === g).map((p) => `<a href="${p.id}.html"${p.id === cur.id ? ' aria-current="page"' : ''}>${p.title}</a>`).join('')).join('');
built.forEach((p, i) => {
  const prev = built[i - 1], next = built[i + 1];
  const toc = p.toc.length ? `<h5>On this page</h5><div class="toc">${p.toc.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</div>` : '';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title} · Pigeon docs</title><meta name="description" content="${esc(p.desc)}">
<link rel="icon" href="../assets/images/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../assets/styles/site.css"></head>
<body><a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap"><a class="brand" href="../index.html"><img src="../assets/images/pigeon-mark.svg" alt="">Pigeon</a>
<nav aria-label="Primary"><a href="../index.html#demo" class="hide-s">Demo</a><a href="index.html" aria-current="page">Docs</a><a href="${REPO}" class="hide-s">GitHub</a><button class="themebtn" data-theme-toggle type="button" aria-label="Toggle dark mode">◐</button></nav></div></header>
<div class="wrap docs"><aside class="side" id="side" aria-label="Documentation"><label for="q" class="note">Search docs (press /)</label><input id="q" type="search" autocomplete="off" placeholder="e.g. socket mode"><ul id="results"></ul>${nav(p)}${toc}</aside>
<main id="main" class="article"><button class="btn sbtn" type="button" aria-expanded="false" aria-controls="side">☰ Docs menu</button>
<h1>${p.title}</h1>${p.body}
<nav class="pn" aria-label="Previous and next">${prev ? `<a href="${prev.id}.html"><small>← Previous</small>${prev.title}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.id}.html"><small>Next →</small>${next.title}</a>` : ''}</nav></main></div>
<footer><div class="wrap"><span>Pigeon is MIT licensed. Preview software, macOS only.</span><a href="${REPO}">Source on GitHub</a></div></footer>
<script src="../assets/scripts/search-index.js"></script><script src="../assets/scripts/site.js"></script></body></html>`;
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', p.id + '.html'), html.replace('window.PIGEON_BASE=""', ''));
});
console.log('built', built.length, 'pages,', sidx.length, 'search entries');
