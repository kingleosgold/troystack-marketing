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

// The sitemap names each recap at the same URL as its page's canonical.
test('the Signal sitemap encodes a slug like the canonical', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    return listResponse(offset === 0 ? [recap('week ahead & more', '2026-10-18')] : []);
  });
  const res = fakeRes();
  await require('../api/signal-sitemap')({ method: 'GET' }, res);
  assert.ok(res.body.includes('<loc>https://troystack.com/signal/week%20ahead%20%26%20more</loc>'), res.body);
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

test('usableOneLiner keeps a line at exactly five words and 25 characters', () => {
  const { usableOneLiner } = require('../api/_shared/signal-lib');
  // Five words, 25 characters.
  assert.equal(usableOneLiner('Gold eases as dollar firm'), 'Gold eases as dollar firm');
  // Six words, 24 characters.
  assert.equal(usableOneLiner('Gold up as the Fed waits'), '');
  // Four words, 32 characters.
  assert.equal(usableOneLiner('Precious metals rallied strongly'), '');
  // Length counts after runs of spaces collapse, so 26 raw characters read as 25.
  assert.equal(usableOneLiner('Gold eases  as dollar firm'), 'Gold eases as dollar firm');
  assert.equal(usableOneLiner('Gold up as the  Fed waits'), '');
});

