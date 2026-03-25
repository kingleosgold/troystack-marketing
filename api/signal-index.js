const { renderPage, renderArticleCard, escapeHtml, APP_STORE_URL, WEB_APP_URL, SITE_URL } = require('./_shared/template');

const API_BASE = 'https://api.stacktrackergold.com/v1';

module.exports = async (req, res) => {
  try {
    const response = await fetch(`${API_BASE}/stack-signal`);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data = await response.json();
    const articles = data.articles || [];

    const ogImage = articles.length > 0 && articles[0].image_url
      ? articles[0].image_url
      : `${SITE_URL}/icon.png`;

    const articleCards = articles.map(renderArticleCard).join('\n');

    const body = `
        <section class="signal-hero">
            <div class="container">
                <h1>The Stack Signal</h1>
                <p class="subtitle">AI-Powered Precious Metals Intelligence by Troy</p>
                <p class="desc">Troy monitors 140+ sources daily, scoring and analyzing the stories that matter to precious metals stackers.</p>
                <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download for Full Analysis</a>
            </div>
        </section>

        <section class="signal-articles">
            <div class="container">
                <div class="signal-grid">
                    ${articleCards}
                </div>
            </div>
        </section>

        <section class="signal-cta-bottom">
            <div class="container">
                <h2>Get Troy's Full Analysis</h2>
                <p>Download TroyStack for complete AI commentary, Troy Chat, portfolio tracking, and price alerts.</p>
                <div class="signal-cta-buttons">
                    <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download on iOS</a>
                    <a href="${WEB_APP_URL}" class="btn btn-secondary">Open Web App</a>
                </div>
            </div>
        </section>`;

    const head = `
    <meta name="description" content="Daily AI-powered precious metals market intelligence. Gold, silver, platinum, and palladium analysis by Troy, your personal stack analyst.">
    <link rel="canonical" href="${SITE_URL}/signal">
    <meta property="og:title" content="The Stack Signal — AI Precious Metals Intelligence">
    <meta property="og:description" content="Daily AI-powered precious metals market intelligence. Gold, silver, platinum, and palladium analysis by Troy, your personal stack analyst.">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${SITE_URL}/signal">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="The Stack Signal — AI Precious Metals Intelligence">
    <meta name="twitter:description" content="Daily AI-powered precious metals market intelligence by Troy, your personal stack analyst.">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "The Stack Signal",
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
      title: 'The Stack Signal — AI Precious Metals Intelligence | TroyStack',
      head,
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).send(html);
  } catch (err) {
    const body = `
        <section class="error-page">
            <div class="container">
                <h1>Unable to load articles</h1>
                <p>The Stack Signal is temporarily unavailable. Please try again in a moment.</p>
                <a href="/" class="btn btn-secondary">Back to Home</a>
            </div>
        </section>`;

    const html = renderPage({
      title: 'The Stack Signal | TroyStack',
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).send(html);
  }
};
