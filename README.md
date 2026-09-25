# React Deep Dive

Bilingual (EN/TH) Astro + Starlight course on React 19.

## Scripts

- `npm run dev` / `npm run build` / `npm run preview` — Astro site.
- `npm run check` — EN/TH lesson parity (`tools/check-parity.mjs`): heading counts,
  quiz question/answer parity, Thai-language checks, byte-identical code fences.
- `npm run verify` — snippet-verification harness (`tools/verify-snippets.mjs`), see below.

## Harness

This course has no in-browser playground, so lesson code can't be proven correct
by running it in the reader's tab. Instead, `tools/verify-snippets.mjs` drives a
real scaffolded Vite React+TS project — the **probe**, at `tools/probe/`
(gitignored) — and type-checks (`tsc`) or runs (`vitest`) lesson snippets against it.

**Fence convention.** In `src/content/docs/en/**/*.mdx`, a fenced code block in
`tsx`/`ts` whose first line is a path comment (`// src/components/Counter.tsx`,
`// src/__tests__/counter.test.tsx`) is treated as a real project file and gets
collected. A path ending `.test.ts`/`.test.tsx` is additionally treated as a test
file, run under `--test`. A first line containing `@expect-error` marks a
deliberate compile error (the lesson prose carries the real error text);
everything else is a fragment with no path comment and is skipped. Fences inside
a `<Quiz ... questions={...}>` array or a `<SpotTheBug code={\`...\`}>` prop are
never mistaken for real fences even when they contain literal ``` sequences —
the same string-literal-aware scanning `tools/check-parity.mjs` already uses.

**Namespacing / cross-lesson imports.** Every collected fence is written to
`tools/probe/lessons/<module>__<lesson>/<path>`, namespaced per lesson so two
lessons can each define `src/components/Counter.tsx` without colliding. This
course uses plain relative imports (no `@/` alias), so a fence's own relative
imports resolve naturally inside its namespace. When a fence imports a relative
path that does not exist in its own lesson, but another lesson defines that
exact path with its own bare path-comment fence, the specifier is rewritten at
write time to point at that lesson's copy — the first lesson (in module/file
order) that defines the path wins. This lets a later lesson reuse a
component/hook a prior lesson already defined, the way a real project would.

**Type-check mode (default):** `npm run verify`
Clears and rewrites `tools/probe/lessons/`, then runs `tsc --noEmit -p
tools/probe/tsconfig.app.json` once for the whole probe. (The probe's root
`tsconfig.json` is Vite's solution-style file — `files: []` plus `references` —
which only does real work under `tsc -b`; pointing at `tsconfig.app.json`
directly, which is patched to `include` the lessons tree, is the minimal-diff
way to get a plain `--noEmit` check.) Diagnostics are mapped back to `<lesson
file>:fence #n (<path>)`. Exits non-zero on any error. Prints a per-module
summary of fences collected / skipped (no path comment) / skipped
(`@expect-error`) / tests.

**Test mode:** `npm run verify -- --test [module/lesson]`
Runs `vitest run` (with `tools/probe/vitest.config.ts`) over every collected
`*.test.ts`/`*.test.tsx` fence, or only the given lesson's namespace when
`module/lesson` is passed (e.g. `hooks/useeffect-and-effects`). Prints
pass/fail counts per lesson and the first line of each failing assertion's
message, then exits with vitest's own exit code.

**Self-test:** `npm run verify -- --self-test`
Runs the type-check path against a temporary lesson with a deliberately
broken-type fence (must fail `tsc`) and a correct fence (must pass), plus a
type-valid but assertion-failing test fence (must fail under `--test`), then
cleans up.

**Refresh the probe:** `npm run verify -- --refresh` wipes and rescaffolds
`tools/probe/` from `create-vite@latest --template react-ts`, then installs the
dev dependencies the template doesn't ship (`vitest`, `jsdom`,
`@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`) and (re)writes `vitest.config.ts` /
`vitest.setup.ts` and the `tsconfig.app.json` patch. The very first probe in
this repo was seeded from a pre-built scaffold instead of running this install
from scratch; `--refresh` does not depend on that and works from a clean
checkout.

**Vitest globals + jest-dom types (decision).** `vitest.config.ts` sets
`test.globals: true` (so test fences can use `describe`/`it`/`expect` without an
import) and `tsconfig.app.json`'s `types` includes `"vitest/globals"` and
`"@testing-library/jest-dom"` (matching jest-dom's own documented Vitest
setup), so `expect(el).toBeInTheDocument()`-style matcher calls type-check with
no per-fence import. Test fences still need explicit imports for
`render`/`screen`/`userEvent` and the component under test — only the vitest
API and jest-dom matcher *types* are global.

**Known probe gotcha.** The probe's `tsconfig.app.json` (inherited from Vite's
`react-ts` template, not added by this harness) also sets `noUnusedLocals`,
`noUnusedParameters`, and `erasableSyntaxOnly`. A lesson fence with an unused
import/parameter, or a TS-only runtime construct such as an `enum` or
constructor parameter property, will fail `tsc` under this harness even though
it's otherwise valid TypeScript — write fences clean of unused bindings and
avoid those constructs.

## RenderVisualizer

