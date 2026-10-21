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
  assert.equal(res.headers['Cache-Control'], 'public, max-age=300, s-maxage=86400');
});

test('a folded news item with no slug in its record redirects to the slug asked for', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ is_stack_signal: false, published_at: '2026-10-19T12:00:00Z', title: 'Gold rises', home_slug: 'the-stack-signal-2026-10-19' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'gold-rises-2026-10-19' } }, res);
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.Location, '/signal/the-stack-signal-2026-10-19#gold-rises-2026-10-19');
});

test('yesterday stays fresh across a clock change in New York', () => {
  const { isFreshMorningRecap } = require('../api/signal-article');
  // 12:30 AM EDT on 3/9/2026, the first night after spring forward.
  const now = Date.parse('2026-03-09T04:30:00Z');
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-03-09', now), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-03-08', now), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-03-07', now), false);
  // 11:30 PM EST on 11/1/2026, the night clocks fall back.
  const fall = Date.parse('2026-11-02T04:30:00Z');
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-11-01', fall), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-10-31', fall), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-10-30', fall), false);
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
});

test('only a morning recap of today or yesterday in New York caches briefly', () => {
  const { isFreshMorningRecap } = require('../api/signal-article');
  const now = Date.parse('2026-10-20T03:00:00Z'); // 11 PM on 10/19 in New York
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-10-19', now), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-10-18', now), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-10-17', now), false);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-10-20', now), false);
  assert.equal(isFreshMorningRecap('evening-signal-2026-10-19', now), false);
  assert.equal(isFreshMorningRecap(undefined, now), false);
});

test('only a news item from today or yesterday in New York caches briefly', () => {
  const { isFreshNewsItem } = require('../api/signal-article');
  const now = Date.parse('2026-10-20T03:00:00Z'); // 11 PM on 10/19 in New York
  assert.equal(isFreshNewsItem(item('a', '2026-10-19'), now), true);
  assert.equal(isFreshNewsItem(item('a', '2026-10-18'), now), true);
  assert.equal(isFreshNewsItem(item('a', '2026-10-17'), now), false);
  assert.equal(isFreshNewsItem({ slug: 'a', is_stack_signal: false, created_at: '2026-10-19T12:00:00Z' }, now), true);
  assert.equal(isFreshNewsItem({ slug: 'a', is_stack_signal: false }, now), false);
  assert.equal(isFreshNewsItem(recap('evening-signal-2026-10-19', '2026-10-19'), now), false);
});

test('a fresh news item with no home yet caches briefly, an old one keeps the long cache', async (t) => {
  const today = new Date().toISOString().slice(0, 10);
  for (const [day, want] of [[today, 's-maxage=60, stale-while-revalidate=60'], ['2026-01-05', 's-maxage=300, stale-while-revalidate=86400']]) {
    t.mock.method(globalThis, 'fetch', articleResponse({ ...item(`gold-rises-${day}`, day), published_at: day === today ? new Date().toISOString() : `${day}T12:00:00Z`, title: 'Gold rises', troy_commentary: 'Gold rose.' }));
    const res = fakeRes();
    await require('../api/signal-article')({ query: { slug: `gold-rises-${day}` } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], want, day);
    globalThis.fetch.mock.restore();
  }
});

test('an old morning recap keeps the long cache', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-01-05', '2026-01-05'), title: 'The Stack Signal', troy_commentary: 'Morning.', news: [{ title: 'Gold rises', slug: 'gold-rises-2026-01-05' }] }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-01-05' } }, res);
  assert.ok(res.body.includes('id="gold-rises-2026-01-05"'));
  assert.equal(res.headers['Cache-Control'], 's-maxage=300, stale-while-revalidate=86400');
});

test('a recap with no news has no Headlines', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Morning.', news: [] }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.ok(!res.body.includes('Headlines'));
});

// Cards link a folded news item straight to its block on the recap, so the
// reader skips the 301. Anything else links to the item's own page.
test('signalHref links a folded news item to its recap anchor', () => {
  const { signalHref } = require('../api/_shared/signal-lib');
  assert.equal(signalHref({ ...item('gold-rises-2026-10-19', '2026-10-19'), home_slug: 'the-stack-signal-2026-10-19' }), '/signal/the-stack-signal-2026-10-19#gold-rises-2026-10-19');
  for (const home_slug of [null, undefined, '', 'gold-rises-2026-10-19', '../x', 'https://evil.example', 42]) {
    assert.equal(signalHref({ ...item('gold-rises-2026-10-19', '2026-10-19'), home_slug }), '/signal/gold-rises-2026-10-19', String(home_slug));
  }
  assert.equal(signalHref({ ...recap('evening-signal-2026-10-19', '2026-10-19'), home_slug: 'the-stack-signal-2026-10-19' }), '/signal/evening-signal-2026-10-19');
});

