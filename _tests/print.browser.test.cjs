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
let site = path.resolve(process.env.CV_SITE_DIR || path.join(__dirname, '../_site'));
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

async function waitForPrintReady() {
  await page.waitForSelector('#pdfButton:not([disabled])');
}

async function pdfDetails(file) {
  const { stdout: info } = await run('pdfinfo', [file]);
  const { stdout: text } = await run('pdftotext', [file, '-']);
  const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
  return { pages: Number(info.match(/Pages:\s+(\d+)/)[1]),
    width: Number(size[1]), height: Number(size[2]),
    title: info.match(/^Title:\s+(.*)$/m)?.[1], text: text.replace(/\s+/g, ' ').trim() };
}

test('PDF directly prints without navigation or extra controls and restores the title', async function () {
  await waitForPrintReady();
  assert.equal(await page.locator('script[src*="html2pdf"]').count(), 0);
  assert.match(await page.getAttribute('html', 'lang'), /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/);
  const originalURL = page.url(), originalTitle = await page.title();
  const name = (await page.locator('.name').allTextContents()).join('').trim();
  const expectedTitle = (name ? name + '_CV' : originalTitle.trim() || 'CV').replace(/\s+/g, '_');
  await page.evaluate(function () {
    window.printCalls = [];
    window.print = function () {
      window.dispatchEvent(new Event('beforeprint'));
      window.printCalls.push({ active: navigator.userActivation.isActive, title: document.title });
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.click('#pdfButton');
    await page.click('#pdfButton');
    assert.equal(page.url(), originalURL);
    assert.equal(await page.title(), originalTitle);
  }
  const calls = await page.evaluate(function () { return window.printCalls; });
  assert.equal(calls.length, 4);
  for (const call of calls) assert.deepEqual(call, { active: true, title: expectedTitle });
  assert.equal(page.context().pages().length, 1);
  assert.equal(await page.locator('#printButton, .print-controls').count(), 0);
  assert.equal(await page.locator('#printStatus').isVisible(), false);
});

test('PDF waits for the profile image before enabling direct printing', async function () {
  let release;
  const gate = new Promise(function (resolve) { release = resolve; });
  await page.route('**/assets/images/profilecv.png', async function (route) {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.isDisabled('#pdfButton'), true);
  } finally { release(); }
  await waitForPrintReady();
  assert.equal(await page.locator('.avatar').evaluate(function (image) { return image.naturalWidth > 0; }), true);
});

test('a missing image is reported on the CV without blocking printing forever', async function () {
  await page.route('**/assets/images/profilecv.png', async function (route) { await route.abort(); });
  await page.goto(baseURL + '/');
  await waitForPrintReady();
  assert.equal(await page.locator('#printStatus').isVisible(), true);
  assert.equal(await page.textContent('#printStatus'), await page.getAttribute('#printStatus', 'data-image-error'));
  assert.ok((await page.textContent('#printStatus')).length > 0);
});

test('the CV remains responsive on phones with an accessible PDF button', async function () {
  await waitForPrintReady();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const layout = await page.evaluate(function () {
      const organization = document.querySelector('.cert-org').getBoundingClientRect();
      const link = document.querySelector('.cert-url').getBoundingClientRect();
      return { columns: getComputedStyle(document.querySelector('.wrapper')).display,
        overflow: document.documentElement.scrollWidth > innerWidth,
        separated: link.top >= organization.bottom };
    });
    assert.deepEqual(layout, { columns: 'block', overflow: false, separated: true });
    assert.equal(await page.locator('#pdfButton').isVisible(), true);
  }
});

test('the old print URL contains no intermediate buttons', async function () {
  const language = await page.getAttribute('html', 'lang');
  await page.goto(baseURL + '/print');
  assert.equal(await page.locator('#printButton, .print-controls').count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Torna al CV' }).count(), 0);
  assert.equal(await page.getAttribute('html', 'lang'), language);
});

test('print keeps dates inside their rows, removes the shadow and hides the PDF button', async function () {
  await waitForPrintReady();
  const screenShadow = await page.locator('.wrapper').evaluate(function (element) { return getComputedStyle(element).boxShadow; });
  assert.notEqual(screenShadow, 'none');
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });
  const result = await page.evaluate(function () {
    return { shadow: getComputedStyle(document.querySelector('.wrapper')).boxShadow,
      button: getComputedStyle(document.getElementById('pdfButton')).display,
      status: getComputedStyle(document.getElementById('printStatus')).display,
      dates: [...document.querySelectorAll('.main-wrapper .time')].every(function (date) {
        const bounds = date.getBoundingClientRect(), row = date.parentElement.getBoundingClientRect();
        return bounds.top >= row.top && bounds.bottom <= row.bottom + 0.1;
      }) };
  });
  assert.deepEqual(result, { shadow: 'none', button: 'none', status: 'none', dates: true });
  await page.emulateMedia({ media: 'screen' });
  assert.equal(await page.locator('.wrapper').evaluate(function (element) { return getComputedStyle(element).boxShadow; }), screenShadow);
});

