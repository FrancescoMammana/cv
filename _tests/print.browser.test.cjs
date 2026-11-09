const assert = require('node:assert/strict');
const { test, before, after, beforeEach, afterEach } = require('node:test');
const { createServer } = require('node:http');
const { readFile, mkdtemp } = require('node:fs/promises');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const run = promisify(execFile);
const site = path.resolve(process.env.CV_SITE_DIR || path.join(__dirname, '../_site'));
const prefix = (process.env.CV_BASEURL || '').replace(/\/$/, '');
let server, browser, page, baseURL, output, pageErrors;

async function serve(request, response) {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname.slice(prefix.length).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(site, relative);
  if (!pathname.startsWith(`${prefix}/`) || !file.startsWith(site + path.sep)) {
    response.writeHead(404).end();
    return;
  }
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
    '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' };
  for (const candidate of [file, file + '.html', path.join(file, 'index.html')]) {
    try {
      const bytes = await readFile(candidate);
      response.setHeader('Content-Type', types[path.extname(candidate)] || 'application/octet-stream');
      response.end(bytes);
      return;
    } catch {}
  }
  response.writeHead(404).end();
}

before(async function () {
  await readFile(path.join(site, 'index.html'));
  output = await mkdtemp(path.join(os.tmpdir(), 'cv-print-tests-'));
  server = createServer(serve);
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  baseURL = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
});

after(async function () {
  if (browser) await browser.close();
  if (server) await new Promise(function (resolve) { server.close(resolve); });
});

beforeEach(async function () {
  page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  pageErrors = [];
  page.on('pageerror', function (error) { pageErrors.push(error.message); });
  await page.route('https://www.googletagmanager.com/**', async function (route) {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.goto(baseURL + '/');
});

afterEach(async function () {
  try { assert.deepEqual(pageErrors, []); }
  finally { if (page) await page.close(); }
});

async function openPreview() {
  await page.click('#pdfButton');
  await page.waitForSelector('#printButton:not([disabled])');
}

async function pdfDetails(file) {
  const { stdout: info } = await run('pdfinfo', [file]);
  const { stdout: text } = await run('pdftotext', [file, '-']);
  const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  return { pages: Number(info.match(/Pages:\s+(\d+)/)[1]),
    width: Number(size[1]), height: Number(size[2]), text: text.replace(/\s+/g, ' ').trim() };
}

test('PDF opens a same-tab Italian preview and prints only on a user click', async function () {
  assert.equal(await page.locator('script[src*="html2pdf"]').count(), 0);
  assert.equal(await page.getAttribute('html', 'lang'), 'it');
  await openPreview();
  assert.equal(new URL(page.url()).pathname, prefix + '/print');
  assert.equal(page.context().pages().length, 1);
  const name = await page.textContent('.name');
  assert.equal(await page.title(), name.trim().replace(/ /g, '_') + '_CV');
  await page.evaluate(function () {
    window.print = function () { window.printCalled = navigator.userActivation.isActive; };
  });
  assert.equal(await page.evaluate(function () { return window.printCalled; }), undefined);
  await page.click('#printButton');
  assert.equal(await page.evaluate(function () { return window.printCalled; }), true);
  await page.getByRole('link', { name: 'Torna al CV' }).click();
  assert.equal(new URL(page.url()).pathname, prefix + '/');
});

test('printing waits for the profile image', async function () {
  let release;
  const gate = new Promise(function (resolve) { release = resolve; });
  await page.route('**/assets/images/profilecv.png', async function (route) {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(baseURL + '/print', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.isDisabled('#printButton'), true);
  } finally { release(); }
  await page.waitForSelector('#printButton:not([disabled])');
  assert.equal(await page.locator('.avatar').evaluate(function (image) { return image.naturalWidth > 0; }), true);
});

test('a missing image is reported without blocking printing forever', async function () {
  await page.route('**/assets/images/profilecv.png', async function (route) { await route.abort(); });
  await openPreview();
  assert.match(await page.textContent('#printStatus'), /immagini non sono state caricate/);
});

test('preview is responsive at phone widths and both controls stay accessible', async function () {
  await openPreview();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(function () {
      return { columns: getComputedStyle(document.querySelector('.wrapper')).display,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(layout.columns, 'block');
    assert.equal(layout.overflow, false);
    const separated = await page.evaluate(function () {
      const organization = document.querySelector('.cert-org').getBoundingClientRect();
      const link = document.querySelector('.cert-url').getBoundingClientRect();
      return link.top >= organization.bottom;
    });
    assert.equal(separated, true);
    assert.equal(await page.getByRole('link', { name: 'Torna al CV' }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Stampa / Salva PDF' }).isVisible(), true);
  }
});

test('print keeps dates inside their rows, removes the shadow and hides controls', async function () {
  await openPreview();
  const screenShadow = await page.locator('.wrapper').evaluate(function (element) { return getComputedStyle(element).boxShadow; });
  assert.notEqual(screenShadow, 'none');
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });
  const result = await page.evaluate(function () {
    return { shadow: getComputedStyle(document.querySelector('.wrapper')).boxShadow,
      controls: getComputedStyle(document.querySelector('.print-controls')).display,
      dates: [...document.querySelectorAll('.main-wrapper .time')].every(function (date) {
        const bounds = date.getBoundingClientRect(), row = date.parentElement.getBoundingClientRect();
        return bounds.top >= row.top && bounds.bottom <= row.bottom + 0.1;
      }) };
  });
  assert.deepEqual(result, { shadow: 'none', controls: 'none', dates: true });
  await page.emulateMedia({ media: 'screen' });
  assert.equal(await page.locator('.wrapper').evaluate(function (element) { return getComputedStyle(element).boxShadow; }), screenShadow);
});

test('native PDF is A4 with identical selectable content on desktop and mobile', async function () {
  await openPreview();
  const name = (await page.textContent('.name')).trim();
  const companies = await page.locator('.experiences-section .company').allTextContents();
  const documents = [];
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const file = path.join(output, `cv-${width}.pdf`);
    await page.pdf({ path: file, format: 'A4', preferCSSPageSize: true, printBackground: true });
    const document = await pdfDetails(file);
    assert.ok(Math.abs(document.width - 595.28) < 1);
    assert.ok(Math.abs(document.height - 841.89) < 1);
    assert.ok(document.text.includes(name));
    for (const company of companies) assert.ok(document.text.includes(company.trim()));
    assert.ok(!document.text.includes('Torna al CV'));
    assert.ok(!document.text.includes('Stampa / Salva PDF'));
    const { stdout: links } = await run('pdfinfo', ['-url', file]);
    assert.ok(links.includes('mailto:'));
    documents.push(document);
  }
  assert.equal(documents[0].pages, documents[1].pages);
  assert.equal(documents[0].text, documents[1].text);
  console.log(`PDF verificati: ${documents[0].pages} pagine A4, testo identico`);
});
