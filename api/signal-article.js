const {
  fetchArticle,
  fetchList,
  escapeHtml,
  formatDate,
  firstSentences,
  readingTime,
  renderMarkdown,
  stripMarkdown,
  categoryLabel,
  renderShell,
  SITE_URL,
  APP_STORE_URL,
} = require('./_shared/signal-lib');

module.exports = async (req, res) => {
  const slug = req.query.slug;
  if (!slug) {
    res.writeHead(302, { Location: '/signal' });
    return res.end();
  }

  try {
    const [article, related] = await Promise.all([
      fetchArticle(slug),
      fetchList({ limit: 4 }).catch(() => []),
    ]);

    if (!article) {
      const body = `
      <section style="padding:120px 0;text-align:center;">
        <div class="container">
          <h1 style="font-size:1.75rem;margin-bottom:12px;">Article not found</h1>
          <p style="color:var(--text-secondary);margin-bottom:24px;">This article may have been removed or the URL may be incorrect.</p>
          <a href="/signal" class="cta-btn">Browse Stack Signal</a>
        </div>
      </section>`;
      const html = renderShell({
        title: 'Article Not Found | TroyStack',
        body,
        activeNav: 'signal',
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=60');
      return res.status(404).send(html);
    }

    const title = article.title || 'Stack Signal';
    const commentary = article.troy_commentary || '';
    const bodyHtml = renderMarkdown(commentary);
    const metaDesc = firstSentences(commentary, 2, 160);
    const mins = readingTime(commentary);
    const plainBody = stripMarkdown(commentary);
    const date = formatDate(article.published_at || article.created_at);
    const category = categoryLabel(article.category);
    const heroImg = article.image_url;
    const articleUrl = `${SITE_URL}/signal/${encodeURIComponent(article.slug)}`;
    const ogImage = heroImg || `${SITE_URL}/icon.png`;

    const sources = Array.isArray(article.sources) ? article.sources : [];
    const sourcesHtml = sources.length > 0 ? `
      <div class="sources">
        <h3>Sources</h3>
        <ul>
          ${sources.map(s => {
            const label = s.title || s.name || s.url;
            const host = s.name || '';
            if (!s.url) return `<li>${escapeHtml(label)}</li>`;
            return `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener nofollow">${escapeHtml(label)}</a>${host ? ` <span class="src-name">— ${escapeHtml(host)}</span>` : ''}</li>`;
          }).join('')}
        </ul>
      </div>` : '';

    const relatedArticles = related.filter(a => a.slug !== slug).slice(0, 3);
    const relatedHtml = relatedArticles.length > 0 ? `
      <section class="related">
        <div class="container">
          <h2>More from Stack Signal</h2>
          <div class="related-grid">
            ${relatedArticles.map(a => `
              <a href="/signal/${escapeHtml(a.slug)}" class="related-card">
                ${a.image_url ? `<img src="${escapeHtml(a.image_url)}" alt="${escapeHtml(a.title || '')}" loading="lazy">` : ''}
                <div class="related-body">
                  <div class="related-date">${escapeHtml(formatDate(a.published_at || a.created_at))}</div>
                  <div class="related-title">${escapeHtml(a.title || '')}</div>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      </section>` : '';

    const newsArticleJson = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: title,
      image: heroImg ? [heroImg] : [`${SITE_URL}/icon.png`],
      datePublished: article.published_at || article.created_at,
      dateModified: article.published_at || article.created_at,
      description: metaDesc,
      articleBody: plainBody,
      author: {
        '@type': 'Organization',
        name: 'Troy — TroyStack AI Stack Analyst',
        url: SITE_URL,
      },
      publisher: {
        '@type': 'Organization',
        name: 'TroyStack',
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
    };

    const head = `
    <meta name="description" content="${escapeHtml(metaDesc)}">
    <link rel="canonical" href="${articleUrl}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(metaDesc)}">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:url" content="${articleUrl}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="TroyStack">
    <meta property="article:published_time" content="${escapeHtml(article.published_at || article.created_at || '')}">
    <meta property="article:section" content="${escapeHtml(category)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">
    <meta name="twitter:site" content="@troystack_">
    <script type="application/ld+json">${JSON.stringify(newsArticleJson)}</script>`;

    const body = `
    <style>
      .article-wrap { max-width: 760px; margin: 0 auto; padding: 48px 20px 0; }
      .back-link {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 0.85rem; color: var(--text-secondary);
        margin-bottom: 24px;
      }
      .back-link:hover { color: var(--gold); }

      .article-hero {
        width: 100%;
        max-height: 400px;
        border-radius: 16px;
        overflow: hidden;
        margin-bottom: 28px;
        border: 1px solid var(--border);
      }
      .article-hero img {
        width: 100%;
        max-height: 400px;
        object-fit: cover;
        display: block;
      }

      .article-meta-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .article-date { font-size: 0.85rem; color: var(--text-muted); }
      .article-sep { color: var(--text-muted); }

      .article-title {
        font-size: clamp(1.75rem, 4.2vw, 2.35rem);
        font-weight: 800;
        line-height: 1.18;
        letter-spacing: -0.02em;
        margin-bottom: 18px;
        color: var(--text);
      }
      .article-oneliner {
        font-size: 1.05rem;
        color: var(--gold);
        font-style: italic;
        line-height: 1.5;
        padding-left: 14px;
        border-left: 2px solid var(--gold-border);
        margin-bottom: 28px;
      }

      .prose {
        font-size: 16px;
        line-height: 1.75;
        color: var(--text);
      }
      .prose p { margin-bottom: 1.2em; }
      .prose h2 {
        font-size: 1.4rem;
        font-weight: 700;
        margin: 1.8em 0 0.55em;
        letter-spacing: -0.01em;
      }
      .prose h3 {
        font-size: 1.15rem;
        font-weight: 600;
        margin: 1.5em 0 0.45em;
        color: var(--gold);
      }
      .prose a {
        color: var(--gold);
        text-decoration: underline;
        text-decoration-color: rgba(201, 168, 76, 0.4);
        text-underline-offset: 3px;
      }
      .prose a:hover { text-decoration-color: var(--gold); }
      .prose strong { color: #fff; font-weight: 700; }
      .prose em { color: var(--text); }
      .prose ul, .prose ol { margin: 0 0 1.2em 1.4em; padding: 0; }
      .prose li { margin-bottom: 0.5em; }
      .prose blockquote {
        border-left: 3px solid var(--gold);
        padding: 4px 0 4px 16px;
        margin: 1.2em 0;
        color: var(--text-secondary);
        font-style: italic;
      }
      .prose code {
        background: var(--bg-card);
        border: 1px solid var(--border);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.9em;
      }

      .sources {
        margin-top: 40px;
        padding: 20px;
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 12px;
      }
      .sources h3 {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--gold);
        font-weight: 700;
        margin-bottom: 10px;
      }
      .sources ul { list-style: none; padding: 0; }
      .sources li {
        margin-bottom: 8px;
        font-size: 0.88rem;
        line-height: 1.5;
      }
      .sources a { color: var(--text-secondary); }
      .sources a:hover { color: var(--gold); text-decoration: underline; }
      .sources .src-name { color: var(--text-muted); font-size: 0.82rem; }

      .share-row {
        display: flex;
        gap: 10px;
        margin-top: 32px;
        flex-wrap: wrap;
      }
      .share-btn {
        padding: 10px 18px;
        background: var(--bg-card);
        border: 1px solid var(--gold-border);
        border-radius: 10px;
        color: var(--text);
        font-size: 0.85rem;
        font-weight: 600;
        transition: background 0.15s ease;
      }
      .share-btn:hover { background: var(--gold-soft); }
      .share-btn.copied { background: var(--gold); color: #0B1120; border-color: var(--gold); }

      .related {
        padding: 56px 0 0;
        border-top: 1px solid var(--border);
        margin-top: 56px;
      }
      .related .container { max-width: 820px; }
      .related h2 {
        font-size: 1.25rem;
        font-weight: 700;
        margin-bottom: 20px;
      }
      .related-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
      }
      .related-card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: border-color 0.18s ease;
      }
      .related-card:hover { border-color: var(--gold-border); }
      .related-card img {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
      }
      .related-body { padding: 14px; }
      .related-date { font-size: 0.72rem; color: var(--text-muted); margin-bottom: 6px; }
      .related-title { font-size: 0.88rem; font-weight: 600; line-height: 1.35; }

      @media (max-width: 720px) {
        .related-grid { grid-template-columns: 1fr; }
      }
    </style>

    <div class="article-wrap">
      <a class="back-link" href="/signal">&larr; All Stack Signal articles</a>

      ${heroImg ? `<div class="article-hero"><img src="${escapeHtml(heroImg)}" alt="${escapeHtml(title)}"></div>` : ''}

      <div class="article-meta-row">
        ${category ? `<span class="category-badge">${escapeHtml(category)}</span>` : ''}
        <span class="article-date">${escapeHtml(date)}</span>
        <span class="article-sep">&middot;</span>
        <span class="article-date">${mins} min read</span>
      </div>

      <h1 class="article-title">${escapeHtml(title)}</h1>

      ${article.troy_one_liner ? `<p class="article-oneliner">&ldquo;${escapeHtml(article.troy_one_liner)}&rdquo;</p>` : ''}

      <div class="prose">
        ${bodyHtml}
      </div>

      ${sourcesHtml}

      <div class="share-row">
        <button class="share-btn" id="share-x">𝕏 Share</button>
        <button class="share-btn" id="share-copy">Copy Link</button>
      </div>
    </div>

    ${relatedHtml}

    <div class="container">
      <div class="cta">
        <h2>Want Troy's analysis personalized to <span class="accent">YOUR</span> stack?</h2>
        <p>TroyStack delivers daily briefings, Troy Chat, portfolio tracking, and price alerts — tuned to the metals you hold.</p>
        <a href="${APP_STORE_URL}" target="_blank" rel="noopener" class="cta-btn">Download TroyStack</a>
      </div>
    </div>

    <script>
    (function(){
      var xBtn = document.getElementById('share-x');
      var copyBtn = document.getElementById('share-copy');
      var title = ${JSON.stringify(title)};
      var url = ${JSON.stringify(articleUrl)};

      if (xBtn) xBtn.addEventListener('click', function(){
        var text = title + ' — via @troystack_';
        window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank', 'noopener');
      });

      if (copyBtn) copyBtn.addEventListener('click', async function(){
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.textContent = '\u2713 Copied!';
          copyBtn.classList.add('copied');
          setTimeout(function(){
            copyBtn.textContent = 'Copy Link';
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (_) {
          prompt('Copy this link:', url);
        }
      });
    })();
    </script>`;

    const html = renderShell({
      title: `${title} | Stack Signal by TroyStack`,
      head,
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    res.status(200).send(html);
  } catch (err) {
    const body = `
    <section style="padding:120px 0;text-align:center;">
      <div class="container">
        <h1 style="font-size:1.5rem;margin-bottom:12px;">Unable to load article</h1>
        <p style="color:var(--text-secondary);margin-bottom:24px;">This article is temporarily unavailable. Please try again in a moment.</p>
        <a href="/signal" class="cta-btn">Browse Stack Signal</a>
      </div>
    </section>`;
    const html = renderShell({
      title: 'Article | TroyStack',
      body,
      activeNav: 'signal',
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).send(html);
  }
};
