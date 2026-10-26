const assert = require('node:assert/strict');

// The rules every troystack.com page keeps for its Gold and App Store buttons.
// A main button (cta-btn, header-cta or btn-primary, wherever it sits in the
// class list) never sends everyone to the App Store, since Android and desktop
// visitors can't install the iPhone app. An iPhone link is swapped in by the
// shared /ios-swap.js, and its ct= token matches the web link's campaign=.
function checkCtas(name, html) {
  const tags = [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
  for (const tag of tags) {
    const cls = (tag.match(/\bclass="([^"]*)"/) || [])[1] || '';
    const href = (tag.match(/\bhref="([^"]*)"/) || [])[1] || '';
    const main = /(^|\s)(cta-btn|header-cta|btn-primary)(\s|$)/.test(cls);
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
  }
  if (tags.some((t) => /\bdata-ios-(href|hide)\b/.test(t))) {
    assert.ok(html.includes('<script src="/ios-swap.js"></script>'), `${name} has an iPhone link but doesn't load /ios-swap.js`);
  }
  assert.ok(!html.includes("querySelectorAll('a[data-ios-href]')"), `${name} carries its own copy of the iPhone swap`);
}

module.exports = { checkCtas };
