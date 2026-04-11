const { renderPage, renderArticleCard, escapeHtml, APP_STORE_URL, WEB_APP_URL, SITE_URL } = require('./_shared/template');
const { listArticles } = require('./_shared/supabase');

const PAGE_SIZE = 20;

module.exports = async (req, res) => {
  try {
    const pageParam = parseInt(req.query.page, 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const articles = await listArticles({ limit: 500 });
    const totalPages = Math.max(1, Math.ceil(articles.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageArticles = articles.slice(start, start + PAGE_SIZE);

    const ogImage = articles.length > 0 && articles[0].image_url
      ? articles[0].image_url
      : `${SITE_URL}/icon.png`;

    const articleCards = pageArticles.length > 0
      ? pageArticles.map(renderArticleCard).join('\n')
      : '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">No articles yet.</p>';

    const prevDisabled = currentPage <= 1 ? 'disabled' : '';
    const nextDisabled = currentPage >= totalPages ? 'disabled' : '';
    const prevHref = currentPage > 2 ? `/signal?page=${currentPage - 1}` : '/signal';
    const nextHref = `/signal?page=${currentPage + 1}`;

    const pagination = totalPages > 1 ? `
                <nav class="pagination" aria-label="Pagination">
                    <a href="${prevHref}" class="${prevDisabled}" rel="prev">&larr; Previous</a>
                    <span class="page-num">Page ${currentPage} of ${totalPages}</span>
                    <a href="${nextHref}" class="${nextDisabled}" rel="next">Next &rarr;</a>
                </nav>` : '';

    const canonical = currentPage === 1 ? `${SITE_URL}/signal` : `${SITE_URL}/signal?page=${currentPage}`;
    const pageSuffix = currentPage > 1 ? ` — Page ${currentPage}` : '';

    const body = `
        <section class="signal-hero">
            <div class="container">
                <h1>Stack Signal</h1>
                <p class="subtitle">AI-Powered Precious Metals Intelligence</p>
                <p class="desc">Troy monitors 140+ sources daily, scoring and analyzing the stories that matter to precious metals stackers.</p>
                <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download TroyStack</a>
            </div>
        </section>

        <section class="signal-articles">
            <div class="container">
                <div class="signal-grid">
                    ${articleCards}
                </div>
                ${pagination}
            </div>
        </section>

        <section class="signal-cta-bottom">
            <div class="container">
                <h2>Get Troy's Full Analysis</h2>
                <p>Download TroyStack for complete AI commentary, Troy Chat, portfolio tracking, and price alerts.</p>
                <div class="signal-cta-buttons">
                    <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download TroyStack</a>
                    <a href="${WEB_APP_URL}" class="btn btn-secondary">Open Web App</a>
                </div>
            </div>
        </section>`;

    const head = `
    <meta name="description" content="Daily AI-powered precious metals market intelligence. Gold, silver, platinum, and palladium analysis by Troy, your personal stack analyst.">
    <link rel="canonical" href="${canonical}">
    <meta property="og:title" content="Stack Signal — AI-Powered Precious Metals Intelligence">
    <meta property="og:description" content="Daily AI-powered precious metals market intelligence. Gold, silver, platinum, and palladium analysis by Troy, your personal stack analyst.">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${canonical}">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Stack Signal — AI-Powered Precious Metals Intelligence">
    <meta name="twitter:description" content="Daily AI-powered precious metals market intelligence by Troy, your personal stack analyst.">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Stack Signal",
      "description": "AI-powered precious metals market intelligence by Troy",
      "url": "${SITE_URL}/signal",
      "publisher": {
        "@type": "Organization",
        "name": "TroyStack",
        "logo": {
          "@type": "ImageObject",
          "url": "${SITE_URL}/icon.png"
        }
      }
    }
    </script>`;

    const html = renderPage({
      title: `Stack Signal — AI-Powered Precious Metals Intelligence${pageSuffix} | TroyStack`,
      head,
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(html);
  } catch (err) {
    const body = `
        <section class="error-page">
            <div class="container">
                <h1>Unable to load articles</h1>
                <p>Stack Signal is temporarily unavailable. Please try again in a moment.</p>
                <a href="/" class="btn btn-secondary">Back to Home</a>
            </div>
        </section>`;

    const html = renderPage({
      title: 'Stack Signal | TroyStack',
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).send(html);
  }
};
