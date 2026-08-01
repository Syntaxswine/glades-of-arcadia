#!/usr/bin/env node
/**
 * tools/build.mjs — one file, no network, no server.
 *
 * Emits `dist/index.html`: the shell, the stylesheet and the entire module
 * graph inlined, with ZERO external references. Open it from the filesystem,
 * mail it to somebody, put it on a stick. SPEC §1: no dependencies, Node
 * built-ins only.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A CONCATENATION
 * ---------------------------------------------------------------------------
 * The obvious build for an ES-module game is to topologically sort the modules
 * and paste them into one script. That does not work here, and the reason is
 * worth writing down: `js/main.js` loads its eleven siblings through
 *
 *     const mod = await import(path);      // path is a VARIABLE
 *
 * because a module that fails to load must cost only its own feature and never
 * the boot. A concatenating bundler cannot see those edges at all — the game
 * would build clean and come up with no world, no fields and no creatures.
 *
 * So the bundle keeps the modules as modules. Every source is embedded as a
 * string; at runtime each one is turned into a Blob URL, in dependency order,
 * with its own import specifiers rewritten to the Blob URLs of its
 * dependencies. Dynamic `import(x)` becomes a call to a shim that resolves `x`
 * against the importing module's own path and hands back the right Blob URL.
 * The browser's own module loader does the rest, so evaluation order, live
 * bindings and per-module scope are exactly what they are when served — the
 * bundle runs the same code, not a rewrite of it.
 *
 * The tool then AUDITS its own output and refuses to claim success it has not
 * earned: it re-scans the emitted HTML for anything that would touch the
 * network, and exits non-zero if it finds one.
 *
 *   node tools/build.mjs [--out dist] [--quiet]
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const QUIET = argv.includes('--quiet');
const OUT_DIR = resolve(ROOT, arg('--out', 'dist'));
const say = (...a) => {
  if (!QUIET) console.log(...a);
};

// ---------------------------------------------------------------------------
// Gather
// ---------------------------------------------------------------------------

/** Every .js under js/, as posix-style paths relative to the project root. */
function collectModules(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...collectModules(rel));
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(rel);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// THE ONE EXTERNAL ASSET
// ---------------------------------------------------------------------------
//
// SPEC §1 said "zero external assets" and this tool proved it. docs/AUDIO.md
// relaxes that to exactly one: the owner's composed score. It is COPIED beside
// the bundle rather than inlined, and that is a deliberate choice, not a
// shortcut — 5.3 MB of mp3 becomes ~7.2 MB of base64 text that the browser must
// parse before it can run a line of the game, and the page is 1.4 MB. Copied,
// the page loads at the speed it always did and Pages streams the audio
// separately, which is what a media file wants anyway.
//
// So the dist is ONE HTML PLUS ONE MP3. Anything else in this list is a bug.
const ASSETS = [
  {
    file: 'audio/glades-of-arcadia.mp3',
    owner: 'js/audio.js',
    why: 'the composed score — docs/AUDIO.md',
  },
];
const ASSET_OWNERS = new Set(ASSETS.map((a) => a.owner));

const modules = collectModules('js');
const sources = {};
for (const m of modules) sources[m] = readFileSync(join(ROOT, m), 'utf8');

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'css/style.css'), 'utf8');

// The page's own inline module is the entry point. Lift it out and treat it as
// a module living at the project root, so its './js/...' specifiers resolve.
const entryMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!entryMatch) {
  console.error('build: index.html has no inline <script type="module"> to use as the entry');
  process.exit(1);
}
const ENTRY = '__entry__.js';
sources[ENTRY] = entryMatch[1];

// ---------------------------------------------------------------------------
// Check the graph before emitting anything
// ---------------------------------------------------------------------------

