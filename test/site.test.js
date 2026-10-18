const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const htmlPages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

test('every JSON-LD block parses', () => {
  for (const page of htmlPages) {
    const blocks = [...read(page).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const [, json] of blocks) {
      assert.doesNotThrow(() => JSON.parse(json), `${page} has JSON-LD that doesn't parse`);
    }
  }
});

// Each page that quotes Gold must quote the same three prices, so a price
// change can't land on one page and miss another.
function goldPrices() {
  const index = read('index.html');
  const offers = JSON.parse(index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]).offers;
  const byName = Object.fromEntries(offers.map((o) => [o.name, o.price]));
  return { monthly: byName['Gold Monthly'], yearly: byName['Gold Yearly'], lifetime: byName['Gold Lifetime'] };
}

test('index.html JSON-LD carries all three Gold prices', () => {
  const p = goldPrices();
  for (const [plan, price] of Object.entries(p)) {
    assert.match(String(price), /^\d+\.\d{2}$/, `Gold ${plan} price missing from JSON-LD`);
  }
});

test('every page quotes the same Gold prices as the JSON-LD', () => {
  const p = goldPrices();
  const expected = {
    'index.html': [
      [/pricing-price">\$([\d.]+) <span>\/mo/, p.monthly],
      [/Also available: \$([\d.]+)\/year/, p.yearly],
      [/\$([\d.]+) lifetime/, p.lifetime],
    ],
    'llms.txt': [
      [/Gold Monthly: \$([\d.]+)/, p.monthly],
      [/Gold Yearly: \$([\d.]+)/, p.yearly],
      [/Gold Lifetime: \$([\d.]+)/, p.lifetime],
    ],
    'terms.html': [
      [/Gold, Monthly:<\/strong> \$([\d.]+)/, p.monthly],
      [/Gold, Yearly:<\/strong> \$([\d.]+)/, p.yearly],
      [/Gold, Lifetime:?<\/strong>[^$]*\$([\d.]+)/, p.lifetime],
    ],
  };
  for (const [file, checks] of Object.entries(expected)) {
    const text = read(file);
    for (const [re, want] of checks) {
      const m = text.match(re);
      assert.ok(m, `${file} no longer matches ${re}`);
      assert.equal(m[1], want, `${file} quotes $${m[1]} where the JSON-LD says $${want}`);
    }
  }
});

test('every sitemap URL has a page or a rewrite behind it', () => {
  const rewrites = JSON.parse(read('vercel.json')).rewrites.map((r) => r.source);
  const locs = [...read('sitemap.xml').matchAll(/<loc>https:\/\/troystack\.com(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length > 0);
  for (const loc of locs) {
    if (loc === '/') continue;
    const page = `${loc.slice(1)}.html`;
    assert.ok(fs.existsSync(path.join(ROOT, page)) || rewrites.includes(loc), `sitemap lists ${loc} with nothing behind it`);
  }
});

test('internal links point at pages that exist', () => {
  const rewrites = JSON.parse(read('vercel.json')).rewrites.map((r) => r.source.split('/:')[0]);
  for (const page of htmlPages) {
    for (const [, href] of read(page).matchAll(/href="(\/[^"#?]*)/g)) {
      if (href === '/') continue;
      const clean = href.replace(/\.html$/, '');
      const exists =
        fs.existsSync(path.join(ROOT, href)) ||
        fs.existsSync(path.join(ROOT, `${clean.slice(1)}.html`)) ||
        rewrites.some((r) => clean === r || clean.startsWith(`${r}/`));
      assert.ok(exists, `${page} links to ${href}, which doesn't exist`);
    }
  }
});
