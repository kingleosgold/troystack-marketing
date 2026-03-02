const {
  renderPage, renderArticleCard, escapeHtml,
  formatDate, formatPrice,
  APP_STORE_URL, WEB_APP_URL, SITE_URL,
} = require('./_shared/template');

const API_BASE = 'https://api.stacktrackergold.com/v1';

function splitCommentary(text) {
  if (!text) return { visible: '', blurred: '' };

  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length > 1) {
    return { visible: paragraphs[0], blurred: paragraphs.slice(1).join('\n\n') };
  }

  // Single paragraph — split by sentence, show first 2
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length <= 2) {
    return { visible: text, blurred: '' };
  }
  return {
    visible: sentences.slice(0, 2).join('').trim(),
    blurred: sentences.slice(2).join('').trim(),
  };
}

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
          title: 'Article Not Found | Stack Tracker Gold',
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

    const { visible, blurred } = splitCommentary(article.troy_commentary);
    const source = article.sources && article.sources[0];
    const sourceName = source ? source.name : '';
    const sourceUrl = source ? source.url : '';
    const metaDesc = (article.troy_one_liner || visible || '').slice(0, 160);
    const ogImage = article.image_url || `${SITE_URL}/icon.png`;
    const articleUrl = `${SITE_URL}/signal/${encodeURIComponent(article.slug)}`;

    // Build blurred section
    let paywallHtml = '';
    if (blurred) {
      paywallHtml = `
        <div class="commentary-paywall">
            <div class="commentary-blurred">
                ${blurred.split(/\n\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('')}
            </div>
            <div class="commentary-cta-overlay">
                <div class="cta-box">
                    <p>Download Stack Tracker Gold for Troy's full analysis</p>
                    <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download on iOS</a>
                    <p class="cta-sub">Also available on the <a href="${WEB_APP_URL}" style="color:var(--gold)">web app</a></p>
                </div>
            </div>
        </div>`;
    } else {
      // Short commentary — still show CTA below
      paywallHtml = `
        <div style="margin-top: 24px; text-align: center; padding: 32px 0;">
            <p style="color: var(--text-secondary); margin-bottom: 16px;">Get more from Troy — chat, daily briefs, and stack intelligence.</p>
            <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download on iOS</a>
        </div>`;
    }

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
                    <div class="commentary-public">
                        <p>${escapeHtml(visible)}</p>
                    </div>
                    ${paywallHtml}
                </div>

                ${sourceLinkHtml}
            </div>
        </article>

        ${relatedHtml}

        <section class="signal-cta-bottom">
            <div class="container">
                <h2>Get Troy's Full Analysis Every Day</h2>
                <p>Stack Tracker Gold gives you Troy's complete AI commentary, portfolio tracking, price alerts, and more.</p>
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
      "description": ${JSON.stringify(article.troy_one_liner)},
      "author": {
        "@type": "Organization",
        "name": "Stack Tracker Gold"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Stack Tracker Gold",
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
      title: `${article.title} — Troy's Analysis | Stack Tracker Gold`,
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
      title: 'Article | Stack Tracker Gold',
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).send(html);
  }
};