test('usableOneLiner counts words after long dashes become commas', () => {
  const { usableOneLiner } = require('../api/_shared/signal-lib');
  // Five tokens and 26 characters only while the dashes count as words.
  assert.equal(usableOneLiner('Gold \u2014 silver \u2014 platinum.'), '');
  assert.equal(usableOneLiner('Silver rallies \u2014 miners lag behind'), 'Silver rallies, miners lag behind');
  assert.equal(usableOneLiner('\u2014 Gold holds its ground into the close \u2014'), 'Gold holds its ground into the close');
  assert.equal(usableOneLiner('Silver ran 3\u20135% as the dollar slid'), 'Silver ran 3-5% as the dollar slid');
  assert.equal(usableOneLiner('Gold firms\u2014the Fed blinks today'), 'Gold firms, the Fed blinks today');
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
  // A slug that isn't plain is encoded like the article page's canonical.
  assert.equal(signalHref({ ...item('gold rises #2', '2026-10-19'), home_slug: null }), '/signal/gold%20rises%20%232');
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
    { ...item('gold rises #2', '2026-10-19'), home_slug: null },
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
  assert.equal(res.headers.Location, '/signal/the-stack-signal-2026-10-19#gold-rises-2026-10-19');
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

test('related cards ask for recaps only, so folded news never empties the row', async (t) => {
  const urls = [];
  const page = { ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Gold held.' };
  const recaps = [
    { ...recap('weekly-recap-2026-10-17', '2026-10-17'), title: 'Weekly recap' },
    { ...recap('evening-signal-2026-10-18', '2026-10-18'), title: 'Evening recap' },
  ];
  const news = [
    { ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Folded news', home_slug: 'the-stack-signal-2026-10-19' },
  ];
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url);
    if (!url.includes('?limit=')) return { ok: true, status: 200, json: async () => ({ article: page }) };
    return listResponse(/[?&]type=signal(&|$)/.test(url) ? recaps : [...news, ...recaps]);
  });
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  const list = urls.filter((u) => u.includes('?limit='));
  assert.equal(list.length, 1);
  assert.match(list[0], /[?&]type=signal(&|$)/);
  const cards = res.body.match(/<a href="[^"]*" class="related-card">/g) || [];
  assert.deepEqual(cards, [
    '<a href="/signal/weekly-recap-2026-10-17" class="related-card">',
    '<a href="/signal/evening-signal-2026-10-18" class="related-card">',
  ]);
  assert.ok(!res.body.includes('Folded news'));
});

test("a folded item's 301 and a missing page's 404 don't wait on the related list", async (t) => {
  const stalled = new Promise(() => {});
  const handle = async (req, res) => {
    let timer;
    try {
      await Promise.race([
        require('../api/signal-article')(req, res),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('waited on the related list')), 1000); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const folded = { ...item('gold-rises-2026-10-19', '2026-10-19'), title: 'Gold rises', home_slug: 'the-stack-signal-2026-10-19' };
  t.mock.method(globalThis, 'fetch', async (url) => (url.includes('?limit=') ? stalled : { ok: true, status: 200, json: async () => ({ article: folded }) }));
  const res = fakeRes();
  await handle({ query: { slug: 'gold-rises-2026-10-19' } }, res);
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.Location, '/signal/the-stack-signal-2026-10-19#gold-rises-2026-10-19');

  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async (url) => (url.includes('?limit=') ? stalled : { ok: false, status: 404 }));
  const missing = fakeRes();
  await handle({ query: { slug: 'no-such-item-2026-10-19' } }, missing);
  assert.equal(missing.statusCode, 404);
});

const DASH = '—';
const anyLongDash = /[—–]|&mdash;|&ndash;|&#8212;|&#8211;/i;

test('a Signal page shows no long dash in its title, meta, body, one-liner or headlines', async (t) => {
  const news = [{ title: `Gold rises ${DASH} again`, slug: 'gold-rises-2026-10-19', one_liner: `Central banks buy ${DASH} smart money follows them`, source: 'Reuters', source_url: 'https://reuters.com/a' }];
  t.mock.method(globalThis, 'fetch', articleResponse({
    ...recap('the-stack-signal-2026-10-19', '2026-10-19'),
    title: `The Stack Signal ${DASH} October 19, 2026`,
    troy_commentary: `Gold held${DASH}the Fed blinked. Silver ran 3–5% overnight.\n\n- Miners lag ${DASH} for now`,
    troy_one_liner: `Fed blinks ${DASH} silver runs on the supply gap`,
    news,
  }));
  const res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  assert.doesNotMatch(res.body, anyLongDash);
  assert.ok(res.body.includes('<title>The Stack Signal, October 19, 2026 | Stack Signal by TroyStack</title>'));
  assert.match(res.body, /<meta name="description" content="Gold held, the Fed blinked\.\s+Silver ran 3-5% overnight\.">/);
  assert.ok(res.body.includes('<h1 class="article-title">The Stack Signal, October 19, 2026</h1>'));
  assert.ok(res.body.includes('<li>Miners lag, for now</li>'));
  assert.ok(res.body.includes('&ldquo;Fed blinks, silver runs on the supply gap&rdquo;'));
  assert.ok(res.body.includes('<h3>Gold rises, again</h3>'));
  assert.ok(res.body.includes('Central banks buy, smart money follows them'));
  assert.ok(res.body.includes('id="gold-rises-2026-10-19"'));
});

test('Signal index cards and their ItemList show no long dash', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => listResponse([
    { ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: `The Stack Signal ${DASH} Oct 19`, troy_commentary: `Gold held ${DASH} for now.` },
  ]));
  const res = fakeRes();
  await require('../api/signal-index')({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  const served = res.body.replace(/<script>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(served, anyLongDash);
  assert.ok(served.includes('The Stack Signal, Oct 19'));
  assert.ok(served.includes('Gold held, for now.'));
  assert.ok(res.body.includes('"name":"The Stack Signal, Oct 19"'));
});

test('Load more gets its cards from /api/signal with no long dash', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => listResponse([
    { ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: `The Stack Signal ${DASH} Oct 19`, troy_commentary: `Gold held ${DASH} for now.`, slug: 'the-stack-signal-2026-10-19' },
  ]));
  const res = fakeRes();
  await require('../api/signal')({ method: 'GET', query: {} }, res);
  const body = JSON.parse(res.body);
  assert.equal(body.articles[0].title, 'The Stack Signal, Oct 19');
  assert.equal(body.articles[0].troy_commentary, 'Gold held, for now.');
  assert.equal(body.articles[0].slug, 'the-stack-signal-2026-10-19');
});