test('the Signal index links folded news to the recap anchor', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => listResponse([
    { ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal' },
    { ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Gold rises', home_slug: 'the-stack-signal-2026-10-19' },
    { ...item('silver-dips-2026-10-20', '2026-10-20'), title: 'Silver dips', home_slug: null },
  ]));
  const res = fakeRes();
  await require('../api/signal-index')({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('<a href="/signal/the-stack-signal-2026-10-19" class="signal-card">'));
  assert.ok(res.body.includes('<a href="/signal/the-stack-signal-2026-10-19#gold-rises-2026-10-19" class="signal-card">'));
  assert.ok(res.body.includes('<a href="/signal/silver-dips-2026-10-20" class="signal-card">'));
  // The Load more script still parses.
  for (const [, js] of res.body.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(js);
});

// The Load more script carries its own copy of signalHref. Run the served copy
// against the shared one so the two can't drift apart.
test('Load more cards link the same way as signalHref', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => listResponse([]));
  const res = fakeRes();
  await require('../api/signal-index')({ method: 'GET', query: {} }, res);
  const start = res.body.indexOf('function esc(');
  const end = res.body.indexOf("btn.addEventListener('click'");
  assert.ok(start > 0 && end > start);
  const renderCard = new Function(`${res.body.slice(start, end)}; return renderCard;`)();
  const cases = [
    { ...item('gold-rises-2026-10-19', '2026-10-19'), home_slug: 'the-stack-signal-2026-10-19' },
    ...[null, undefined, '', 'gold-rises-2026-10-19', '../x', 'https://evil.example', 42]
      .map((home_slug) => ({ ...item('gold-rises-2026-10-19', '2026-10-19'), home_slug })),
    { ...recap('evening-signal-2026-10-19', '2026-10-19'), home_slug: 'the-stack-signal-2026-10-19' },
    { is_stack_signal: false, home_slug: 'the-stack-signal-2026-10-19' },
    { slug: '', is_stack_signal: false },
    { slug: 42, is_stack_signal: false },
    { ...item('gold rises #2', '2026-10-19'), home_slug: 'The-Stack-Signal-2026-10-19' },
  ];
  for (const a of cases) {
    const href = renderCard(a).match(/^<a href="([^"]*)"/)[1].replace(/&amp;/g, '&');
    assert.equal(href, lib.signalHref(a), JSON.stringify(a));
  }
});

test('an item with no slug links to the Signal index and stays off the ItemList', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => listResponse([
    { ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Gold rises', home_slug: 'the-stack-signal-2026-10-19' },
    { ...item('silver-dips-2026-10-20', '2026-10-20'), title: 'Silver dips', home_slug: null },
    { is_stack_signal: false, published_at: '2026-10-20T12:00:00Z', title: 'No slug' },
  ]));
  const res = fakeRes();
  await require('../api/signal-index')({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes('/signal/undefined'));
  assert.ok(res.body.includes('<a href="/signal" class="signal-card">'));
  const [, json] = res.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const list = JSON.parse(json);
  assert.equal(list['@type'], 'ItemList');
  assert.equal(list.numberOfItems, 2);
  assert.deepEqual(list.itemListElement.map((e) => [e.position, e.url]), [
    [1, 'https://troystack.com/signal/the-stack-signal-2026-10-19#gold-rises-2026-10-19'],
    [2, 'https://troystack.com/signal/silver-dips-2026-10-20'],
  ]);
});

test('related cards link folded news to the recap anchor', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse(
    { ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Gold held.' },
    [
      { ...item('gold-rises-2026-10-18', '2026-10-18'), title: 'Gold rises', home_slug: 'the-stack-signal-2026-10-18' },
      { ...recap('evening-signal-2026-10-18', '2026-10-18'), title: 'Evening' },
    ],
  ));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('<a href="/signal/the-stack-signal-2026-10-18#gold-rises-2026-10-18" class="related-card">'));
  assert.ok(res.body.includes('<a href="/signal/evening-signal-2026-10-18" class="related-card">'));
});

test('a repeated slug in the query string reads the first value', async (t) => {
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    seen.push(url);
    return articleResponse({ ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Gold held.' })(url);
  });
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: ['the-stack-signal-2026-10-19', 'other'] } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(seen.some(u => u.endsWith('/the-stack-signal-2026-10-19')));
  assert.ok(res.body.includes('<link rel="canonical" href="https://troystack.com/signal/the-stack-signal-2026-10-19">'));
});

