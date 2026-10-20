const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const API = path.join(__dirname, '..', 'api');

test('every serverless function loads and exports a handler', () => {
  for (const f of fs.readdirSync(API).filter((f) => f.endsWith('.js'))) {
    const mod = require(path.join(API, f));
    assert.equal(typeof mod, 'function', `api/${f} doesn't export a handler`);
  }
});

const lib = require('../api/_shared/signal-lib');

test('escapeHtml escapes every unsafe character', () => {
  assert.equal(lib.escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(lib.escapeHtml(null), '');
});

test('readingTime is at least one minute', () => {
  assert.equal(lib.readingTime(''), 1);
  assert.equal(lib.readingTime('word '.repeat(660)), 3);
});

function fakeRes() {
  return {
    headers: {},
    statusCode: 0,
    body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    writeHead(c, h = {}) { this.statusCode = c; Object.assign(this.headers, h); return this; },
    send(b) { this.body = b; return this; },
    end() { return this; },
  };
}

test('/api/prices passes live gold and silver through', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ timestamp: 't', prices: { gold: { price: 2000 }, silver: { price: 30 } } }),
  }));
  const res = fakeRes();
  await require('../api/prices')({ method: 'GET' }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.fallback, false);
  assert.equal(body.prices.gold.price, 2000);
  assert.equal(body.prices.silver.price, 30);
});

test('/api/prices falls back when the upstream fails', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  const res = fakeRes();
  await require('../api/prices')({ method: 'GET' }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.fallback, true);
  assert.equal(res.headers['Cache-Control'], 's-maxage=60');
});

function listResponse(articles) {
  return { ok: true, status: 200, json: async () => ({ articles }) };
}

const recap = (slug, day) => ({ slug, is_stack_signal: true, published_at: `${day}T12:00:00Z` });
const item = (slug, day) => ({ slug, is_stack_signal: false, published_at: `${day}T12:00:00Z` });

test('the Signal sitemap lists every recap and no news item', async (t) => {
  // Two full pages and a short third, so the sitemap has to page.
  const all = [];
  for (let i = 0; i < 120; i++) all.push(recap(`the-stack-signal-${i}`, '2026-10-01'));
  all.push(item('gold-rises-2026-10-19', '2026-10-19'));
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    const q = new URL(url).searchParams;
    const offset = Number(q.get('offset'));
    const rows = q.get('type') === 'signal' ? all.filter((a) => a.is_stack_signal) : all;
    return listResponse(rows.slice(offset, offset + Number(q.get('limit'))));
  });
  const res = fakeRes();
  await require('../api/signal-sitemap')({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body.match(/<loc>/g) || []).length, 120);
  assert.ok(res.body.includes('/signal/the-stack-signal-119<'));
  assert.ok(!res.body.includes('gold-rises'));
  assert.ok(urls.every((u) => u.includes('type=signal')));
  assert.ok(urls.length <= 20);
});

test('the Signal sitemap drops news items an older API still returns', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    return listResponse(offset === 0 ? [recap('evening-signal-2026-10-18', '2026-10-18'), item('silver-dips-2026-10-18', '2026-10-18')] : []);
  });
  const res = fakeRes();
  await require('../api/signal-sitemap')({ method: 'GET' }, res);
  assert.ok(res.body.includes('/signal/evening-signal-2026-10-18<'));
  assert.ok(!res.body.includes('silver-dips'));
});

test('the Signal sitemap stops at 20 calls', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    const offset = Number(new URL(url).searchParams.get('offset'));
    return listResponse(Array.from({ length: 50 }, (_, i) => recap(`r-${offset + i}`, '2026-01-01')));
  });
  const res = fakeRes();
  await require('../api/signal-sitemap')({ method: 'GET' }, res);
  assert.equal(calls, 20);
  assert.equal((res.body.match(/<loc>/g) || []).length, 1000);
});

test('a failed page keeps the recaps already fetched and caches briefly', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    if (offset === 100) return { ok: false, status: 429 };
    return listResponse(Array.from({ length: 50 }, (_, i) => recap(`r-${offset + i}`, '2026-01-01')));
  });
  const res = fakeRes();
  await require('../api/signal-sitemap')({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body.match(/<loc>/g) || []).length, 100);
  assert.equal(res.headers['Cache-Control'], 's-maxage=300');
});

test('a failed first page answers the empty sitemap as before', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  const res = fakeRes();
  await require('../api/signal-sitemap')({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body.match(/<loc>/g) || []).length, 0);
  assert.equal(res.headers['Cache-Control'], 's-maxage=30');
});

test('a full sitemap caches for an hour', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => listResponse([recap('weekly-recap-2026-10-17', '2026-10-17')]));
  const res = fakeRes();
  await require('../api/signal-sitemap')({ method: 'GET' }, res);
  assert.equal(res.headers['Cache-Control'], 's-maxage=3600, stale-while-revalidate=86400');
});

