const {
  fetchList,
  escapeHtml,
  formatDate,
  firstSentences,
  categoryLabel,
  renderShell,
  SITE_URL,
  APP_STORE_URL,
} = require('./_shared/signal-lib');

const PAGE_SIZE = 10;

function renderCard(article) {
  const slug = article.slug;
  const title = article.title || '';
  const excerpt = firstSentences(article.troy_commentary, 2, 220);
  const date = formatDate(article.published_at || article.created_at);
  const category = categoryLabel(article.category);
  const image = article.image_url;

  return `<a href="/signal/${escapeHtml(slug)}" class="signal-card">
    ${image ? `<img class="signal-card-image" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">` : ''}
    <div class="signal-card-body">
      <div class="signal-card-meta">
        ${category ? `<span class="category-badge">${escapeHtml(category)}</span>` : ''}
        <span class="signal-card-date">${escapeHtml(date)}</span>
      </div>
      <h3 class="signal-card-title">${escapeHtml(title)}</h3>
      <p class="signal-card-excerpt">${escapeHtml(excerpt)}</p>
    </div>
  </a>`;
}

module.exports = async (req, res) => {
  try {
    const articles = await fetchList({ limit: PAGE_SIZE, offset: 0 });

    const cards = articles.length > 0
      ? articles.map(renderCard).join('\n')
      : '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px 0;">No articles yet.</p>';

    const hasMore = articles.length === PAGE_SIZE;

    const itemListJson = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Stack Signal',
      description: 'AI-powered precious metals market intelligence by Troy',
      url: `${SITE_URL}/signal`,
      numberOfItems: articles.length,
      itemListElement: articles.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/signal/${a.slug}`,
        name: a.title,
      })),
    };

    const ogImage = (articles[0] && articles[0].image_url) || `${SITE_URL}/icon.png`;

    const head = `
    <meta name="description" content="AI-powered precious metals market analysis. Daily coverage of gold, silver, COMEX, and the macro environment. By Troy, your AI stack analyst.">
    <link rel="canonical" href="${SITE_URL}/signal">
    <meta property="og:title" content="Stack Signal — Daily Gold &amp; Silver Market Intelligence">
    <meta property="og:description" content="AI-powered precious metals market analysis by Troy, your AI stack analyst.">
    <meta property="og:image" content="${escapeHtml(ogImage)}">
    <meta property="og:url" content="${SITE_URL}/signal">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="TroyStack">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Stack Signal — Daily Gold &amp; Silver Market Intelligence">
    <meta name="twitter:description" content="AI-powered precious metals market analysis by Troy.">
    <meta name="twitter:image" content="${escapeHtml(ogImage)}">
    <meta name="twitter:site" content="@troystack_">
    <script type="application/ld+json">${JSON.stringify(itemListJson)}</script>`;

    const body = `
    <style>
      .signal-hero {
        padding: 64px 0 28px;
        text-align: center;
        position: relative;
      }
      .signal-hero h1 {
        font-size: clamp(1.85rem, 5.2vw, 2.65rem);
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1.1;
        margin-bottom: 14px;
      }
      .signal-hero h1 .accent { color: var(--gold); }
      .signal-hero p {
        color: var(--text-secondary);
        font-size: clamp(0.95rem, 2.4vw, 1.05rem);
        max-width: 580px;
        margin: 0 auto;
      }

      .signal-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        margin-top: 36px;
      }

      .signal-card {
        background: var(--bg-card);
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: border-color 0.18s ease, transform 0.18s ease;
      }
      .signal-card:hover {
        border-color: var(--gold-border);
        transform: translateY(-2px);
      }
      .signal-card-image {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        background: var(--bg-card-2);
      }
      .signal-card-body {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex: 1;
      }
      .signal-card-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .signal-card-date {
        font-size: 0.78rem;
        color: var(--text-muted);
      }
      .signal-card-title {
        font-size: 1.05rem;
        font-weight: 700;
        line-height: 1.3;
        color: var(--text);
      }
      .signal-card-excerpt {
        font-size: 0.88rem;
        color: var(--text-secondary);
        line-height: 1.55;
        margin-top: auto;
      }

      .load-more-wrap {
        text-align: center;
        margin: 36px 0 0;
      }
      .load-more {
        padding: 12px 28px;
        background: transparent;
        border: 1px solid var(--gold-border);
        border-radius: 10px;
        color: var(--gold);
        font-weight: 700;
        font-size: 0.9rem;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .load-more:hover { background: var(--gold-soft); border-color: var(--gold); }
      .load-more:disabled { opacity: 0.4; cursor: default; }
      .load-more.loading { color: var(--text-muted); }

      @media (max-width: 720px) {
        .signal-grid { grid-template-columns: 1fr; }
      }
    </style>

    <section class="signal-hero">
      <div class="container">
        <h1>Stack Signal<br><span class="accent">AI-Powered Precious Metals Intelligence</span></h1>
        <p>Daily market analysis written by Troy, your AI stack analyst. Updated every 2 hours.</p>
      </div>
    </section>

    <section>
      <div class="container">
        <div id="signal-grid" class="signal-grid">
          ${cards}
        </div>
        <div class="load-more-wrap">
          <button id="load-more" class="load-more"${hasMore ? '' : ' disabled'} data-offset="${PAGE_SIZE}">
            ${hasMore ? 'Load More' : 'You&rsquo;ve reached the end'}
          </button>
        </div>
      </div>
    </section>

    <section>
      <div class="container">
        <div class="cta">
          <h2>Want Troy's analysis on <span class="accent">YOUR</span> stack?</h2>
          <p>TroyStack gives you personalized daily briefings, Troy Chat, portfolio tracking, price alerts, and full COMEX vault data.</p>
          <a href="${APP_STORE_URL}" target="_blank" rel="noopener" class="cta-btn">Download TroyStack</a>
        </div>
      </div>
    </section>

    <script>
    (function(){
      var btn = document.getElementById('load-more');
      var grid = document.getElementById('signal-grid');
      if (!btn || !grid) return;

      function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
      function stripMd(s){
        return String(s||'')
          .replace(/\`([^\`]+)\`/g,'$1')
          .replace(/\\[([^\\]]+)\\]\\([^)]*\\)/g,'$1')
          .replace(/^#{1,6}\\s+/gm,'')
          .replace(/\\*\\*([^*]+)\\*\\*/g,'$1')
          .replace(/\\*([^*]+)\\*/g,'$1')
          .replace(/\\s+/g,' ').trim();
      }
      function firstSent(txt, max){
        var c = stripMd(txt);
        if (!c) return '';
        var m = c.match(/[^.!?]+[.!?]+/g);
        var out = (m && m.length ? m.slice(0,2).join(' ') : c).trim();
        if (out.length > max) {
          var slice = out.slice(0, max);
          var sp = slice.lastIndexOf(' ');
          out = (sp > 140 ? slice.slice(0, sp) : slice) + '\u2026';
        }
        return out;
      }
      function fmtDate(iso){
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US',{timeZone:'America/New_York',year:'numeric',month:'long',day:'numeric'});
      }
      function catLabel(c){
        return String(c||'').replace(/[_-]/g,' ').replace(/\\b\\w/g, function(x){return x.toUpperCase();});
      }
      function renderCard(a){
        var slug = esc(a.slug);
        var title = esc(a.title||'');
        var excerpt = esc(firstSent(a.troy_commentary, 220));
        var date = esc(fmtDate(a.published_at || a.created_at));
        var cat = esc(catLabel(a.category));
        var img = a.image_url;
        return '<a href="/signal/'+slug+'" class="signal-card">' +
          (img ? '<img class="signal-card-image" src="'+esc(img)+'" alt="'+title+'" loading="lazy">' : '') +
          '<div class="signal-card-body">' +
            '<div class="signal-card-meta">' +
              (cat ? '<span class="category-badge">'+cat+'</span>' : '') +
              '<span class="signal-card-date">'+date+'</span>' +
            '</div>' +
            '<h3 class="signal-card-title">'+title+'</h3>' +
            '<p class="signal-card-excerpt">'+excerpt+'</p>' +
          '</div>' +
        '</a>';
      }

      btn.addEventListener('click', async function(){
        if (btn.disabled) return;
        var offset = parseInt(btn.dataset.offset, 10) || 0;
        btn.disabled = true;
        btn.classList.add('loading');
        btn.textContent = 'Loading\u2026';
        try {
          var r = await fetch('/api/signal?limit=${PAGE_SIZE}&offset=' + offset);
          if (!r.ok) throw new Error('http ' + r.status);
          var data = await r.json();
          var articles = (data && data.articles) || [];
          if (articles.length === 0) {
            btn.textContent = 'You\u2019ve reached the end';
            btn.classList.remove('loading');
            return;
          }
          grid.insertAdjacentHTML('beforeend', articles.map(renderCard).join(''));
          var newOffset = offset + articles.length;
          btn.dataset.offset = String(newOffset);
          if (articles.length < ${PAGE_SIZE}) {
            btn.textContent = 'You\u2019ve reached the end';
            btn.classList.remove('loading');
          } else {
            btn.textContent = 'Load More';
            btn.classList.remove('loading');
            btn.disabled = false;
          }
        } catch (e) {
          btn.textContent = 'Retry';
          btn.classList.remove('loading');
          btn.disabled = false;
        }
      });
    })();
    </script>`;

    const html = renderShell({
      title: 'Stack Signal — Daily Gold & Silver Market Intelligence | TroyStack',
      head,
      body,
      activeNav: 'signal',
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.status(200).send(html);
  } catch (err) {
    const body = `
    <section style="padding:120px 0;text-align:center;">
      <div class="container">
        <h1 style="font-size:1.5rem;margin-bottom:12px;">Signal temporarily unavailable</h1>
        <p style="color:var(--text-secondary);margin-bottom:24px;">Please try again in a moment.</p>
        <a href="/" class="cta-btn">Back to Home</a>
      </div>
    </section>`;
    const html = renderShell({
      title: 'Stack Signal | TroyStack',
      body,
      activeNav: 'signal',
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=30');
    res.status(200).send(html);
  }
};
