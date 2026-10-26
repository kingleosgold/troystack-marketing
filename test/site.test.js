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
// A commented-out tag isn't a canonical, and pages that are never indexed
// (an error page, a Search Console verification file) carry none.
// <!--> and <!---> close at once, and --!> closes too, as browsers read them.
const notIndexed = (f) => f === '404.html' || /^google[0-9a-f]{16}\.html$/.test(f);
const uncommented = (text) => text.replace(/<!--(?:>|->|[\s\S]*?--!?>)/g, '').replace(/<!--[\s\S]*$/, '');
// An attribute's value, double quoted, single quoted or bare, read by its
// whole name so data-rel or data-content can't stand in.
const tagAttr = (tag, name) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};
// rel is a list of words, so rel="canonical alternate" still names a
// canonical. A > inside a quoted value doesn't end the tag.
const tagsWhere = (html, el, name, value) =>
  [...html.matchAll(new RegExp(`<${el}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi'))]
    .map(([t]) => t)
    .filter((t) => (tagAttr(t, name) || '').toLowerCase().trim().split(/\s+/).includes(value));
const ogUrlTags = (html) => [...tagsWhere(html, 'meta', 'property', 'og:url'), ...tagsWhere(html, 'meta', 'name', 'og:url')];

test('every page names its own clean URL as canonical, and the sitemap lists it', () => {
  const sitemap = uncommented(read('sitemap.xml'));
  for (const page of htmlPages.filter((f) => !notIndexed(f))) {
    const html = uncommented(read(page));
    const tags = tagsWhere(html, 'link', 'rel', 'canonical');
    assert.equal(tags.length, 1, `${page} needs exactly one canonical link`);
    const href = tagAttr(tags[0], 'href');
    const want = page === 'index.html' ? 'https://troystack.com/' : `https://troystack.com/${page.replace(/\.html$/, '')}`;
    assert.equal(href, want, `${page} canonical`);
    assert.ok(sitemap.includes(`<loc>${want}</loc>`), `${want} missing from sitemap.xml`);
    // A share card that names a different URL splits the page in two again.
    for (const og of ogUrlTags(html)) {
      assert.equal(tagAttr(og, 'content'), want, `${page} og:url`);
    }
  }
  // A page that's never indexed has no business in the sitemap either.
  for (const [, loc] of sitemap.matchAll(/<loc>https:\/\/troystack\.com\/([^<]*)<\/loc>/g)) {
    assert.ok(!notIndexed(`${loc}.html`) && !notIndexed(loc), `sitemap.xml lists ${loc}, which is never indexed`);
  }
});

test('the canonical check skips comments and pages that are never indexed', () => {
  assert.equal(uncommented('<!-- <link rel="canonical" href="x"> -->a').trim(), 'a');
  assert.ok(notIndexed('404.html'));
  assert.equal(uncommented('a<!-- <link rel="canonical" href="x">').trim(), 'a');
  assert.ok(notIndexed('google0123456789abcdef.html'));
  assert.ok(!notIndexed('googlecafe.html'));
  assert.ok(!notIndexed('calculator.html'));
  assert.equal(tagAttr('<meta property="og:url" data-content="a" content="b">', 'content'), 'b');
  assert.equal(uncommented('a<!-->b<!--->c').trim(), 'abc');
  assert.equal(uncommented('a<!---->b').trim(), 'ab');
});

test('the canonical check reads bare and mixed quotes and whole attribute names', () => {
  assert.equal(tagAttr('<meta property=og:url content=https://x/>', 'content'), 'https://x/');
  assert.equal(tagAttr(`<meta content="it's" property="og:url">`, 'content'), "it's");
  assert.equal(tagsWhere('<link data-rel="canonical" href="a"><link rel=canonical href="b">', 'link', 'rel', 'canonical').length, 1);
  assert.equal(tagsWhere('<link rel="canonical alternate" href="a">', 'link', 'rel', 'canonical').length, 1);
  assert.equal(ogUrlTags('<meta content="a>b" property="og:url">').length, 1);
  assert.equal(uncommented('a<!-- x --!>b').trim(), 'ab');
  assert.equal(ogUrlTags('<meta data-property="og:url" content="a"><meta name="og:url" content="b"><meta property=og:url content="c">').length, 2);
});

// Search Console counted www.troystack.com as a duplicate, so www has to
// leave for the apex on every path with a permanent redirect.
test('www.troystack.com redirects to the apex on every path', () => {
  const { redirects = [] } = JSON.parse(read('vercel.json'));
  const www = redirects.filter((r) => (r.has || []).some((h) => h.type === 'host' && h.value === 'www.troystack.com'));
  assert.equal(www.length, 1);
  assert.equal(www[0].source, '/:path*');
  assert.equal(www[0].destination, 'https://troystack.com/:path*');
  assert.equal(www[0].permanent, true);
});

test('the home page names one URL for itself in canonical, og:url and JSON-LD', () => {
  const html = read('index.html');
  assert.ok(html.includes('<link rel="canonical" href="https://troystack.com/">'));
  assert.ok(html.includes('<meta property="og:url" content="https://troystack.com/">'));
  assert.ok(html.includes('"url": "https://troystack.com/"'));
});

// Android and desktop visitors can't install the iPhone app, so every main
// button and header link opens troystack.ai for them and only an iPhone swaps
// in the App Store, through the shared /ios-swap.js.
const { checkCtas } = require('./_cta');

