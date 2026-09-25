// Pure logic for <RenderVisualizer>. No DOM access at module scope, so the
// string-building/regex pieces here are trivially readable outside a
// browser — only `loadBabel()` touches `document`/`window` (mirrors the
// split in ts-runner.ts: DOM wiring stays in the island component).
//
// Architecture (spec react-deep-dive phase3/4 §3.3):
//   1. Babel standalone (pinned, lazy-loaded from cdnjs) transpiles the
//      lesson's JSX/TSX literal to plain JS IN THE HOST PAGE — same "load
//      the compiler once, reuse it" pattern as TSPlayground's TypeScript
//      loader.
//   2. A regex pass over the Babel OUTPUT (not the source — see below)
//      injects a render counter call as the first statement of every
//      top-level `function Name(...) {` whose name is capitalized (React's
//      own component-naming convention), including one nested inside
//      `memo(function Name(...) { ... })`.
//   3. The instrumented JS is embedded in an iframe `srcdoc` with an
//      import map pinning React 19 ESM builds from esm.sh, wrapped in
//      `<Profiler id="root" onRender>`, and mounted with `createRoot`.
//   4. Every commit, the iframe posts `{ phase, actualDuration, counts }`
//      back to the host via `postMessage`; the host diffs `counts` against
//      the previous snapshot to know which components rendered *this*
//      commit (see RenderVisualizerIsland.tsx).
//
// Why instrument the Babel OUTPUT instead of the source: by the time
// `@babel/preset-typescript` has run, every type annotation is already
// gone, so a plain `function Name(` regex never has to worry about a type
// like `(onSelect: () => void)` — whose embedded `()` would otherwise
// confuse a naive "match up to the next `)`" regex. This is also why the
// lessons' `xxxCode` literals in this repo are written with a real
// constraint: components are plain `function Name(...) { ... }`
// declarations (never arrow-function components, and no default parameter
// value that itself contains a literal `)`, e.g. a call expression) — the
// regex only has to find ONE `)` per component, not balance nested ones.
// ponytail: a real parser (Babel's own AST) would handle any parameter
// shape; a regex only needs to handle the shapes this course's own
// examples use. Upgrade to a Babel visitor plugin if a future embed needs
// an arrow-function component or a param containing `)`.

export const BABEL_CDN_VERSION = '7.29.9';
const BABEL_CDN_URL = `https://cdn.jsdelivr.net/npm/@babel/standalone@${BABEL_CDN_VERSION}/babel.min.js`;

export const REACT_CDN_VERSION = '19.3.0';
const REACT_BASE = `https://esm.sh/react@${REACT_CDN_VERSION}`;
const REACT_DOM_BASE = `https://esm.sh/react-dom@${REACT_CDN_VERSION}`;

export const VERSIONS_BADGE = {
  en: `Babel ${BABEL_CDN_VERSION} (jsdelivr) · React ${REACT_CDN_VERSION} dev build (esm.sh, pinned)`,
  th: `Babel ${BABEL_CDN_VERSION} (jsdelivr) · React ${REACT_CDN_VERSION} dev build (esm.sh, ปักหมุดเวอร์ชัน)`,
};

// ---------------------------------------------------------------------------
// Lazy-load Babel standalone (UMD build defines the global `Babel`).
// ---------------------------------------------------------------------------

export type BabelStandalone = {
  version: string;
  transform: (code: string, options: Record<string, unknown>) => { code: string };
};

declare global {
  // eslint-disable-next-line no-var
  var Babel: BabelStandalone | undefined;
}

let babelPromise: Promise<BabelStandalone> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

export function loadBabel(): Promise<BabelStandalone> {
  if (globalThis.Babel) return Promise.resolve(globalThis.Babel);
  if (babelPromise) return babelPromise;
  babelPromise = (async () => {
    await loadScript(BABEL_CDN_URL);
    if (!globalThis.Babel) throw new Error('babel.min.js loaded but did not define `Babel`');
    return globalThis.Babel;
  })();
  return babelPromise;
}

// ---------------------------------------------------------------------------
// Transform: JSX/TSX -> plain JS (automatic JSX runtime) -> instrumented JS
// ---------------------------------------------------------------------------

/** Strips leading `export`/`export default` so the module-shaped lesson literal runs as top-level declarations inside the srcdoc module script (mirrors ts-runner.ts's stripExportKeywords). */
export function stripExportKeywords(code: string): string {
  return code
    .replace(/^(\s*)export\s+default\s+/gm, '$1')
    .replace(/^(\s*)export\s+(?=(const|let|var|function|class|interface|type|enum|async\s+function)\b)/gm, '$1');
}