test('plainArticle leaves slugs, sources and odd shapes alone', () => {
  const { plainArticle } = lib;
  assert.equal(plainArticle(null), null);
  const a = { slug: 'a–b', title: 7, sources: [{ title: `x ${DASH} y` }], news: [null, { slug: 's', source: `R ${DASH} T` }] };
  const out = plainArticle(a);
  assert.deepEqual(out, a);
  assert.notEqual(out, a);
});

test('plainDashes keeps link targets and code spans as written', () => {
  const { plainDashes } = lib;
  assert.equal(plainDashes(`see [the chart${DASH}](https://x.com/a${DASH}b) now`), 'see [the chart](https://x.com/a—b) now');
  assert.equal(plainDashes(`run \`a${DASH}b\` here ${DASH} then stop`), 'run `a—b` here, then stop');
});

test('plainDashes puts the comma outside bold and drops a dash before closing punctuation', () => {
  const { plainDashes } = lib;
  assert.equal(plainDashes(`**Gold${DASH}** rises`), '**Gold**, rises');
  assert.equal(plainDashes(`*held${DASH}* for now`), '*held*, for now');
  assert.equal(plainDashes(`Gold rose${DASH}**.`), 'Gold rose**.');
});

test('plainDashes reads an unspaced em dash between numbers as a range and never joins paragraphs', () => {
  const { plainDashes } = lib;
  assert.equal(plainDashes(`from 2008${DASH}2012`), 'from 2008-2012');
  assert.equal(plainDashes(`in 2008 ${DASH} prices fell`), 'in 2008, prices fell');
  assert.equal(plainDashes('one,\n\n, two'), 'one,\n\n, two');
  assert.equal(plainDashes(`a ${DASH}, b`), 'a, b');
});

test('plainArticle leaves a news field that is not an array alone', () => {
  const out = lib.plainArticle({ title: `A ${DASH} B`, news: { title: `x ${DASH} y` } });
  assert.equal(out.title, 'A, B');
  assert.deepEqual(out.news, { title: `x ${DASH} y` });
});

test('/api/signal/:slug sends the article with no long dash', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true, status: 200,
    json: async () => ({ success: true, article: { slug: 'a–b', title: `Gold ${DASH} held`, troy_commentary: `Calm ${DASH} for now.` } }),
  }));
  const res = fakeRes();
  await require('../api/signal-slug')({ method: 'GET', query: { slug: 'a-b' } }, res);
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(body.success, true);
  assert.equal(body.article.title, 'Gold, held');
  assert.equal(body.article.troy_commentary, 'Calm, for now.');
  assert.equal(body.article.slug, 'a–b');
});

// The Signal pages keep troystack.com's button rules, header included.
// Every App Store install button on a Signal page, href or data-ios-href, goes to
// TroyStack and counts under site-signal. Editorial links, the sources and
// headlines rendered with rel="noopener nofollow", and mentions inside a script,
// JSON-LD included, aren't install buttons, so they're left out.
function assertEveryAppStoreLinkSiteSignal(body, page) {
  const html = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    // A nofollow link to TroyStack's own page is still an install button.
    .replace(/<a\b[^>]*\srel="[^"]*\bnofollow\b[^"]*"[^>]*>/gi, (tag) => (/id6757343766(?![0-9])/.test(tag) ? tag : ''));
  const links = [...html.matchAll(/(?:href|data-ios-href)="(https:\/\/apps\.apple\.com\/[^"]*)"/g)].map((m) => m[1]);
  assert.ok(links.length > 0, `${page} has no App Store link`);
  // A link in any other form, single quotes or another attribute, would slip past the match above.
  assert.equal((html.match(/apps\.apple\.com/gi) || []).length, links.length, `${page} has an App Store link the check can't read`);
  for (const link of links) {
    assert.ok(/\/id6757343766(?![0-9])/.test(link), `${page} App Store link ${link} isn't TroyStack's`);
    const ct = new URL(link.replace(/&amp;/g, '&')).searchParams.getAll('ct');
    assert.deepEqual(ct, ['site-signal'], `${page} App Store link ${link} counts under ${ct.join(',') || 'nothing'}`);
  }
}

