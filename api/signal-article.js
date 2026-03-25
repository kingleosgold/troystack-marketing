const {
  renderPage, renderArticleCard, escapeHtml,
  formatDate, formatPrice,
  APP_STORE_URL, WEB_APP_URL, SITE_URL,
} = require('./_shared/template');

const API_BASE = 'https://api.stacktrackergold.com/v1';

module.exports = async (req, res) => {
  const slug = req.query.slug;
  if (!slug) {
    res.writeHead(302, { Location: '/signal' });
    return res.end();
  }

  try {
    const [articleRes, listRes] = await Promise.all([
      fetch(`${API_BASE}/stack-signal/${encodeURIComponent(slug)}`),
      fetch(`${API_BASE}/stack-signal`),
    ]);

    if (!articleRes.ok) {
      if (articleRes.status === 404) {
        const body = `
            <section class="error-page">
                <div class="container">
                    <h1>Article not found</h1>
                    <p>This article may have been removed or the URL may be incorrect.</p>
                    <a href="/signal" class="btn btn-secondary">Browse The Stack Signal</a>
                </div>
            </section>`;

        const html = renderPage({
          title: 'Article Not Found | TroyStack',
          body,
          activeNav: 'signal',
        });

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(html);
      }
      throw new Error(`API returned ${articleRes.status}`);
    }

    const articleData = await articleRes.json();
    const article = articleData.article || articleData;

    let relatedArticles = [];
    try {
      const listData = await listRes.json();
      relatedArticles = (listData.articles || [])
        .filter(a => a.slug !== slug)
        .slice(0, 4);
    } catch (_) { /* ignore */ }

    const commentary = article.troy_commentary || '';
    const source = article.sources && article.sources[0];
    const sourceName = source ? source.name : '';
    const sourceUrl = source ? source.url : '';
    const metaDesc = (commentary || article.troy_one_liner || '').slice(0, 155);
    const ogImage = article.image_url || `${SITE_URL}/icon.png`;
    const articleUrl = `${SITE_URL}/signal/${encodeURIComponent(article.slug)}`;

    // Render full commentary paragraphs
    const commentaryHtml = commentary
      .split(/\n\n+/)
      .map(p => `<p>${escapeHtml(p)}</p>`)
      .join('');

    // Related articles
    let relatedHtml = '';
    if (relatedArticles.length > 0) {
      relatedHtml = `
        <section class="related-articles">
            <div class="container">
                <h2>More from The Stack Signal</h2>
                <div class="related-grid">
                    ${relatedArticles.map(renderArticleCard).join('')}
                </div>
            </div>
        </section>`;
    }

    // Source link
    let sourceLinkHtml = '';
    if (sourceUrl) {
      sourceLinkHtml = `
        <div class="article-source-link">
            <p class="source-label">Original Source</p>
            <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(sourceName || 'Read original article')} &rarr;</a>
        </div>`;
    }

    const body = `
        <article>
            <img class="article-hero-img" src="${escapeHtml(article.image_url)}" alt="${escapeHtml(article.title)}">

            <div class="article-content">
                <div class="article-meta-top">
                    <span class="category-badge">${escapeHtml(article.category)}</span>
                    <span class="troy-score-lg">Troy Score: ${article.relevance_score}</span>
                </div>

                <h1>${escapeHtml(article.title)}</h1>

                <div class="article-meta">
                    ${sourceName ? `<span>${escapeHtml(sourceName)}</span><span class="sep">&middot;</span>` : ''}
                    <span>${formatDate(article.published_at)}</span>
                </div>

                <div class="article-prices">
                    ${article.gold_price_at_publish ? `<span>Gold: ${formatPrice(article.gold_price_at_publish)}</span>` : ''}
                    ${article.silver_price_at_publish ? `<span>Silver: ${formatPrice(article.silver_price_at_publish)}</span>` : ''}
                </div>

                <div class="troy-analysis">
                    <p class="troy-analysis-header">Troy's Analysis</p>
                    <div class="commentary-full">
                        ${commentaryHtml}
                    </div>
                </div>

                ${sourceLinkHtml}
            </div>
        </article>

        ${relatedHtml}

        <section class="signal-cta-bottom">
            <div class="container">
                <h2>Want Troy's analysis on YOUR stack?</h2>
                <p>Download TroyStack for personalized AI commentary, Troy Chat, portfolio tracking, price alerts, and daily briefs.</p>
                <div class="signal-cta-buttons">
                    <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download on iOS</a>
                    <a href="${WEB_APP_URL}" class="btn btn-secondary">Open Web App</a>
                </div>
            </div>
        </section>`;

    const head = `
    <meta name="description" content="${escapeHtml(metaDesc)}">
    <link rel="canonical" href="${articleUrl}">

    <meta property="og:title" content="${escapeHtml(article.title)}">
    <meta property="og:description" content="${escapeHtml(article.troy_one_liner)}">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${articleUrl}">
    <meta property="og:type" content="article">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(article.title)}">
    <meta name="twitter:description" content="${escapeHtml(article.troy_one_liner)}">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": ${JSON.stringify(article.title)},
      "image": ${JSON.stringify(article.image_url)},
      "datePublished": ${JSON.stringify(article.published_at)},
      "description": ${JSON.stringify(commentary || article.troy_one_liner)},
      "articleBody": ${JSON.stringify(commentary)},
      "author": {
        "@type": "Organization",
        "name": "TroyStack"
      },
      "publisher": {
        "@type": "Organization",
        "name": "TroyStack",
        "logo": {
          "@type": "ImageObject",
          "url": "${SITE_URL}/icon.png"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "${articleUrl}"
      }
    }
    </script>`;

    const html = renderPage({
      title: `${article.title} — Troy's Analysis | TroyStack`,
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
                <h1>Unable to load article</h1>
                <p>This article is temporarily unavailable. Please try again in a moment.</p>
                <a href="/signal" class="btn btn-secondary">Browse The Stack Signal</a>
            </div>
        </section>`;

    const html = renderPage({
      title: 'Article | TroyStack',
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).send(html);
  }
};
