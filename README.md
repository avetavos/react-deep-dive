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