/** Injects `window.__rv.hit("Name")` as the first statement of every capitalized top-level `function Name(...) { ... }` — see the module doc comment for why this is a regex, not an AST visitor. */
export function instrumentRenderCounts(code: string): string {
  return code.replace(
    /function ([A-Z][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*{/g,
    (declaration, name: string) => `${declaration}\n  window.__rv.hit(${JSON.stringify(name)});`,
  );
}

export function transformLessonCode(babel: BabelStandalone, code: string): string {
  const result = babel.transform(code, {
    presets: [
      ['typescript', { isTSX: true, allExtensions: true }],
      ['react', { runtime: 'automatic' }],
    ],
    filename: 'App.tsx',
  });
  return instrumentRenderCounts(stripExportKeywords(result.code));
}

// ---------------------------------------------------------------------------
// iframe srcdoc: import map (pinned React 19 ESM) + Profiler + counter shim
// ---------------------------------------------------------------------------

// `?dev` pins the DEVELOPMENT build. This isn't optional polish: React's
// standard PRODUCTION build treats <Profiler onRender> as a no-op passthrough
// — per react.dev, "Profiler adds some additional overhead, so it is
// disabled by default in the production build" — so onRender silently never
// fires (confirmed empirically: the demo still renders correctly, but zero
// postMessage commits ever arrive at the host, because the callback is
// simply never invoked). The dev build always calls it, which is exactly
// what this component's whole design depends on.
function buildImportMap(): string {
  return JSON.stringify({
    imports: {
      react: `${REACT_BASE}?dev`,
      'react/jsx-runtime': `${REACT_BASE}/jsx-runtime?dev`,
      'react-dom/client': `${REACT_DOM_BASE}/client?dev&external=react`,
    },
  });
}

export function buildSrcdoc(instrumentedCode: string): string {
  const safe = instrumentedCode.replace(/<\/script/gi, '<\\/script');
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<script type="importmap">${buildImportMap()}</script>` +
    '<style>body{font-family:system-ui,sans-serif;margin:.75rem;color:#111;background:#fff}' +
    'button{font:inherit}</style></head><body>' +
    '<div id="root"></div>' +
    '<script type="module">' +
    'import { createElement, Profiler } from "react";' +
    'import { createRoot } from "react-dom/client";' +
    'window.__rv = { counts: Object.create(null), hit: function (name) { this.counts[name] = (this.counts[name] || 0) + 1; } };' +
    'function __rvPost(type, data) { try { parent.postMessage(Object.assign({ __rv: true, type: type }, data), "*"); } catch (e) {} }' +
    'window.onerror = function (m) { __rvPost("error", { message: String(m) }); return true; };' +
    'window.addEventListener("unhandledrejection", function (e) { __rvPost("error", { message: (e.reason && e.reason.message) || String(e.reason) }); });' +
    '\n' + safe + '\n' +
    'try {' +
    '  var __rvRoot = createRoot(document.getElementById("root"));' +
    '  var __rvCommit = 0;' +
    '  __rvRoot.render(createElement(Profiler, { id: "root", onRender: function (id, phase, actualDuration) {' +
    '    __rvCommit++;' +
    '    __rvPost("commit", { n: __rvCommit, phase: phase, actualDuration: actualDuration, counts: Object.assign({}, window.__rv.counts) });' +
    '  } }, createElement(App)));' +
    '} catch (e) { __rvPost("error", { message: (e && e.message) || String(e) }); }' +
    '</script></body></html>'
  );
}

// ---------------------------------------------------------------------------
// postMessage protocol types + i18n copy
// ---------------------------------------------------------------------------

export interface CommitMessage {
  __rv: true;
  type: 'commit';
  n: number;
  phase: 'mount' | 'update' | 'nested-update';
  actualDuration: number;
  counts: Record<string, number>;
}

export interface ErrorMessage {
  __rv: true;
  type: 'error';
  message: string;
}

export type RvMessage = CommitMessage | ErrorMessage;

export function isRvMessage(data: unknown): data is RvMessage {
  return !!data && typeof data === 'object' && (data as { __rv?: unknown }).__rv === true;
}

export const COPY = {
  en: {
    run: 'Run ▸',
    reset: 'Reset',
    loading: 'Loading Babel…',
    component: 'Component',
    renders: 'Renders',
    lastCommit: 'Last commit (ms)',
    commitLog: 'Commit log',
    commit: 'Commit',
    phase: 'Phase',
    duration: 'Duration (ms)',
    noCommitsYet: 'Click Run — commits will appear here.',
    dash: '–',
  },
  th: {
    run: 'รัน ▸',
    reset: 'รีเซ็ต',
    loading: 'กำลังโหลด Babel…',
    component: 'Component',
    renders: 'จำนวน render',
    lastCommit: 'commit ล่าสุด (ms)',
    commitLog: 'ประวัติ commit',
    commit: 'Commit',
    phase: 'Phase',
    duration: 'เวลา (ms)',
    noCommitsYet: 'กด รัน — commit จะแสดงที่นี่',
    dash: '–',
  },
};

export function copyFor(lang: string | undefined): typeof COPY.en {
  return lang?.startsWith('th') ? COPY.th : COPY.en;
}