test('the Signal link check skips editorial and script mentions and still catches a broken button', () => {
  const ours = 'https://apps.apple.com/app/apple-store/id6757343766?pt=96487801&amp;ct=site-signal&amp;mt=8';
  const page = (extra) => `<a href="${ours}">App Store</a>${extra}`;
  assertEveryAppStoreLinkSiteSignal(page('<a href="https://apps.apple.com/us/app/other/id123" target="_blank" rel="noopener nofollow">Other app</a>'), 'editorial');
  assertEveryAppStoreLinkSiteSignal(page(`<script type="application/ld+json">{"installUrl":"${ours.replace('site-signal', 'site-home')}"}</script>`), 'json-ld');
  assert.throws(() => assertEveryAppStoreLinkSiteSignal(page(`<a href="${ours.replace('site-signal', 'site-home')}">Footer</a>`), 'moved'), /counts under site-home/);
  assert.throws(() => assertEveryAppStoreLinkSiteSignal(page(`<a href='${ours}'>Single</a>`), 'single-quoted'), /can't read/);
  assert.throws(() => assertEveryAppStoreLinkSiteSignal(page(`<a href="${ours.replace('id6757343766', 'id675734376')}">Footer</a>`), 'wrong app'), /isn't TroyStack's/);
  assert.throws(() => assertEveryAppStoreLinkSiteSignal(page(`<a href="${ours.replace('site-signal', 'site-home')}" rel="noopener nofollow">Footer</a>`), 'nofollow'), /counts under site-home/);
});

test('the Signal index and an article give visitors without an iPhone a web path', async (t) => {
  const { checkCtas } = require('./_cta');
  t.mock.method(globalThis, 'fetch', async () => listResponse([{ ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal' }]));
  let res = fakeRes();
  await require('../api/signal-index')({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  checkCtas('/signal', res.body);
  assert.ok(!/[?&](?:amp;)?ct=signal(?![a-z0-9-])/i.test(res.body), 'a Signal index App Store link still uses ct=signal');
  assertEveryAppStoreLinkSiteSignal(res.body, '/signal');
  require('./_cta').assertBannerCounts('/signal', res.body, 'site-signal');
  assert.ok(res.body.includes('href="https://troystack.ai/gold?campaign=site-signal"'));
  t.mock.restoreAll();
  // An editorial source that links another app's App Store page isn't an install button.
  const sources = [{ title: 'A mint app', name: 'App Store', url: 'https://apps.apple.com/us/app/mint/id123' }];
  t.mock.method(globalThis, 'fetch', articleResponse({ ...recap('the-stack-signal-2026-10-19', '2026-10-19'), title: 'The Stack Signal', troy_commentary: 'Gold held.', sources }));
  res = fakeRes();
  await require('../api/signal-article')({ query: { slug: 'the-stack-signal-2026-10-19' } }, res);
  assert.equal(res.statusCode, 200);
  checkCtas('/signal/the-stack-signal-2026-10-19', res.body);
  // Every App Store link on Signal counts under site-signal, footer included.
  assert.ok(!/[?&](?:amp;)?ct=signal(?![a-z0-9-])/i.test(res.body), 'a Signal App Store link still uses ct=signal');
  assertEveryAppStoreLinkSiteSignal(res.body, '/signal/the-stack-signal-2026-10-19');
  require('./_cta').assertBannerCounts('/signal/the-stack-signal-2026-10-19', res.body, 'site-signal');
  for (const [, js] of res.body.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(js);
});