// Same expression the runtime loader uses. Matches `from './x.js'`,
// `import './x.js'` and `export ... from './x.js'`; deliberately does NOT match
// `import('./x.js')`, which is handled by the dynamic shim.
const SPEC_RE = /(\bfrom\s*|\bimport\s*)(['"])(\.[^'"]*)\2/g;

function resolveSpec(base, spec) {
  const parts = `${dirname(base).replace(/\\/g, '/')}/${spec}`.split('/');
  const out = [];
  for (const s of parts) {
    if (s === '' || s === '.') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return out.join('/');
}

const staticDeps = new Map();
for (const [path, src] of Object.entries(sources)) {
  const deps = new Set();
  src.replace(SPEC_RE, (m, _a, _q, spec) => {
    deps.add(resolveSpec(path, spec));
    return m;
  });
  staticDeps.set(path, [...deps]);
}

// A static cycle cannot be expressed as Blob URLs — the parent needs the
// child's URL before it can be created. Node and browsers both allow module
// cycles, so this is a real limit and it says so rather than hanging.
const cycles = [];
{
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const mark = new Map(Object.keys(sources).map((k) => [k, WHITE]));
  const stack = [];
  const walk = (p) => {
    if (mark.get(p) === BLACK) return;
    if (mark.get(p) === GREY) {
      cycles.push([...stack.slice(stack.indexOf(p)), p].join(' -> '));
      return;
    }
    mark.set(p, GREY);
    stack.push(p);
    for (const d of staticDeps.get(p) || []) if (sources[d] != null) walk(d);
    stack.pop();
    mark.set(p, BLACK);
  };
  for (const p of Object.keys(sources)) walk(p);
}
if (cycles.length) {
  console.error('build: static import cycle(s), which a Blob-URL bundle cannot express:');
  for (const c of cycles) console.error(`  ${c}`);
  process.exit(1);
}

const missing = [];
for (const [path, deps] of staticDeps) {
  for (const d of deps) if (sources[d] == null) missing.push(`${path} -> ${d}`);
}
if (missing.length) {
  console.error('build: static imports with no file behind them:');
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}

// Dynamic imports with a literal specifier: report the ones that will not
// resolve. They are not fatal — main.js catches them on purpose — but a silent
// one is how a feature goes missing from the dist and nowhere else.
const softMissing = [];
for (const [path, src] of Object.entries(sources)) {
  for (const m of src.matchAll(/\bimport\s*\(\s*(['"])(\.[^'"]*)\1/g)) {
    const target = resolveSpec(path, m[2]);
    if (sources[target] == null) softMissing.push(`${path} -> import('${m[2]}')`);
  }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------


// U+2028 and U+2029 are line terminators in JavaScript but ordinary
// characters in JSON, so JSON.stringify leaves them raw and they would break
// the <script> that carries the sources. Written this way rather than as a
// literal because the escape has to survive being edited by hand.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const SEPARATORS = new RegExp(`[${LS}${PS}]`, 'g');
const BSLASH = String.fromCharCode(92);

/** Safe to sit inside a <script> element in an HTML document. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(SEPARATORS, (ch) => (ch === LS ? BSLASH + 'u2028' : BSLASH + 'u2029'));
}


const LOADER = `
// ---------------------------------------------------------------------------
// The bundle's module loader. See tools/build.mjs for why this is not a
// concatenation: main.js loads its siblings through a dynamic import with a
// VARIABLE specifier, and a concatenating bundler cannot see those edges.
//
// Each source becomes a Blob URL, leaves first, with its import specifiers
// rewritten to the Blob URLs of its dependencies. The browser's own loader
// then evaluates them, so scope, order and live bindings are unchanged.
// ---------------------------------------------------------------------------
(function () {
  var SRC = window.__ARCADIA_SRC__;
  var urls = new Map();
  var pending = new Map();
  var SPEC = /(\\bfrom\\s*|\\bimport\\s*)(['"])(\\.[^'"]*)\\2/g;

  function dirOf(p) {
    var i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }
  function resolvePath(base, spec) {
    var parts = (dirOf(base) + '/' + spec).split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var s = parts[i];
      if (s === '' || s === '.') continue;
      if (s === '..') out.pop();
      else out.push(s);
    }
    return out.join('/');
  }

  function build(path) {
    if (urls.has(path)) return Promise.resolve(urls.get(path));
    if (pending.has(path)) return pending.get(path);
    var src = SRC[path];
    if (src == null) {
      return Promise.reject(new Error('arcadia bundle: no module ' + path));
    }
    var specs = [];
    src.replace(SPEC, function (m, a, q, s) {
      if (specs.indexOf(s) < 0) specs.push(s);
      return m;
    });
    var p = Promise.all(specs.map(function (s) { return build(resolvePath(path, s)); }))
      .then(function (resolved) {
        var map = {};
        for (var i = 0; i < specs.length; i++) map[specs[i]] = resolved[i];
        var out = src.replace(SPEC, function (m, a, q, s) { return a + JSON.stringify(map[s]); });
        if (/\\bimport\\s*\\(/.test(out)) {
          out = out.replace(/\\bimport\\s*\\(/g, '__aimp(');
          out = 'const __aimp = (s) => window.__arcadiaImport__(s, ' + JSON.stringify(path) + ');\\n' + out;
        }
        var url = URL.createObjectURL(new Blob([out], { type: 'text/javascript' }));
        urls.set(path, url);
        return url;
      });
    pending.set(path, p);
    return p;
  }

  window.__arcadiaImport__ = function (spec, base) {
    var target = String(spec).charAt(0) === '.' ? resolvePath(base, spec) : String(spec);
    return build(target).then(function (u) { return import(u); });
  };

  build(__ENTRY__).then(function (u) { return import(u); }).catch(function (err) {
    console.error('[arcadia] the bundle did not start', err);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<p style="color:#ddd2be;font-family:monospace;padding:16px">Arcadia could not start. ' +
        String((err && err.message) || err).replace(/[<&]/g, '') +
        '</p>'
    );
  });
})();
`.replace('__ENTRY__', JSON.stringify(ENTRY));

let out = html;

// 1. the stylesheet
//
// The href may carry a cache-busting query — `css/style.css?v=<build>` — which
// index.html gained when the front door shipped, because a stylesheet whose URL
// never changes is one the browser is entitled to keep for ever. This pattern
// did not allow for it, so from that day the link survived the build and the
// self-contained audit failed on every run. `[^"]*` is the fix and the reason
// it is not simply `"` is that the query is the whole point.
out = out.replace(
  /<link rel="stylesheet" href="css\/style\.css[^"]*"[^>]*\/?>/,
  `<style>\n${css}\n    </style>`
);

// 2. the entry module -> the sources blob + the loader
out = out.replace(
  /<script type="module">[\s\S]*?<\/script>/,
  `<script>window.__ARCADIA_SRC__ = ${jsonForScript(sources)};</script>\n    <script>${LOADER}</script>`
);

// 3. a note in the head so the file explains itself
out = out.replace(
  '<title>Arcadia</title>',
  `<title>Arcadia</title>\n    <!-- Built by tools/build.mjs. ${modules.length} modules + the stylesheet, inlined. No external references. -->`
);

mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, 'index.html');
writeFileSync(outFile, out);

// The one external asset, copied beside the page. audio.js fetches it relative
// to the document, so `dist/audio/x.mp3` is what `dist/index.html` asks for.
//
// A MISSING FILE IS A NOTE, NOT A FAULT. docs/AUDIO.md is explicit that a
// missing or failed mp3 degrades to the ambient layer and never to a broken
// game, so a build that cannot find it must still produce a playable dist —
// refusing here would make the tool stricter than the contract it enforces.
const assetNotes = [];
let assetBytes = 0;
for (const a of ASSETS) {
  const from = join(ROOT, a.file);
  if (!existsSync(from)) {
    assetNotes.push(`${a.file} is not here — the dist will run on its ambient layer alone`);
    continue;
  }
  const to = join(OUT_DIR, a.file);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  const size = statSync(to).size;
  assetBytes += size;
  assetNotes.push(`${a.file}  ${(size / 1024 / 1024).toFixed(1)} MB  (${a.why})`);
}

// ---------------------------------------------------------------------------
// Audit — prove the claim rather than making it
// ---------------------------------------------------------------------------

const built = readFileSync(outFile, 'utf8');
const problems = [];

// The markup, with the embedded sources and the loader lifted out — those are
// JavaScript and are audited separately. Scanning them as markup gives false
// positives that teach you to ignore the audit, which is worse than no audit:
// `URL.createObjectURL(` matches a case-insensitive `url(`.
const shell = built
  .replace(/window\.__ARCADIA_SRC__ = [\s\S]*?;<\/script>/, 'SOURCES;</script>')
  .replace(/<script>\s*\n\/\/ -+\n\/\/ The bundle's module loader[\s\S]*?<\/script>/, '<script>LOADER</script>');

const EXTERNAL = [
  [/<link\b[^>]*\bhref=/gi, 'a <link> with an href'],
  [/<script\b[^>]*\bsrc=/gi, 'a <script src=>'],
  [/<img\b[^>]*\bsrc=/gi, 'an <img src=>'],
  [/<(?:iframe|video|audio|source|track|embed|object)\b/gi, 'an element that can load a subresource'],
  [/\bhttps?:\/\//gi, 'an absolute http(s) URL'],
  [/<link\b[^>]*rel=["']?(?:preload|prefetch|manifest)/gi, 'a preload/manifest link'],
];
for (const [re, what] of EXTERNAL) {
  const hits = shell.match(re);
  if (hits) problems.push(`${what} survived the build (${hits.length}x): ${hits.slice(0, 3).join(', ')}`);
}

// The stylesheet, audited as CSS.
const styleBlock = (built.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
if (!styleBlock.trim()) problems.push('the stylesheet did not get inlined');
for (const [re, what] of [
  [/@import\b/g, 'a CSS @import'],
  [/\burl\(\s*(?!['"]?data:)/g, 'a CSS url() that is not a data: URI'],
  [/@font-face\b/g, 'an @font-face, which implies a font file'],
]) {
  const hits = styleBlock.match(re);
  if (hits) problems.push(`${what} in the inlined CSS (${hits.length}x)`);
}

// Anything in the embedded sources that would go to the network at runtime.
const NETWORKY = [/\bfetch\s*\(/g, /XMLHttpRequest/g, /\bnew\s+Worker\s*\(/g, /\bnew\s+EventSource\s*\(/g, /\bnew\s+WebSocket\s*\(/g, /import\.meta\.url/g];
const FETCH = NETWORKY[0].source;
for (const [path, src] of Object.entries(sources)) {
  for (const re of NETWORKY) {
    const hit = re.test(src);
    re.lastIndex = 0;
    if (!hit) continue;
    // The declared owner of the one permitted asset is allowed to fetch it,
    // and only it. Every other module, and every other kind of network call,
    // is still a hard failure. The exception is NAMED so that it cannot spread
    // by accident: a second module reaching for the network still fails here.
    if (re.source === FETCH && ASSET_OWNERS.has(path)) continue;
    problems.push(`${path} contains ${re.source}, which needs a server`);
  }
}

// Every module the page will actually reach must be in the bundle.
for (const [path, deps] of staticDeps) {
  for (const d of deps) if (sources[d] == null) problems.push(`${path} statically imports ${d}, which is not in the bundle`);
}

// And the file must contain the whole graph, not a truncated JSON blob.
for (const m of modules) {
  if (built.indexOf(jsonForScript(m).slice(1, -1)) < 0) problems.push(`${m} is not present in the output`);
}

const bytes = Buffer.byteLength(built);
say(`\nARCADIA — build`);
say('-'.repeat(15));
say(`  ${modules.length} modules + 1 inline entry + ${(css.length / 1024).toFixed(1)} KB of CSS`);
say(`  -> ${relative(ROOT, outFile).split(sep).join('/')}   ${(bytes / 1024).toFixed(1)} KB`);
for (const n of assetNotes) say(`  +  ${n}`);
for (const s of softMissing) say(`  note  optional module absent, will be caught at runtime: ${s}`);

if (problems.length) {
  console.error(`\n  AUDIT FAILED — the output is not self-contained:`);
  for (const p of problems) console.error(`    · ${p}`);
  process.exit(1);
}
say(`  audit: no <link>, no <script src>, no url(), no absolute URL, no unpermitted fetch.`);
say(
  assetBytes
    ? `  the page reaches for exactly one thing: ${ASSETS.map((a) => a.file).join(', ')}. Nothing else leaves the file.`
    : `  nothing leaves the file at all — the one permitted asset is not here, and the game degrades to its ambient layer.`
);
// file:// cannot fetch a sibling (CORS), so the music only plays over http.
// The page still runs from disk; it just runs quiet. Say so rather than
// letting somebody conclude the feature is broken.
say(`  open it with:  file://${outFile.split(sep).join('/')}   (serve it to hear the music — file:// cannot fetch the mp3)`);
