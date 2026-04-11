const {
  renderPage, renderArticleCard, escapeHtml,
  formatDate, renderMarkdown, stripMarkdown, excerpt, readingTime,
  APP_STORE_URL, WEB_APP_URL, SITE_URL,
} = require('./_shared/template');
const { listArticles, getArticleBySlug } = require('./_shared/supabase');

module.exports = async (req, res) => {
  const slug = req.query.slug;
  if (!slug) {
    res.writeHead(302, { Location: '/signal' });
    return res.end();
  }

  try {
    const [article, allArticles] = await Promise.all([
      getArticleBySlug(slug),
      listArticles({ limit: 50 }).catch(() => []),
    ]);

    if (!article || !article.body || article.body.length <= 500) {
      const body = `
            <section class="error-page">
                <div class="container">
                    <h1>Article not found</h1>
                    <p>This article may have been removed or the URL may be incorrect.</p>
                    <a href="/signal" class="btn btn-secondary">Browse Stack Signal</a>
                </div>
            </section>`;

      const html = renderPage({
        title: 'Article Not Found | TroyStack',
        body,
        activeNav: 'signal',
      });

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=60');
      return res.status(404).send(html);
    }

    const relatedArticles = allArticles
      .filter(a => a.slug !== slug)
      .slice(0, 3);

    const metaDesc = excerpt(article.body, 160);
    const ogImage = article.image_url || `${SITE_URL}/icon.png`;
    const articleUrl = `${SITE_URL}/signal/${encodeURIComponent(article.slug)}`;
    const bodyHtml = renderMarkdown(article.body);
    const mins = readingTime(article.body);
    const plainBody = stripMarkdown(article.body);

    let relatedHtml = '';
    if (relatedArticles.length > 0) {
      relatedHtml = `
        <section class="related-articles">
            <div class="container">
                <h2>More from Stack Signal</h2>
                <div class="related-grid">
                    ${relatedArticles.map(renderArticleCard).join('')}
                </div>
            </div>
        </section>`;
    }

    const heroImg = article.image_url
      ? `<img class="article-hero-img" src="${escapeHtml(article.image_url)}" alt="${escapeHtml(article.title)}">`
      : '';

    const sourcesLine = article.source_count != null
      ? `<span>${article.source_count} source${article.source_count === 1 ? '' : 's'}</span><span class="sep">·</span>`
      : '';
    const scoreLine = article.importance_score != null
      ? `<span class="sep">·</span><span>Signal ${Math.round(article.importance_score)}</span>`
      : '';

    const body = `
        <article>
            ${heroImg}

            <div class="article-content">
                <h1>${escapeHtml(article.title)}</h1>

                <div class="article-stats">
                    <span>${formatDate(article.created_at)}</span>
                    <span class="sep">·</span>
                    <span>${mins} min read</span>
                    ${article.source_count != null ? `<span class="sep">·</span><span>${article.source_count} source${article.source_count === 1 ? '' : 's'}</span>` : ''}
                    ${scoreLine}
                </div>

                <div class="prose">
                    ${bodyHtml}
                </div>
            </div>
        </article>

        ${relatedHtml}

        <section class="signal-cta-bottom">
            <div class="container">
                <h2>Get insights like this delivered to your phone</h2>
                <p>Download TroyStack — your AI precious metals analyst. Daily briefs, Troy Chat, portfolio tracking, and price alerts.</p>
                <div class="signal-cta-buttons">
                    <a href="${APP_STORE_URL}" class="btn btn-primary" target="_blank" rel="noopener">Download TroyStack</a>
                    <a href="${WEB_APP_URL}" class="btn btn-secondary">Open Web App</a>
                </div>
            </div>
        </section>`;

    const head = `
    <meta name="description" content="${escapeHtml(metaDesc)}">
    <link rel="canonical" href="${articleUrl}">

    <meta property="og:title" content="${escapeHtml(article.title)}">
    <meta property="og:description" content="${escapeHtml(metaDesc)}">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${articleUrl}">
    <meta property="og:type" content="article">
    <meta property="article:published_time" content="${escapeHtml(article.created_at)}">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(article.title)}">
    <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": ${JSON.stringify(article.title)},
      "image": ${JSON.stringify(article.image_url || `${SITE_URL}/icon.png`)},
      "datePublished": ${JSON.stringify(article.created_at)},
      "dateModified": ${JSON.stringify(article.created_at)},
      "description": ${JSON.stringify(metaDesc)},
      "articleBody": ${JSON.stringify(plainBody)},
      "author": {
        "@type": "Organization",
        "name": "TroyStack",
        "url": "${SITE_URL}"
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
      title: `${article.title} | Stack Signal | TroyStack`,
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
                <a href="/signal" class="btn btn-secondary">Browse Stack Signal</a>
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