test('direct native print stays A4 with identical selectable content on desktop and mobile', async function () {
  await waitForPrintReady();
  const name = (await page.locator('.name').allTextContents()).join('').trim(), title = await page.title();
  const expectedTitle = (name ? name + '_CV' : title.trim() || 'CV').replace(/\s+/g, '_');
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
    assert.equal(document.title, expectedTitle);
    assert.equal(await page.title(), title);
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


async function printAndReadTitle() {
  await page.evaluate(function () {
    window.print = function () {
      window.dispatchEvent(new Event('beforeprint'));
      window.recordedPrintTitle = document.title;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.click('#pdfButton');
  return await page.evaluate(function () { return window.recordedPrintTitle; });
}

test('missing, empty and whitespace-only names use the site title or CV', async function () {
  for (const [name, title, expected] of [
    [null, 'Example CV', 'Example_CV'], ['', 'Example CV', 'Example_CV'],
    ['   ', 'Example CV', 'Example_CV'], [null, '   ', 'CV']
  ]) {
    await page.route(baseURL + '/', async function (route) {
      const response = await route.fetch();
      let html = await response.text();
      let heading = '';
      if (name !== null) heading = `<h1 class="name">${name}</h1>`;
      html = html.replace(/<h1 class="name">[\s\S]*?<\/h1>/, heading);
      html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
      await route.fulfill({ response, body: html });
    });
    await page.goto(baseURL + '/');
    await waitForPrintReady();
    const original = await page.title();
    assert.equal(await printAndReadTitle(), expected);
    assert.equal(await page.title(), original);
    await page.unroute(baseURL + '/');
  }
});

test('a YAML fork without a name uses English UI and a title fallback', {
  skip: !process.env.CV_FORK_SITE_DIR
}, async function () {
  const originalSite = site;
  site = path.resolve(process.env.CV_FORK_SITE_DIR);
  try {
    await page.goto(baseURL + '/');
    await waitForPrintReady();
    assert.equal(await page.locator('.name').count(), 0);
    assert.equal(await page.getAttribute('html', 'lang'), 'en-GB');
    assert.equal(await page.getAttribute('#pdfButton', 'title'), 'Print / Save PDF');
    assert.equal(await printAndReadTitle(), 'Example_CV');
    assert.equal(await page.title(), 'Example CV');
    await page.route('**/assets/images/profilecv.png', async function (route) { await route.abort(); });
    await page.goto(baseURL + '/');
    await waitForPrintReady();
    assert.equal(await page.textContent('#printStatus'), 'Some images could not be loaded. Check your CV before printing.');
    await page.goto(baseURL + '/print');
    assert.equal(await page.getAttribute('html', 'lang'), 'en-GB');
    assert.equal(await page.title(), 'Example_CV');
  } finally { site = originalSite; }
});