function articleResponse(article, related = []) {
  return async (url) => (url.includes('?limit=')
    ? listResponse(related)
    : { ok: true, status: 200, json: async () => ({ article }) });
}

const robotsMeta = (html) => /<meta name="robots" content="noindex, follow">/.test(html);

test('a news item page is noindex, follow', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Gold rises', troy_commentary: 'Gold rose.' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'gold-rises-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex, follow');
  assert.ok(robotsMeta(res.body));
});

test('a recap page stays indexable', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Gold held.' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Robots-Tag'], undefined);
  assert.ok(!robotsMeta(res.body));
  assert.ok(res.body.includes('<link rel="canonical" href="https://troystack.com/signal/the-stack-signal-2026-10-19">'));
});

test('the fallback page an upstream failure answers is noindex', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['X-Robots-Tag'], 'noindex, follow');
  assert.ok(robotsMeta(res.body));
});

test('a one-liner cut to a word or two stays off the article page', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...item('fed-2026-10-08', '2026-10-08'), title: 'Fed minutes', troy_commentary: 'Gold fell.', troy_one_liner: 'Gold shines as' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'fed-2026-10-08' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes('<p class="article-oneliner">'));
  assert.ok(!res.body.includes('Gold shines as'));
});

test('a whole one-liner shows on the article page', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...item('fed-2026-10-18', '2026-10-18'), title: 'Fed minutes', troy_commentary: 'Gold fell.', troy_one_liner: 'Central banks stack physical gold, smart money follows' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'fed-2026-10-18' } }, res);
  assert.ok(res.body.includes('<p class="article-oneliner">&ldquo;Central banks stack physical gold, smart money follows&rdquo;</p>'));
});

test('usableOneLiner keeps five words and 25 characters', () => {
  const { usableOneLiner } = require('../api/_shared/signal-lib');
  assert.equal(usableOneLiner('Fed'), '');
  assert.equal(usableOneLiner(null), '');
  assert.equal(usableOneLiner('Paper Dip: Stack'), '');
  assert.equal(usableOneLiner('  Smart money backs miners,\n physical gold next '), 'Smart money backs miners, physical gold next');
});

test('a news item with a morning recap answers 301 to its block there', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Gold rises', home_slug: 'the-stack-signal-2026-10-19' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'gold-rises-2026-10-19' } }, res);
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.Location, '/signal/the-stack-signal-2026-10-19#gold-rises-2026-10-19');
  assert.match(res.headers['Cache-Control'], /max-age=86400/);
});

test('a news item without a recap, or with an odd home_slug, keeps its noindex page', async (t) => {
  for (const home_slug of [null, undefined, '', 'gold-rises-2026-10-19', '../x', 'https://evil.example', 42]) {
    t.mock.method(globalThis, 'fetch', articleResponse({ ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Gold rises', troy_commentary: 'Gold rose.', home_slug }));
    const res = fakeRes();
    await require('../api/signal-article')({ query: { slug: 'gold-rises-2026-10-19' } }, res);
    assert.equal(res.statusCode, 200, String(home_slug));
    assert.equal(res.headers['X-Robots-Tag'], 'noindex, follow');
    globalThis.fetch.mock.restore();
  }
});

test('a recap never redirects even if it carries a home_slug', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('evening-signal-2026-10-19', '2026-10-19'), title: 'Evening', troy_commentary: 'Done.', home_slug: 'the-stack-signal-2026-10-19' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'evening-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
});

test('a morning recap ends with a Headlines block per news item', async (t) => {
  const news = [
    { title: 'Gold rises <fast>', slug: 'gold-rises-2026-10-19', one_liner: 'Central banks keep buying gold every single month', source: 'Reuters', source_url: 'https://reuters.com/a' },
    { title: 'Silver dips', slug: 'silver-dips-2026-10-19', one_liner: 'Fed', source: 'Kitco', source_url: 'javascript:alert(1)' },
    { title: 'No slug', slug: '' },
  ];
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Morning.', news }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('<h2>Headlines</h2>'));
  assert.ok(res.body.includes('id="gold-rises-2026-10-19"'));
  assert.ok(res.body.includes('Gold rises &lt;fast&gt;'));
  assert.ok(res.body.includes('Central banks keep buying gold every single month'));
  assert.ok(res.body.includes('href="https://reuters.com/a"'));
  assert.ok(res.body.includes('id="silver-dips-2026-10-19"'));
  assert.ok(!res.body.includes('javascript:alert'));
  assert.ok(!res.body.includes('No slug'));
  assert.equal(res.headers['Cache-Control'], 's-maxage=60, stale-while-revalidate=60');
});

test('a recap with no news has no Headlines and keeps the long cache', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Morning.', news: [] }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.ok(!res.body.includes('Headlines'));
  assert.equal(res.headers['Cache-Control'], 's-maxage=300, stale-while-revalidate=86400');
});
