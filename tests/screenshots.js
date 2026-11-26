// Neon Prism v1.0.0 — size sweep screenshots.
// Serves the game dir over local HTTP and captures the menu + gameplay at
// 1280x720, 2560x1080 and 1080x2340 (portrait). Inspect every shot by eye:
// no clipped or overlapping elements, no cut-off text, HUD fits. The
// 1280x720 menu + gameplay shots are also copied to docs/screenshots/ for
// the README.
//
// Run: node tests/screenshots.js (Firefox by default; PW_BROWSER=chromium
// for the headless shell). Firefox is the default because its screenshots
// are far faster in this VM (see neon-surge tests/render-check.js probe,
// 2026-11-24).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS_DIR = path.join(os.tmpdir(), 'neon-prism-size-sweep');
const DOCS_DIR = path.join(GAME_DIR, 'docs', 'screenshots');
const SIZES = [
  { name: '1280x720', width: 1280, height: 720, deviceScaleFactor: 1 },
  { name: '2560x1080', width: 2560, height: 1080, deviceScaleFactor: 0.5 },
  { name: '1080x2340', width: 1080, height: 2340, deviceScaleFactor: 0.5 },
];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json',
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
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const { chromium, firefox } = loadPlaywright();
const PW_BROWSER = process.env.PW_BROWSER || 'firefox';
const errors = [];
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
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.deviceScaleFactor,
      timezoneId: 'Asia/Bangkok',
    });
    await context.addInitScript(() => {
      localStorage.setItem('neon-prism-save-v1', JSON.stringify({
        version: 1,
        best: {
          1: { score: 2150, moves: 2, time: 18.5, rank: 'S' },
          2: { score: 1980, moves: 4, time: 33.2, rank: 'A' },
        },
        unlocked: 3,
        settings: { volume: 0.8, shake: 1, music: true, sfx: true, flash: true, muted: false, textSize: 'normal', contrast: false },
      }));
    });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`${size.name} console: ${msg.text()}`); });
    page.on('pageerror', (err) => errors.push(`${size.name} pageerror: ${String(err)}`));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__prism, null, { timeout: 30000 });
    await page.waitForTimeout(5000); // menu pop-in + demo running
    await page.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, `menu-${size.name}.png`) });
    // Mid-play gameplay shot: deep-link chamber 1 and rotate once so the
    // beam bends with the HUD up. (Play + autopilot clears in seconds
    // and the shot would catch the complete screen instead.)
    await page.goto(`http://127.0.0.1:${port}/?chamber=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.__prism.state.phase === 'playing', null, { timeout: 5000 });
    await page.evaluate(() => window.__prism.rotateIndex(0));
    await page.waitForTimeout(800); // rotate animation settles
    await page.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, `gameplay-${size.name}.png`) });
    // The solver clears a chamber in seconds, so by now the run may
    // already be on the complete screen — quit via the hook either way.
    await page.evaluate(() => window.__prism.quitToMenu());
    await page.waitForFunction(() => window.__prism.state.phase === 'menu', null, { timeout: 5000 });
    await page.click('#btn-chambers');
    await page.waitForFunction(() => !document.getElementById('chambers').classList.contains('hidden'), null, { timeout: 5000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ timeout: 300000, path: path.join(SHOTS_DIR, `chambers-${size.name}.png`) });
    console.log(`size-sweep: ${size.name} captured (menu, gameplay, chambers)`);
    await context.close();
  }
  for (const name of ['menu-1280x720.png', 'gameplay-1280x720.png']) {
    fs.copyFileSync(path.join(SHOTS_DIR, name), path.join(DOCS_DIR, name));
  }
  console.log(`size-sweep: docs copies written to ${DOCS_DIR}`);
  if (errors.length > 0) {
    console.error('size-sweep: console/page errors:');
    for (const e of errors) console.error('  ' + e);
    throw new Error(`${errors.length} console/page error(s)`);
  }
  console.log(`size-sweep: PASS — shots in ${SHOTS_DIR} — INSPECT BY EYE at all 3 sizes (no clipped/overlapping elements)`);
} catch (err) {
  console.error('size-sweep: FAIL —', err.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}
