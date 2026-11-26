// Neon Prism v0.3.0 — headless browser render check.
// Serves the game dir over local HTTP, loads it in a headless browser, and
// asserts the M1 core, by hook and by eye:
//   - the menu renders over a LIVE demo (the solver plays chamber 1
//     behind the menu — mirrors flip, the beam bends), with no
//     version/engine text anywhere the player can see, one clear
//     primary Play action, and 3 chamber cards
//   - Play starts chamber 1 with the HUD; rotating a mirror bends the
//     beam ON SCREEN (screen-space asserted — the Drift M2 lesson)
//   - the autopilot (solver bot) clears chamber 1, the complete screen
//     shows, the best score + rank are saved, chamber 2 unlocks
//   - pause focuses Resume; Enter resumes
//   - ?chamber=3 jumps straight into chamber 3 (the playtest path)
//   - feel state returns to rest; shake/flash/music toggles work; the
//     FPS guard drops the DPR cap to 1 on a 2x-DPI page
//   - zero console errors and zero page errors
//
// Run: node tests/render-check.js (Firefox by default; PW_BROWSER=chromium
// for the headless shell). Firefox is the default because its screenshots
// are far faster in this VM (see neon-surge tests/render-check.js probe,
// 2026-11-24). Screenshot timeouts are 300s under SwiftShader.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS_DIR = path.join(os.tmpdir(), 'neon-prism-render-check');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function findHeadlessShell() {
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  try {
    for (const entry of fs.readdirSync(base)) {
      const candidate = path.join(base, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* cache dir missing */ }
  return null;
}
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    '../node_modules/playwright-core',
    '../../neon-surge/node_modules/playwright-core',
    '../../neon-hexfall/node_modules/playwright-core',
  ];
  for (const c of candidates) {
    try { return require(fileURLToPath(new URL(c, import.meta.url))); } catch { /* try next */ }
  }
  throw new Error('playwright-core not found (looked in neon-prism, neon-surge and neon-hexfall node_modules)');
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(GAME_DIR, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(GAME_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const { chromium, firefox } = loadPlaywright();
const PW_BROWSER = process.env.PW_BROWSER || 'firefox';
const errors = [];
const failures = [];
function check(name, cond, extra) {
  if (cond) console.log('  PASS ' + name);
  else { failures.push(name); console.error('  FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
}

let browser;
try {
  if (PW_BROWSER === 'firefox') {
    browser = await firefox.launch({ args: ['--no-sandbox'] });
  } else {
    const executablePath = findHeadlessShell();
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    });
  }
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  // --- menu ---------------------------------------------------------------
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Bangkok' });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`menu console: ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`menu pageerror: ${String(err)}`));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__prism, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const menuText = await page.evaluate(() => document.body.innerText);
  check('menu shows the game title', /NEON\s*PRISM/i.test(menuText));
  check('menu has one clear primary Play action', await page.evaluate(() => {
    const b = document.getElementById('btn-play');
    return b && !b.classList.contains('hidden') && b.textContent.includes('Play');
  }));
  check('no version text on the player-facing menu', !/v0\.3\.0|0\.3\.0/.test(menuText), menuText.slice(0, 200));
  check('no engine text on the player-facing menu', !/three\.js|canvas 2d|webgl/i.test(menuText));
  check('menu lists 12 chambers', await page.evaluate(() => window.__prism.chambers().length === 12));
  const demo1 = await page.evaluate(() => window.__prism.info());
  check('live demo beam exists behind the menu', demo1.beamSegments > 0, JSON.stringify(demo1));
  await page.waitForTimeout(4000);
  const demo2 = await page.evaluate(() => window.__prism.info());
  check('live demo plays behind the menu (mirrors flip / beam changes)',
    JSON.stringify(demo1.orients) !== JSON.stringify(demo2.orients) || demo1.beamSegments !== demo2.beamSegments,
    `${JSON.stringify(demo1.orients)} -> ${JSON.stringify(demo2.orients)}`);
  await page.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, 'menu-1280x720.png') });
  console.log('render-check: menu shot captured');

  // --- chamber select -----------------------------------------------------
  await page.click('#btn-chambers');
  await page.waitForFunction(() => !document.getElementById('chambers').classList.contains('hidden'), null, { timeout: 5000 });
  await page.waitForTimeout(2500);
  check('chamber select shows 12 chamber cards', await page.evaluate(() => document.querySelectorAll('#chamber-grid .level-card').length === 12));
  check('chamber 1 unlocked, chambers 2-12 locked on a fresh save', await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#chamber-grid .level-card')];
    return !cards[0].disabled && cards.slice(1).every((c) => c.disabled);
  }));
  await page.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, 'chambers-1280x720.png') });
  await page.click('#btn-chambers-back');
  await page.waitForFunction(() => window.__prism.state.phase === 'menu', null, { timeout: 5000 });

  // --- play: screen-space rotate + autopilot clear ------------------------
  await page.click('#btn-play');
  await page.waitForFunction(() => window.__prism.state.phase === 'playing', null, { timeout: 5000 });
  check('Play starts chamber 1', await page.evaluate(() => window.__prism.state.chamberId === 1));
  check('HUD is visible while playing', await page.evaluate(() => !document.getElementById('hud').classList.contains('hidden')));
  const audio = await page.evaluate(() => window.__prism.audio());
  check('music loop runs after Play (audio live, scheduler on)', audio.hasAudio && audio.musicOn && audio.musicPlaying, JSON.stringify(audio));
  const tip0 = await page.evaluate(() => window.__prism.info().beamTip);
  await page.evaluate(() => window.__prism.rotateIndex(0));
  await page.waitForTimeout(600);
  const tip1 = await page.evaluate(() => window.__prism.info().beamTip);
  check('screen space: rotating a mirror bends the beam ON SCREEN',
    Math.hypot(tip1.x - tip0.x, tip1.y - tip0.y) > 30,
    `(${tip0.x.toFixed(0)},${tip0.y.toFixed(0)}) -> (${tip1.x.toFixed(0)},${tip1.y.toFixed(0)})`);
  check('HUD moves counter follows the rotation', await page.evaluate(() =>
    document.getElementById('hud-moves').textContent.includes('Moves left 2')));
  // M3: the rotate fires its feedback bundle in the same frame —
  // rotate-snap sparks at the mirror + beam-block sparks at the wall.
  const fx1 = await page.evaluate(() => window.__prism.feel());
  check('M3 rotate bundle fired (rotate + block counters, sparks alive)',
    fx1.fxCounts.rotate >= 1 && fx1.fxCounts.block >= 1 && fx1.particlesAlive > 0, JSON.stringify(fx1.fxCounts));
  check('M3 music lift is 1 with no receptors lit', await page.evaluate(() => window.__prism.audio().lift === 1));
  // M3: MOVES meter low state on the last move.
  await page.evaluate(() => window.__prism.rotateIndex(1));
  await page.waitForTimeout(300);
  check('M3 MOVES meter turns low on the last move', await page.evaluate(() =>
    document.getElementById('hud-moves').textContent.includes('Moves left 1') &&
    document.getElementById('hud-moves-fill').classList.contains('low')));
  // Restart fresh for the autopilot clear (the probe rotation spent a move).
  await page.evaluate(() => window.__prism.startChamber(1));
  await page.evaluate(() => window.__prism.autopilot(true));
  await page.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, 'gameplay-1280x720.png') });
  console.log('render-check: gameplay shot captured');
  await page.waitForFunction(() => window.__prism.state.phase === 'complete', null, { timeout: 60000 });
  const final = await page.evaluate(() => window.__prism.state);
  check('autopilot (solver bot) clears chamber 1 in the real browser', final.won === true && final.chamberId === 1, JSON.stringify(final));
  check('complete screen shows the score', await page.evaluate(() => /Score \d/.test(document.getElementById('complete-score').textContent)));
  check('M3 solve bundle fired (solve counter)', await page.evaluate(() => window.__prism.feel().fxCounts.solve >= 1));
  check('M3 complete screen names the score parts', await page.evaluate(() =>
    /Clear 1000 \+ Efficiency \d+ \+ Time \d+ = \d+/.test(document.getElementById('complete-parts').textContent)),
    await page.evaluate(() => document.getElementById('complete-parts').textContent));
  check('complete screen shows the clear rank badge', await page.evaluate(() =>
    /^RANK [SAB]$/.test(document.getElementById('complete-rank').textContent.trim())));
  check('best score is saved after the clear', await page.evaluate(() => {
    const s = window.__prism.save;
    return s.best && s.best[1] && s.best[1].score > 0;
  }));
  check('clearing chamber 1 unlocks chamber 2', await page.evaluate(() => window.__prism.save.unlocked >= 2));
  await page.click('#btn-complete-menu');
  await page.waitForFunction(() => window.__prism.state.phase === 'menu', null, { timeout: 5000 });
  await page.waitForTimeout(2500);
  const feelRest = await page.evaluate(() => window.__prism.feel());
  check('feel state returns to rest (trauma 0, timeScale 1, flash 0, zoom 0)',
    feelRest.trauma === 0 && feelRest.timeScale === 1 && feelRest.flashT === 0 && feelRest.zoomT === 0,
    JSON.stringify(feelRest));
  await context.close();

  // --- pause + denied cue ---------------------------------------------------
  const context2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Bangkok' });
  const page2 = await context2.newPage();
  page2.on('console', (msg) => { if (msg.type() === 'error') errors.push(`pause console: ${msg.text()}`); });
  page2.on('pageerror', (err) => errors.push(`pause pageerror: ${String(err)}`));
  await page2.goto(`http://127.0.0.1:${port}/?chamber=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page2.waitForFunction(() => window.__prism, null, { timeout: 30000 });
  await page2.waitForFunction(() => window.__prism.state.phase === 'playing', null, { timeout: 5000 });
  check('?chamber=1 jumps straight into chamber 1', await page2.evaluate(() => window.__prism.state.chamberId === 1));
  await page2.evaluate(() => window.__prism.pause());
  await page2.waitForFunction(() => window.__prism.state.phase === 'pause', null, { timeout: 5000 });
  check('pause shows the pause screen with Resume focused', await page2.evaluate(() => document.activeElement && document.activeElement.id === 'btn-resume'));
  await page2.keyboard.press('Enter');
  await page2.waitForFunction(() => window.__prism.state.phase === 'playing', null, { timeout: 5000 });
  check('Enter resumes the run', true);
  // Denied cue: tapping an empty cell names the reason (never silence).
  const denied = await page2.evaluate(() => window.__prism.rotateAt(0, 0));
  check('rotateAt on an empty cell is denied', denied === false);
  // M3 budget-fail bundle: waste the budget on decoys, the fail fires.
  await page2.evaluate(() => { window.__prism.rotateIndex(2); window.__prism.rotateIndex(3); window.__prism.rotateIndex(4); });
  await page2.waitForFunction(() => window.__prism.state.phase === 'gameover', null, { timeout: 10000 });
  check('M3 budget-fail bundle fired (fail counter + game-over screen)',
    await page2.evaluate(() => window.__prism.feel().fxCounts.fail >= 1 && !document.getElementById('gameover').classList.contains('hidden')));
  await context2.close();

  // --- ?chamber=3 playtest path ---------------------------------------------
  const context3 = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Bangkok' });
  const page3 = await context3.newPage();
  page3.on('console', (msg) => { if (msg.type() === 'error') errors.push(`chamber3 console: ${msg.text()}`); });
  page3.on('pageerror', (err) => errors.push(`chamber3 pageerror: ${String(err)}`));
  await page3.goto(`http://127.0.0.1:${port}/?chamber=3`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page3.waitForFunction(() => window.__prism, null, { timeout: 30000 });
  await page3.waitForFunction(() => window.__prism.state.phase === 'playing', null, { timeout: 5000 });
  check('?chamber=3 jumps straight into chamber 3', await page3.evaluate(() => window.__prism.state.chamberId === 3));
  const c3 = await page3.evaluate(() => window.__prism.info());
  check('chamber 3 beam traces through the prism (segments > 0)', c3.beamSegments > 0 && c3.total === 2, JSON.stringify(c3));
  await page3.evaluate(() => window.__prism.autopilot(true));
  // M3: music lifts once a receptor lights (lift 2 with one, 4 with two).
  await page3.waitForFunction(() => window.__prism.info().lit >= 1, null, { timeout: 30000 });
  check('M3 music lifts with receptors lit', await page3.evaluate(() => window.__prism.audio().lift >= 2));
  check('M3 receptor-lit bundle fired (lit counter)', await page3.evaluate(() => window.__prism.feel().fxCounts.lit >= 1));
  await page3.waitForFunction(() => window.__prism.state.phase === 'complete', null, { timeout: 60000 });
  check('autopilot clears chamber 3 (both prism branches lit)', await page3.evaluate(() => window.__prism.state.won === true));
  await page3.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, 'chamber3-1280x720.png') });
  console.log('render-check: chamber 3 shot captured');
  await context3.close();

  // --- mid + late chambers (M2 spread) --------------------------------------
  const context4 = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Bangkok' });
  const page4 = await context4.newPage();
  page4.on('console', (msg) => { if (msg.type() === 'error') errors.push(`chamber6 console: ${msg.text()}`); });
  page4.on('pageerror', (err) => errors.push(`chamber6 pageerror: ${String(err)}`));
  await page4.goto(`http://127.0.0.1:${port}/?chamber=6`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page4.waitForFunction(() => window.__prism, null, { timeout: 30000 });
  await page4.waitForFunction(() => window.__prism.state.phase === 'playing', null, { timeout: 5000 });
  check('?chamber=6 jumps straight into chamber 6', await page4.evaluate(() => window.__prism.state.chamberId === 6));
  await page4.evaluate(() => window.__prism.autopilot(true));
  await page4.waitForFunction(() => window.__prism.state.phase === 'complete', null, { timeout: 90000 });
  check('autopilot clears chamber 6 (mid spread)', await page4.evaluate(() => window.__prism.state.won === true));
  await page4.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, 'chamber6-1280x720.png') });
  console.log('render-check: chamber 6 shot captured');
  await context4.close();

  const context5 = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Bangkok' });
  const page5 = await context5.newPage();
  page5.on('console', (msg) => { if (msg.type() === 'error') errors.push(`chamber12 console: ${msg.text()}`); });
  page5.on('pageerror', (err) => errors.push(`chamber12 pageerror: ${String(err)}`));
  await page5.goto(`http://127.0.0.1:${port}/?chamber=12`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page5.waitForFunction(() => window.__prism, null, { timeout: 30000 });
  await page5.waitForFunction(() => window.__prism.state.phase === 'playing', null, { timeout: 5000 });
  check('?chamber=12 jumps straight into chamber 12', await page5.evaluate(() => window.__prism.state.chamberId === 12));
  const c12 = await page5.evaluate(() => window.__prism.info());
  check('chamber 12 beam traces with 3 receptors', c12.beamSegments > 0 && c12.total === 3, JSON.stringify(c12));
  await page5.evaluate(() => window.__prism.autopilot(true));
  await page5.waitForFunction(() => window.__prism.state.phase === 'complete', null, { timeout: 120000 });
  check('autopilot clears chamber 12 (late spread)', await page5.evaluate(() => window.__prism.state.won === true));
  // M2 carry-over fix: no disabled "All Chambers Clear" primary button —
  // the title carries the message and Next is hidden.
  check('M3 last-chamber complete screen hides Next, titles All Chambers Clear', await page5.evaluate(() =>
    document.getElementById('btn-next').classList.contains('hidden') &&
    document.getElementById('complete-title').textContent === 'All Chambers Clear'));
  await page5.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, 'chamber12-1280x720.png') });
  console.log('render-check: chamber 12 shot captured');
  await context5.close();

  // --- toggles + FPS guard ----------------------------------------------------
  const contextG = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Bangkok' });
  const pageG = await contextG.newPage();
  pageG.on('console', (msg) => { if (msg.type() === 'error') errors.push(`fps-guard console: ${msg.text()}`); });
  pageG.on('pageerror', (err) => errors.push(`fps-guard pageerror: ${String(err)}`));
  await pageG.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pageG.waitForFunction(() => window.__prism, null, { timeout: 30000 });
  await pageG.evaluate(() => window.__prism.setFlash(false));
  check('flash toggle turns flashing off (persisted)', await pageG.evaluate(() => window.__prism.feel().flashEnabled === false && window.__prism.save.settings.flash === false));
  await pageG.evaluate(() => window.__prism.setFlash(true));
  await pageG.evaluate(() => window.__prism.setMusic(false));
  check('music toggle stops the loop', await pageG.evaluate(() => window.__prism.audio().musicPlaying === false));
  await pageG.evaluate(() => window.__prism.setMusic(true));
  const backingBefore = await pageG.evaluate(() => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    window.dispatchEvent(new Event('resize'));
    return document.getElementById('game').width;
  });
  check('high-DPI backing store starts at 2x', backingBefore === 2560, `canvas width=${backingBefore}`);
  await pageG.evaluate(() => window.__prism.triggerFpsGuard());
  check('FPS guard drops the DPR cap to 1', await pageG.evaluate(() => window.__prism.dprCap === 1));
  const backingAfter = await pageG.evaluate(() => document.getElementById('game').width);
  check('canvas backing store shrinks to 1x after the guard', backingAfter === 1280, `canvas width=${backingAfter}`);
  await contextG.close();

  if (errors.length > 0) {
    console.error('render-check: console/page errors:');
    for (const e of errors) console.error('  ' + e);
    failures.push(`${errors.length} console/page error(s)`);
  }
} catch (err) {
  console.error('render-check: FAIL —', err.message);
  failures.push(err.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}

if (failures.length > 0) { console.error(`render-check: ${failures.length} failure(s)`); process.exit(1); }
console.log(`render-check: PASS — shots in ${SHOTS_DIR} — INSPECT BY EYE (menu, chambers, gameplay, chamber 3)`);
