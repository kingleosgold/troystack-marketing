const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const htmlPages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

// Every JSON-LD block on a page, whatever the other attributes on its tag.
const jsonLd = (text) =>
  [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => /\btype\s*=\s*["']?application\/ld\+json/i.test(attrs))
    .map(([, , body]) => body);

// Whether a path matches a Vercel rewrite source, one segment at a time, so
// /signal/:slug matches /signal/foo and not /signal/foo/bar.
function matchesRewrite(urlPath, source) {
  const want = source.split('/');
  const got = urlPath.split('/');
  return want.length === got.length && want.every((seg, i) => seg.startsWith(':') ? got[i] !== '' : seg === got[i]);
}

test('every JSON-LD block parses', () => {
  for (const page of htmlPages) {
    for (const json of jsonLd(read(page))) {
      assert.doesNotThrow(() => JSON.parse(json), `${page} has JSON-LD that doesn't parse`);
    }
  }
});

// Each page that quotes Gold must quote the same three prices, so a price
// change can't land on one page and miss another.
function goldPrices() {
  const index = read('index.html');
  const offers = jsonLd(index).map((b) => JSON.parse(b)).find((d) => Array.isArray(d.offers)).offers;
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
    assert.ok(fs.existsSync(path.join(ROOT, page)) || rewrites.some((r) => matchesRewrite(loc, r)), `sitemap lists ${loc} with nothing behind it`);
  }
});

test('a rewrite matches one segment per parameter', () => {
  assert.ok(matchesRewrite('/signal/gold-up', '/signal/:slug'));
  assert.ok(!matchesRewrite('/signal/gold-up/extra', '/signal/:slug'));
  assert.ok(!matchesRewrite('/signal/', '/signal/:slug'));
  assert.ok(matchesRewrite('/signal', '/signal'));
});

test('JSON-LD is found with other attributes on its tag', () => {
  assert.deepEqual(jsonLd('<script id="s" type="application/ld+json">{"a":1}</script><script>x</script>'), ['{"a":1}']);
});

test('internal links point at pages that exist', () => {
  const rewrites = JSON.parse(read('vercel.json')).rewrites.map((r) => r.source);
  for (const page of htmlPages) {
    for (const [, href] of read(page).matchAll(/href="(\/[^"#?]*)/g)) {
      if (href === '/') continue;
      const clean = href.replace(/\.html$/, '');
      const exists =
        fs.existsSync(path.join(ROOT, href)) ||
        fs.existsSync(path.join(ROOT, `${clean.slice(1)}.html`)) ||
        rewrites.some((r) => matchesRewrite(clean, r));
      assert.ok(exists, `${page} links to ${href}, which doesn't exist`);
    }
  }
});

// A glow wider than a phone makes iOS Safari zoom the whole page out, since
// body's overflow-x doesn't hold the layout viewport there.
test('the hero glow never runs wider than the screen', () => {
  const rule = read('index.html').match(/\.hero::before\s*\{([^}]*)\}/);
  assert.ok(rule, 'index.html has a .hero::before rule');
  const width = rule[1].match(/(?:^|;|\s)width:\s*([^;]+);/);
  assert.ok(width, '.hero::before sets a width');
  assert.match(width[1], /^min\([^)]*100vw[^)]*\)$/, '.hero::before width is capped at 100vw');
});

// The house style bans em dashes in anything a visitor reads, including titles,
// alt text and the strings scripts put on screen.
// Every script under api/, api/_shared included.
const apiScripts = fs.readdirSync(path.join(ROOT, 'api'), { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .map((f) => `api/${f}`);

test('no page, script or llms.txt carries an em dash', () => {
  const files = [
    ...htmlPages,
    'llms.txt',
    ...apiScripts,
  ];
  for (const f of files) {
    assert.doesNotMatch(read(f), /—|&mdash;|&#8212;|&#x2014;/i, `${f} has an em dash`);
  }
});

test('every link to troystack.ai/gold says which page sent it', () => {
  // troystack.ai counts a Gold page visit under a site-* token, so its funnel
  // shows which page here sent the visitor.
  for (const f of htmlPages) {
    for (const [, href] of read(f).matchAll(/href="(https:\/\/troystack\.ai\/gold\b[^"]*)"/g)) {
      assert.match(href, /^https:\/\/troystack\.ai\/gold\?campaign=site-[a-z0-9-]{1,32}$/, `${f} links to ${href}`);
    }
  }
  const llmsGold = [...read('llms.txt').matchAll(/https:\/\/troystack\.ai\/gold\b\S*/g)];
  assert.ok(llmsGold.length > 0, 'llms.txt no longer links to troystack.ai/gold');
  for (const [href] of llmsGold) {
    assert.match(href, /^https:\/\/troystack\.ai\/gold\?campaign=site-[a-z0-9-]{1,32}$/, `llms.txt links to ${href}`);
  }
});

// The terms say Troy isn't a financial advisor and Troy's rules ban trade
// calls, so no page sells him as one.
test('no page calls Troy an advisor or says he tells you when to buy', () => {
  const files = [
    ...htmlPages.filter((f) => f !== 'terms.html'),
    'llms.txt',
    ...apiScripts,
  ];
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /\badvis[eo]rs?\b/i, `${f} calls Troy an advisor`);
    assert.doesNotMatch(text, /tells you when to (add|buy|sell)/i, `${f} says Troy makes trade calls`);
  }
});

// Search Console flagged troystack.com pages as duplicates without a chosen
// canonical, since www.troystack.com and query strings serve the same page.
test('every page names its own clean URL as canonical, and the sitemap lists it', () => {
  const sitemap = read('sitemap.xml');
  for (const page of htmlPages) {
    const tags = [...read(page).matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)];
    assert.equal(tags.length, 1, `${page} needs exactly one canonical link`);
    const href = tags[0][0].match(/\bhref=["']([^"']+)["']/)[1];
    const want = page === 'index.html' ? 'https://troystack.com/' : `https://troystack.com/${page.replace(/\.html$/, '')}`;
    assert.equal(href, want, `${page} canonical`);
    assert.ok(sitemap.includes(`<loc>${want}</loc>`), `${want} missing from sitemap.xml`);
  }
});

// Search Console counted www.troystack.com as a duplicate, so www has to
// leave for the apex on every path with a permanent redirect.
test('www.troystack.com redirects to the apex on every path', () => {
  const { redirects = [] } = JSON.parse(read('vercel.json'));
  const www = redirects.filter((r) => (r.has || []).some((h) => h.type === 'host' && h.value === 'www.troystack.com'));
  // Live, /:path* didn't catch the bare root, so / has a rule of its own.
  assert.deepEqual(
    www.map((r) => [r.source, r.destination, r.permanent]),
    [
      ['/', 'https://troystack.com/', true],
      ['/:path*', 'https://troystack.com/:path*', true],
    ],
  );
});

test('the home page names one URL for itself in canonical, og:url and JSON-LD', () => {
  const html = read('index.html');
  assert.ok(html.includes('<link rel="canonical" href="https://troystack.com/">'));
  assert.ok(html.includes('<meta property="og:url" content="https://troystack.com/">'));
  assert.ok(html.includes('"url": "https://troystack.com/"'));
});