test('every main button has a web path for visitors without an iPhone', () => {
  for (const f of htmlPages) checkCtas(f, read(f));
});

test('the checker holds any link with an iPhone swap as a main button', () => {
  const bare = '<a href="https://apps.apple.com/app/x?ct=site-x" data-ios-href="https://apps.apple.com/app/x?ct=site-x">Get it</a><script src="/ios-swap.js"></script>';
  assert.throws(() => checkCtas('bare', bare), /sends everyone to the App Store/);
});

// The home header and hero carry their own tokens, so a tap on each one is
// counted on its own in troystack.ai's funnel and in App Store Connect. An
// iPhone gets one path in the hero, the App Store, and loses the web plans link.
test('the home header and hero are tagged apart and an iPhone hero has one path', () => {
  const html = read('index.html');
  const nav = html.match(/<nav class="nav-links">[\s\S]*?<\/nav>/)[0];
  assert.ok(nav.includes('campaign=site-home-nav"') && nav.includes('ct=site-home-nav&'), 'the header has no token of its own');
  const hero = html.match(/<div class="hero-buttons">[\s\S]*?<\/div>/)[0];
  assert.ok(!hero.includes('site-home-nav'), 'the hero uses the header token');
  const links = [...hero.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
  assert.equal(links.filter((tag) => /data-ios-href=/.test(tag)).length, 1, 'the hero needs exactly one App Store swap');
  assert.ok(links.length > 1, 'the hero lost its web plans link');
  for (const tag of links) {
    if (!/data-ios-href=/.test(tag)) assert.match(tag, /\bdata-ios-hide\b/, `the hero keeps a web link on an iPhone: ${tag}`);
  }
});

test("each page's Smart App Banner counts under the page's own token", () => {
  const { assertBannerCounts } = require('./_cta');
  const want = { 'index.html': 'site-home', 'calculator.html': 'site-calculator', 'speculation.html': 'site-what-if', 'junk-silver.html': 'site-junk-silver' };
  for (const f of htmlPages.filter((f) => read(f).includes('apple-itunes-app'))) {
    assert.ok(want[f], `${f} shows a Smart App Banner with no token assigned here`);
  }
  for (const [f, ct] of Object.entries(want)) {
    assertBannerCounts(f, read(f), ct);
    // The banner's token has to be one the page's own install buttons use.
    assert.match(read(f), new RegExp(`href="https://apps\\.apple\\.com/[^"]*[?&](?:amp;)?ct=${ct}(?=[&"])`), `${f} has no App Store button under ${ct}`);
  }
});

test('the banner check catches a missing, doubled or wrong token', () => {
  const { assertBannerCounts } = require('./_cta');
  const tag = (content) => `<meta name="apple-itunes-app" content="${content}">`;
  assertBannerCounts('ok', tag('app-id=6757343766, affiliate-data=pt=96487801&amp;ct=site-home'), 'site-home');
  assert.throws(() => assertBannerCounts('bare', tag('app-id=6757343766'), 'site-home'), /no provider token/);
  assert.throws(() => assertBannerCounts('other', tag('app-id=6757343766, affiliate-data=pt=96487801&amp;ct=site-pricing'), 'site-home'), /counts under site-pricing/);
  assert.throws(() => assertBannerCounts('two', tag('app-id=6757343766, affiliate-data=pt=96487801&amp;ct=site-home&amp;ct=x'), 'site-home'), /counts under site-home,x/);
  assert.throws(() => assertBannerCounts('app', tag('app-id=675734376, affiliate-data=pt=96487801&amp;ct=site-home'), 'site-home'), /isn't TroyStack's/);
  assert.throws(() => assertBannerCounts('none', '<title>x</title>', 'site-home'), /exactly one/);
});

test('each tool page has a main button that opens troystack.ai/gold', () => {
  for (const f of ['calculator.html', 'speculation.html', 'junk-silver.html']) {
    assert.match(read(f), /<a href="https:\/\/troystack\.ai\/gold\?campaign=site-[a-z-]+"[^>]*class="[^"]*\bcta-btn\b/, `${f} has no main button into Gold`);
  }
});

test('the iPhone swap moves links only on an iPhone or iPad', () => {
  const src = read('ios-swap.js');
  const run = (userAgent, maxTouchPoints = 0) => {
    const link = { attrs: { 'data-ios-href': 'https://apps.apple.com/x', 'data-ios-label': 'Get the App' }, href: 'https://troystack.ai/gold', textContent: 'Try Gold',
      getAttribute(k) { return this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; } };
    const hidden = { style: {} };
    const document = { querySelectorAll: (q) => ({ '[data-ios-hide]': [hidden], 'a[data-ios-href]': [link] })[q] || [] };
    new Function('navigator', 'document', src)({ userAgent, maxTouchPoints }, document);
    return { link, hidden };
  };
  const iphone = run('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
  assert.equal(iphone.link.href, 'https://apps.apple.com/x');
  assert.equal(iphone.link.textContent, 'Get the App');
  assert.equal(iphone.link.target, '_blank');
  assert.equal(iphone.hidden.style.display, 'none');
  assert.equal(run('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5).link.href, 'https://apps.apple.com/x');
  const android = run('Mozilla/5.0 (Linux; Android 15; Pixel 9)');
  assert.equal(android.link.href, 'https://troystack.ai/gold');
  assert.equal(android.link.textContent, 'Try Gold');
  assert.equal(android.hidden.style.display, undefined);
  assert.equal(run('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)').link.href, 'https://troystack.ai/gold');
});
