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
