#!/usr/bin/env node
// Playwright check for <RenderVisualizer> (react-deep-dive phase3/4 spec §3.3).
//
// Usage:
//   node tools/render-visualizer.spec.mjs <baseUrl>
//   e.g. node tools/render-visualizer.spec.mjs http://127.0.0.1:4321
//
// This is a plain script (no @playwright/test runner) so it needs only the
// `playwright` package to be resolvable, not a project dependency. If this
// repo hasn't installed it, run once with:
//   npm install --no-save playwright && npx playwright install chromium
//   node tools/render-visualizer.spec.mjs <baseUrl>
//   npm uninstall playwright   # cleanup — --no-save means package.json/lock never changed
// (`npx playwright@latest` alone cannot run an arbitrary node script — its
// bin is the `playwright` CLI, which only executes files via its own `test`
// subcommand — so the `--no-save` install above is the working equivalent
// for a plain, non-@playwright/test script like this one.)
//
// What it checks, per lesson page (EN and TH):
//   1. Navigate to the lesson, wait for the RenderVisualizer's Run button.
//   2. Click Run — assert the commit table populates (loses its placeholder
//      row) and the version badge shows real, non-empty Babel/React text.
//   3. Click a button INSIDE the rendered iframe app (e.g. "Parent tick") —
//      assert the table's numbers actually change in response (proves the
//      Profiler->postMessage->host pipeline is live, not just the initial
//      mount commit).
//   4. Assert zero page-level console errors accumulated across the whole
//      flow.
//
// Known timing quirk (documented, not a bug in the component): the island
// hydrates client:visible, so the very first click right after navigation
// can land before hydration attaches the listener. This script's `runOnce`
// helper clicks Run, and if the table is still showing the placeholder
// after a short wait, clicks it again once — exactly the workaround this
// session needed manually. See the final report's "limitations" section.

import { chromium } from 'playwright';

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error('Usage: node tools/render-visualizer.spec.mjs <baseUrl>');
  process.exit(1);
}

const LESSONS = [
  { path: '/react/en/foundations/rendering-and-reconciliation/', innerButton: 'Parent tick' },
  { path: '/react/th/foundations/rendering-and-reconciliation/', innerButton: 'Parent tick' },
  { path: '/react/en/performance-and-patterns/memoization-in-practice/', innerButton: 'Parent tick' },
  { path: '/react/th/performance-and-patterns/memoization-in-practice/', innerButton: 'Parent tick' },
];

function tableText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function checkLesson(browser, { path, innerButton }) {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  const url = baseUrl.replace(/\/$/, '') + path;
  await page.goto(url, { waitUntil: 'load' });

  const runBtn = page.locator('.rv__run').first();
  await runBtn.waitFor({ state: 'visible', timeout: 15000 });

  // Click Run, and once more if hydration hadn't attached the listener yet
  // (see module doc comment) — wait for the placeholder row to disappear.
  await runBtn.click();
  let tableHtml = await page.locator('.rv__table').innerHTML();
  const stillPlaceholder = () => /commits will appear here|commit จะแสดงที่นี่/.test(tableHtml);
  for (let attempt = 0; attempt < 4 && stillPlaceholder(); attempt++) {
    await page.waitForTimeout(1000);
    tableHtml = await page.locator('.rv__table').innerHTML();
  }
  if (stillPlaceholder()) {
    await runBtn.click();
    for (let attempt = 0; attempt < 6 && stillPlaceholder(); attempt++) {
      await page.waitForTimeout(1000);
      tableHtml = await page.locator('.rv__table').innerHTML();
    }
  }
  if (stillPlaceholder()) {
    throw new Error(`${path}: table never populated after clicking Run (still shows placeholder)`);
  }

  const badgeText = (await page.locator('.rv__badge').first().textContent())?.trim() ?? '';
  if (!/Babel \d/.test(badgeText) || !/React \d/.test(badgeText)) {
    throw new Error(`${path}: version badge missing Babel/React version text: "${badgeText}"`);
  }

  const beforeInteract = tableText(tableHtml);

  // Interact with the rendered app itself (inside the sandboxed iframe).
  const frame = page.frameLocator('.rv__frame');
  await frame.getByRole('button', { name: new RegExp('^' + innerButton) }).first().click();
  await page.waitForTimeout(800);
  const afterInteract = tableText(await page.locator('.rv__table').innerHTML());

  if (afterInteract === beforeInteract) {
    throw new Error(`${path}: table did not change after clicking "${innerButton}" inside the iframe`);
  }

  if (consoleErrors.length) {
    throw new Error(`${path}: ${consoleErrors.length} console error(s): ${consoleErrors.join(' | ')}`);
  }

  await page.close();
  return { path, badgeText, beforeInteract, afterInteract };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  let failed = false;
  for (const lesson of LESSONS) {
    try {
      const result = await checkLesson(browser, lesson);
      results.push(result);
      console.log(`PASS  ${lesson.path}`);
      console.log(`      badge: ${result.badgeText}`);
      console.log(`      before interaction: ${result.beforeInteract}`);
      console.log(`      after interaction:  ${result.afterInteract}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL  ${lesson.path}`);
      console.log(`      ${err.message}`);
    }
  }
  await browser.close();
  console.log(`\n${results.length}/${LESSONS.length} lesson(s) passed.`);
  process.exit(failed ? 1 : 0);
}

main();
