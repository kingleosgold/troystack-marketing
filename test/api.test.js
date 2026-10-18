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
