const assert = require('node:assert/strict');

// The rules every troystack.com page keeps for its Gold and App Store buttons.
// A main button never sends everyone to the App Store, since Android and
// desktop visitors can't install the iPhone app. A main button is any link
// with an iPhone swap, or one whose class list holds cta-btn, header-cta,
// nav-cta or btn-primary. An iPhone link is swapped in by the
// shared /ios-swap.js, and its ct= token matches the web link's campaign=.
// A main button marked data-ios-hide may go to the App Store, since an iPhone
// never sees it. A Signal article's Get the iPhone app shows to Android and
// desktop only that way, by design.
function checkCtas(name, html) {
  const tags = [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
  for (const tag of tags) {
    const cls = (tag.match(/\bclass="([^"]*)"/) || [])[1] || '';
    const href = (tag.match(/\bhref="([^"]*)"/) || [])[1] || '';
    const main = /(^|\s)(cta-btn|header-cta|nav-cta|btn-primary)(\s|$)/.test(cls) || /\bdata-ios-href=/.test(tag);
    if (main && !/\bdata-ios-hide\b/.test(tag)) {
      assert.doesNotMatch(href, /apps\.apple\.com/, `${name} has a main button that sends everyone to the App Store: ${tag}`);
    }
    const ios = (tag.match(/\bdata-ios-href="([^"]*)"/) || [])[1];
    if (ios) {
      assert.match(ios, /apps\.apple\.com/, `${name} swaps an iPhone link that isn't the App Store: ${tag}`);
      const ct = (ios.match(/[?&](?:amp;)?ct=([^&"]*)/) || [])[1];
      const campaign = (href.match(/[?&](?:amp;)?campaign=([^&"]*)/) || [])[1];
      if (campaign) assert.equal(ct, campaign, `${name} tags one button two ways: ${tag}`);
    }
    // troystack.com drops a site token it can't read, so a typo loses the count.
    for (const [, token] of tag.matchAll(/[?&](?:amp;)?(?:campaign|ct)=([^&"]*)/g)) {
      if (token.startsWith('site-')) assert.match(token, /^site-[a-z0-9-]{1,32}$/, `${name} has a site token troystack.com won't read: ${tag}`);
    }
  }
  const lastMarked = Math.max(html.lastIndexOf('data-ios-href='), html.lastIndexOf('data-ios-hide'));
  if (lastMarked >= 0) {
    // The swap runs as soon as it loads, so it has to come after every link it moves.
    const script = html.lastIndexOf('<script src="/ios-swap.js"></script>');
    assert.ok(script > lastMarked, `${name} doesn't load /ios-swap.js after its iPhone links`);
  }
  assert.ok(!html.includes("querySelectorAll('a[data-ios-href]')"), `${name} carries its own copy of the iPhone swap`);
}

// The Smart App Banner Safari shows on an iPhone. Its installs count in App
// Store Connect only when affiliate-data carries the provider token and one
// campaign token, so a page's banner has to name both.
function assertBannerCounts(name, html, want) {
  const tags = html.match(/<meta\b[^>]*[\s\/]name\s*=\s*(?:"apple-itunes-app"|'apple-itunes-app'|apple-itunes-app(?=[\s>\/]))[^>]*>/gi) || [];
  assert.equal(tags.length, 1, `${name} needs exactly one Smart App Banner tag`);
  const content = (tags[0].match(/(?:^|\s)content\s*=\s*(?:"([^"]*)"|'([^']*)')/) || []).slice(1).find((c) => c !== undefined);
  assert.ok(content !== undefined, `${name} banner has no content Safari can read: ${tags[0]}`);
  const parts = Object.fromEntries(content.split(/\s*,\s*/).filter((p) => p.trim()).map((p) => {
    assert.ok(p.includes('='), `${name} banner has a segment with no value: ${p}`);
    return [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)];
  }));
  assert.equal(parts['app-id'], '6757343766', `${name} banner isn't TroyStack's`);
  const data = new URLSearchParams((parts['affiliate-data'] || '').replace(/&amp;/g, '&'));
  assert.deepEqual(data.getAll('pt'), ['96487801'], `${name} banner has no provider token`);
  assert.deepEqual(data.getAll('mt'), ['8'], `${name} banner has no mt=8`);
  assert.deepEqual(data.getAll('ct'), [want], `${name} banner counts under ${data.getAll('ct').join(',') || 'nothing'}`);
}

module.exports = { checkCtas, assertBannerCounts };