test('an article upstream sends without a slug takes its canonical from the request', async (t) => {
  const { slug, ...noSlug } = recap('the-stack-signal-2026-10-19', '2026-10-19');
  t.mock.method(globalThis, 'fetch', articleResponse({ ...noSlug, title: 'The Stack Signal', troy_commentary: 'Gold held.' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes('/signal/undefined'));
  assert.ok(res.body.includes('<meta property="og:url" content="https://troystack.com/signal/the-stack-signal-2026-10-19">'));
});

test('the JSON slug route reads the first of a repeated slug', async (t) => {
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  });
  const res = fakeRes();
  await require('../api/signal-slug')({ method: 'GET', query: { slug: ['a-1', 'b-2'] } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seen, ['https://api.troystack.ai/v1/stack-signal/a-1']);
});

// Follow-up tests filed in the Claude reviews of #19, #20 and #23.

test('a source with no URL lists as plain text, a headline with none shows its name', async (t) => {
  const news = [{ title: 'Gold rises', slug: 'gold-rises-2026-01-05', one_liner: 'Central banks keep buying gold every single month', source: 'Reuters' }];
  const sources = [{ title: 'Mint report', name: 'US Mint' }, { title: 'Kitco piece', name: 'Kitco', url: 'https://kitco.com/a' }];
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-01-05', '2026-01-05'), title: 'The Stack Signal', troy_commentary: 'Morning.', news, sources }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-01-05' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('<li>Mint report</li>'));
  assert.ok(!res.body.includes('US Mint'));
  assert.ok(res.body.includes('<li><a href="https://kitco.com/a" target="_blank" rel="noopener nofollow">Kitco piece</a>'));
  const block = res.body.slice(res.body.indexOf('id="gold-rises-2026-01-05"'));
  assert.ok(block.includes('<span class="src-name">Reuters</span>'));
  assert.ok(!block.slice(0, block.indexOf('</div>')).includes('<a '));
});

test('a headline with no one-liner has no line under its title', async (t) => {
  const news = [{ title: 'Silver dips', slug: 'silver-dips-2026-01-05', source: 'Kitco', source_url: 'https://kitco.com/b' }];
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-01-05', '2026-01-05'), title: 'The Stack Signal', troy_commentary: 'Morning.', news }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-01-05' } }, res);
  const block = res.body.slice(res.body.indexOf('id="silver-dips-2026-01-05"'));
  const inner = block.slice(0, block.indexOf('</div>'));
  assert.ok(inner.includes('<h3>Silver dips</h3>'));
  assert.ok(!/<p[\s>]/.test(inner));
  assert.ok(inner.includes('href="https://kitco.com/b"'));
});

test('a folded item answers its 301 with no body', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse({ ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Gold rises', troy_commentary: 'Gold rose.', home_slug: 'the-stack-signal-2026-10-19' }));
  const res = fakeRes();
  let ended = 0;
  res.end = function (b) { ended++; this.body = b; return this; };
  await require('../api/signal-article')({ query: { slug: 'gold-rises-2026-10-19' } }, res);
  assert.equal(res.statusCode, 301);
  assert.equal(ended, 1);
  assert.equal(res.body, undefined);
  assert.equal(res.headers['Content-Type'], undefined);
});

test("today's morning recap caches briefly through the handler", async (t) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`;
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap(`the-stack-signal-${today}`, today), title: 'The Stack Signal', troy_commentary: 'Morning.' }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: `the-stack-signal-${today}` } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 's-maxage=60, stale-while-revalidate=60');
});

test('yesterday stays fresh across the new year in New York', () => {
  const { isFreshMorningRecap, isFreshNewsItem } = require('../api/signal-article');
  // 12:30 AM EST on 1/1/2027.
  const now = Date.parse('2027-01-01T05:30:00Z');
  assert.equal(isFreshMorningRecap('the-stack-signal-2027-01-01', now), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-12-31', now), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-12-30', now), false);
  assert.equal(isFreshNewsItem(item('a', '2026-12-31'), now), true);
  assert.equal(isFreshNewsItem(item('a', '2026-12-30'), now), false);
  // 11:30 PM EST on 12/31/2026, when UTC has already turned the year.
  const eve = Date.parse('2027-01-01T04:30:00Z');
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-12-31', eve), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2026-12-30', eve), true);
  assert.equal(isFreshMorningRecap('the-stack-signal-2027-01-01', eve), false);
  assert.equal(isFreshNewsItem(item('a', '2026-12-30'), eve), true);
  assert.equal(isFreshNewsItem(item('a', '2026-12-29'), eve), false);
});

test('an empty first slug sends the reader to the index, never to the second', async (t) => {
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url) => { seen.push(url); return listResponse([]); });
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: ['', 'the-stack-signal-2026-10-19'] } }, res);
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.Location, '/signal');
  assert.deepEqual(seen, []);
  const json = fakeRes();
  await require('../api/signal-slug')({ method: 'GET', query: { slug: ['', 'x'] } }, json);
  assert.equal(json.statusCode, 400);
  assert.deepEqual(seen, []);
});

test('related cards drop the upstream slug when it differs from the one asked for', async (t) => {
  t.mock.method(globalThis, 'fetch', articleResponse(
    { ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Gold held.' },
    [
      { ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'Same page' },
      { ...recap('The-Stack-Signal-2026-10-19', '2026-10-19'), title: 'Asked slug' },
      { ...recap('evening-signal-2026-10-18', '2026-10-18'), title: 'Evening' },
    ],
  ));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'The-Stack-Signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('<link rel="canonical" href="https://troystack.com/signal/the-stack-signal-2026-10-19">'));
  const related = res.body.slice(res.body.indexOf('class="related"'));
  assert.ok(!related.includes('Same page'));
  assert.ok(related.includes('Asked slug'));
  assert.ok(related.includes('Evening'));
});