A narrow-scope, in-browser React 19 playground (spec §3.3, review §4.4) used
in four lessons — `foundations/rendering-and-reconciliation`,
`performance-and-patterns/memoization-in-practice`,
`performance-and-patterns/rendering-performance`, `state-and-data/context` —
where a live render count says more than prose. Not a generic "run any React
code" sandbox: each lesson supplies one `export const xxxCode` template
literal defining a small app that ends in `export default function App()`.

**Architecture.** `src/components/RenderVisualizer.astro` renders the code
statically via Expressive Code (read-only, matches `TSPlayground.astro`'s
pattern) and mounts `RenderVisualizerIsland.tsx` (`client:visible`, Preact) next
to it. Clicking **Run**:

1. Lazily loads **Babel standalone 7.29.9** (pinned, from jsdelivr) in the host
   page and transpiles the lesson's JSX/TSX with the `typescript` + `react`
   (automatic runtime) presets.
2. Strips the leading `export`/`export default` (same idea as
   `ts-runner.ts`'s `stripExportKeywords`) so the code becomes plain top-level
   declarations.
3. **Instrumentation shim:** a regex finds every capitalized top-level
   `function Name(...) {` — including one nested inside `memo(function
   Name(...) {...})` — and inserts `window.__rv.hit("Name")` as its first
   statement. This is a regex, not a Babel/AST visitor, on purpose: it runs on
   Babel's *output* (after `preset-typescript` has already stripped every type
   annotation), so it never has to parse a parameter type. In exchange, every
   lesson's `xxxCode` is written to fit the regex's one real constraint:
   components are plain `function Name(...) { ... }` declarations (never
   arrow-function components), and no parameter has a default value
   containing a literal `)` (e.g. a call expression) — see the doc comment in
   `render-visualizer-runtime.ts` for the full reasoning.
4. The instrumented code is embedded in an **iframe `srcdoc`**
   (`sandbox="allow-scripts"`, no `allow-same-origin` — opaque origin) with an
   `importmap` pinning **React 19.3.0's DEVELOPMENT build from esm.sh**
   (`?dev`, plus `?external=react` on `react-dom/client` so it resolves the
   *same* React instance as the import map instead of bundling its own copy).
   The dev build is required, not cosmetic: React's standard **production**
   build treats `<Profiler onRender>` as a no-op passthrough (per react.dev,
   profiling is disabled by default in production) — confirmed the hard way
   during development, where the demo rendered perfectly but zero commits
   ever reached the host because `onRender` was simply never invoked.
5. The app is wrapped in `<Profiler id="root" onRender>`. Every commit,
   `onRender` posts `{ n, phase, actualDuration, counts }` back to the host via
   `postMessage` (`counts` is a snapshot of the instrumentation shim's
   per-component call tally).
6. The host diffs each new `counts` snapshot against the previous one to know
   which components rendered *this* commit, and renders a table (component ·
   cumulative renders · this-component's duration on its last commit, or `–`
   if it didn't render that commit) plus a collapsible commit log
   (commit # · phase · `actualDuration`). **Reset** clears the table and
   commit log and remounts the iframe (a fresh module realm ⇒ fresh
   `window.__rv.counts` ⇒ the demo app's own state resets too).

**Files:** `src/components/RenderVisualizer.astro` (wrapper + static code
display), `src/components/RenderVisualizerIsland.tsx` (Preact island: state,
buttons, table, commit log), `src/components/render-visualizer-runtime.ts`
(pure logic: Babel loading, the strip/instrument regexes, the import map and
srcdoc builder, the `postMessage` protocol types, EN/TH copy) — split the same
way `ts-runner.ts` is split from `TSPlayground.astro`.

**Limitations:**
- Single-file only — one `App` per embed, no multi-module imports beyond
  `react`.
- No hooks-level tracing — the shim counts component *function calls*
  (renders), not individual hook re-evaluations.
- Only plain `function Name(...) { ... }` component declarations are
  instrumented (see step 3 above) — not arrow-function components.
- The per-component "last commit (ms)" column shares the *whole commit's*
  `actualDuration` (React's `Profiler` only measures at the point you place
  it — here, the root) — it is not a true per-component duration breakdown,
  only "did this component render in the commit that took this long."
- The lesson `xxxCode` literals are plain string literals, not fenced code
  blocks with a path-comment first line — `tools/verify-snippets.mjs` only
  collects fences (` ``` `), so these aren't (and can't be) picked up by that
  harness. They're verified instead by the Playwright check below.

**Proof:** `tools/render-visualizer.spec.mjs` is a plain Playwright script
(not a `@playwright/test` suite) — `node tools/render-visualizer.spec.mjs
<baseUrl>` against a running `astro preview`/`astro dev` server. For each of
the four embedding lessons (EN + TH), it clicks Run, asserts the commit table
populates with a real Babel/React version badge, clicks a button inside the
rendered iframe app, asserts the table's numbers actually change, and asserts
zero console errors. If `playwright` isn't installed in this repo (it isn't,
by design — no new dependency was added), run once with `npm install --no-save
playwright && npx playwright install chromium`, run the script, then `npm
uninstall playwright` to clean up (`--no-save` never touches
`package.json`/`package-lock.json`, so this is fully reversible).
