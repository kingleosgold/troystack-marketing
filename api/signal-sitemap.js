const { fetchList, isRecap } = require('./_shared/signal-lib');

const SITE_URL = 'https://troystack.com';
const PAGE = 50;
// Recaps run about two a day, so 20 pages of 50 covers well over a year of
// them, and the most this spends of the API's 100 calls a minute is 20.
const MAX_PAGES = 20;
// Pages are fetched a few at a time so the sitemap stays inside the
// function's time limit.
const BATCH = 5;

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Every recap, newest first. The news items are noindex, so they stay out.
// A page that fails stops the paging but keeps the recaps already fetched,
// so one bad call can't empty the sitemap. complete says whether every page
// came back.
async function fetchRecaps() {
  const recaps = [];
  for (let start = 0; start < MAX_PAGES; start += BATCH) {
    const pages = await Promise.allSettled(
      Array.from({ length: Math.min(BATCH, MAX_PAGES - start) }, (_, i) =>
        fetchList({ limit: PAGE, offset: (start + i) * PAGE, type: 'signal' })),
    );
    for (const page of pages) {
      if (page.status === 'rejected') {
        if (recaps.length === 0) throw page.reason;
        return { recaps, complete: false };
      }
      recaps.push(...page.value.filter(isRecap));
      if (page.value.length < PAGE) return { recaps, complete: true };
    }
  }
  return { recaps, complete: true };
}

module.exports = async (req, res) => {
  try {
    const { recaps: articles, complete } = await fetchRecaps();
    const seen = new Set();

    const urls = articles.filter((a) => a.slug && !seen.has(a.slug) && seen.add(a.slug)).map(a => {
      const lastmod = (a.published_at || a.created_at || '').slice(0, 10);
      return `  <url>
    <loc>${SITE_URL}/signal/${escapeXml(a.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    // A partial sitemap is cached briefly so the missing pages come back soon.
    res.setHeader('Cache-Control', complete ? 's-maxage=3600, stale-while-revalidate=86400' : 's-maxage=300');
    res.status(200).send(xml);
  } catch (err) {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
};
