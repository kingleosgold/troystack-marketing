const APP_STORE_URL = 'https://apps.apple.com/us/app/stack-tracker-gold/id6738029817';
const WEB_APP_URL = 'https://app.stacktrackergold.com';
const SITE_URL = 'https://www.stacktrackergold.com';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatPrice(price) {
  if (!price) return '';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPage({ title, head = '', body = '', activeNav = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="apple-itunes-app" content="app-id=6738029817">
    ${head}
    <link rel="icon" href="/icon.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0a0a0a;
            --bg-card: #1a1a1a;
            --gold: #C9A84C;
            --gold-glow: rgba(201, 168, 76, 0.1);
            --text: #f5f5f5;
            --text-secondary: #999;
            --text-muted: #666;
            --border: #222;
            --border-light: #2a2a2a;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }

        body {
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            overflow-x: hidden;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 24px;
        }

        /* ── Nav ──────────────────────────────────────── */

        header {
            position: sticky;
            top: 0;
            z-index: 100;
            background: rgba(10, 10, 10, 0.92);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
        }

        .header-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            height: 64px;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 10px;
            text-decoration: none;
            color: var(--text);
        }

        .logo img { width: 32px; height: 32px; border-radius: 8px; }
        .logo span { font-weight: 700; font-size: 1rem; }

        .nav-toggle { display: none; }

        .nav-toggle-label {
            display: none;
            flex-direction: column;
            justify-content: center;
            gap: 5px;
            cursor: pointer;
            padding: 8px 4px;
            z-index: 10;
        }

        .nav-toggle-label span {
            display: block;
            width: 22px;
            height: 2px;
            background: var(--text);
            border-radius: 2px;
            transition: transform 0.2s ease, opacity 0.2s ease;
        }

        .nav-toggle:checked ~ .nav-toggle-label span:nth-child(1) { transform: rotate(45deg) translate(5px, 5px); }
        .nav-toggle:checked ~ .nav-toggle-label span:nth-child(2) { opacity: 0; }
        .nav-toggle:checked ~ .nav-toggle-label span:nth-child(3) { transform: rotate(-45deg) translate(5px, -5px); }

        .nav-links {
            display: flex;
            align-items: center;
            gap: 32px;
        }

        .nav-links a {
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.9rem;
            font-weight: 500;
            transition: color 0.15s ease;
        }

        .nav-links a:hover { color: var(--text); }
        .nav-links a.active { color: var(--gold); }

        /* ── Buttons ──────────────────────────────────── */

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            text-decoration: none;
            cursor: pointer;
            border: none;
            font-family: inherit;
            transition: opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .btn-primary { background: var(--gold); color: #000; }
        .btn-primary:hover { opacity: 0.88; }

        .btn-secondary {
            background: transparent;
            color: var(--text);
            border: 1px solid var(--border-light);
        }

        .btn-secondary:hover { border-color: var(--gold); color: var(--gold); }

        /* ── Signal Hero ──────────────────────────────── */

        .signal-hero {
            padding: 120px 0 48px;
            text-align: center;
            position: relative;
        }

        .signal-hero::before {
            content: '';
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 600px;
            height: 400px;
            background: radial-gradient(ellipse, var(--gold-glow) 0%, transparent 70%);
            pointer-events: none;
        }

        .signal-hero h1 {
            font-size: clamp(2rem, 4.5vw, 3rem);
            font-weight: 700;
            letter-spacing: -0.02em;
            position: relative;
        }

        .signal-hero .subtitle {
            color: var(--gold);
            font-size: 1.1rem;
            font-weight: 500;
            margin-top: 8px;
            position: relative;
        }

        .signal-hero .desc {
            color: var(--text-secondary);
            font-size: 1rem;
            max-width: 620px;
            margin: 16px auto 32px;
            line-height: 1.65;
            position: relative;
        }

        /* ── Signal Grid ──────────────────────────────── */

        .signal-articles { padding: 0 0 80px; }

        .signal-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
            gap: 24px;
        }

        .signal-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
            transition: border-color 0.2s ease, transform 0.2s ease;
            text-decoration: none;
            color: inherit;
            display: flex;
            flex-direction: column;
        }

        .signal-card:hover {
            border-color: var(--gold);
            transform: translateY(-2px);
        }

        .signal-card-image {
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
        }

        .signal-card-body {
            padding: 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
        }

        .signal-card-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .category-badge {
            text-transform: uppercase;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            color: var(--gold);
            background: rgba(201, 168, 76, 0.1);
            padding: 4px 10px;
            border-radius: 20px;
        }

        .troy-score {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--gold);
        }

        .signal-card-title {
            font-size: 1.05rem;
            font-weight: 600;
            line-height: 1.35;
            margin-bottom: 8px;
        }

        .signal-card-date {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-bottom: 12px;
        }

        .signal-card-oneliner {
            font-size: 0.88rem;
            color: var(--text-secondary);
            line-height: 1.55;
            font-style: italic;
            margin-top: auto;
        }

        /* ── Individual Article ───────────────────────── */

        .article-hero-img {
            width: 100%;
            max-height: 480px;
            object-fit: cover;
        }

        .article-content {
            max-width: 760px;
            margin: 0 auto;
            padding: 32px 24px 0;
        }

        .article-meta-top {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
        }

        .troy-score-lg {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--gold);
            background: rgba(201, 168, 76, 0.12);
            padding: 6px 14px;
            border-radius: 20px;
        }

        .article-content h1 {
            font-size: clamp(1.5rem, 3.5vw, 2.25rem);
            font-weight: 700;
            line-height: 1.25;
            letter-spacing: -0.02em;
            margin-bottom: 16px;
        }

        .article-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 20px;
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .article-meta .sep { color: var(--text-muted); }

        .article-prices {
            display: flex;
            gap: 20px;
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-bottom: 32px;
            padding-bottom: 32px;
            border-bottom: 1px solid var(--border);
        }

        /* ── Troy Analysis ────────────────────────────── */

        .troy-analysis { margin: 32px 0 40px; }

        .troy-analysis-header {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--gold);
            margin-bottom: 20px;
            border-left: 3px solid var(--gold);
            padding-left: 12px;
        }

        .commentary-public p {
            font-size: 1.05rem;
            line-height: 1.8;
            color: var(--text);
        }

        .commentary-paywall {
            position: relative;
            margin-top: 16px;
            min-height: 180px;
        }

        .commentary-blurred {
            filter: blur(6px);
            user-select: none;
            -webkit-user-select: none;
            pointer-events: none;
        }

        .commentary-blurred p {
            font-size: 1.05rem;
            line-height: 1.8;
            color: var(--text);
            margin-bottom: 12px;
        }

        .commentary-cta-overlay {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(to bottom, rgba(10,10,10,0.1), rgba(10,10,10,0.97) 75%);
        }

        .cta-box {
            text-align: center;
            padding: 32px;
        }

        .cta-box p {
            font-size: 1.05rem;
            font-weight: 500;
            margin-bottom: 20px;
            color: var(--text);
        }

        .cta-box .cta-sub {
            font-size: 0.85rem;
            color: var(--text-muted);
            margin-top: 12px;
            font-weight: 400;
        }

        /* ── Source Link ──────────────────────────────── */

        .article-source-link {
            margin: 0 0 48px;
            padding: 20px 24px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 10px;
        }

        .article-source-link .source-label {
            font-size: 0.8rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            font-weight: 600;
            margin-bottom: 6px;
        }

        .article-source-link a {
            color: var(--gold);
            text-decoration: none;
            font-weight: 500;
            font-size: 0.95rem;
        }

        .article-source-link a:hover { text-decoration: underline; }

        /* ── Related Articles ─────────────────────────── */

        .related-articles {
            padding: 64px 0;
            border-top: 1px solid var(--border);
        }

        .related-articles h2 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 32px;
            text-align: center;
        }

        .related-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 20px;
        }

        /* ── Bottom CTA ───────────────────────────────── */

        .signal-cta-bottom {
            padding: 80px 0;
            text-align: center;
            border-top: 1px solid var(--border);
        }

        .signal-cta-bottom h2 {
            font-size: clamp(1.5rem, 3vw, 2rem);
            font-weight: 700;
            margin-bottom: 12px;
        }

        .signal-cta-bottom p {
            color: var(--text-secondary);
            max-width: 520px;
            margin: 0 auto 28px;
            line-height: 1.6;
        }

        .signal-cta-buttons {
            display: flex;
            gap: 16px;
            justify-content: center;
            flex-wrap: wrap;
        }

        /* ── Error ────────────────────────────────────── */

        .error-page {
            padding: 160px 0;
            text-align: center;
        }

        .error-page h1 {
            font-size: 2rem;
            margin-bottom: 12px;
        }

        .error-page p {
            color: var(--text-secondary);
            margin-bottom: 32px;
        }

        /* ── Footer ───────────────────────────────────── */

        footer {
            padding: 48px 0;
            border-top: 1px solid var(--border);
        }

        .footer-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 24px;
        }

        .footer-logo {
            display: flex;
            align-items: center;
            gap: 10px;
            text-decoration: none;
            color: var(--text);
        }

        .footer-logo img { width: 28px; height: 28px; border-radius: 6px; }
        .footer-logo span { font-weight: 600; font-size: 0.95rem; }

        .footer-links { display: flex; gap: 24px; }

        .footer-links a {
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.85rem;
            transition: color 0.15s ease;
        }

        .footer-links a:hover { color: var(--gold); }

        .footer-bottom {
            text-align: center;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid var(--border);
        }

        .footer-bottom p { color: var(--text-muted); font-size: 0.8rem; }
        .footer-bottom p + p { margin-top: 6px; font-size: 0.75rem; }

        /* ── Responsive ───────────────────────────────── */

        @media (max-width: 900px) {
            .nav-toggle-label { display: flex; }

            .nav-links {
                display: none;
                position: absolute;
                top: 64px;
                left: 0;
                right: 0;
                background: var(--bg);
                border-bottom: 1px solid var(--border);
                flex-direction: column;
                padding: 20px 24px;
                gap: 16px;
            }

            .nav-toggle:checked ~ .nav-links { display: flex; }

            .signal-grid { grid-template-columns: 1fr 1fr; }
            .related-grid { grid-template-columns: 1fr 1fr; }
        }

        @media (max-width: 600px) {
            .signal-hero { padding: 100px 0 36px; }
            .signal-grid { grid-template-columns: 1fr; }
            .related-grid { grid-template-columns: 1fr; }

            .signal-cta-buttons {
                flex-direction: column;
                align-items: stretch;
            }

            .signal-cta-buttons .btn { width: 100%; }

            .article-meta-top { flex-wrap: wrap; }
            .article-prices { flex-wrap: wrap; gap: 12px; }

            .footer-top {
                flex-direction: column;
                text-align: center;
            }

            .footer-links {
                flex-wrap: wrap;
                justify-content: center;
            }
        }
    </style>
</head>
<body>

    <header>
        <div class="container header-inner">
            <a href="/" class="logo">
                <img src="/icon.png" alt="Stack Tracker Gold">
                <span>Stack Tracker Gold</span>
            </a>
            <input type="checkbox" id="nav-toggle" class="nav-toggle">
            <label for="nav-toggle" class="nav-toggle-label" aria-label="Toggle menu">
                <span></span>
                <span></span>
                <span></span>
            </label>
            <nav class="nav-links">
                <a href="/signal"${activeNav === 'signal' ? ' class="active"' : ''}>Stack Signal</a>
                <a href="/#features">Features</a>
                <a href="/#troy">Troy</a>
                <a href="/#pricing">Pricing</a>
                <a href="${APP_STORE_URL}" target="_blank" rel="noopener">Download</a>
            </nav>
        </div>
    </header>

    <main>${body}</main>

    <footer>
        <div class="container">
            <div class="footer-top">
                <a href="/" class="footer-logo">
                    <img src="/icon.png" alt="Stack Tracker Gold">
                    <span>Stack Tracker Gold</span>
                </a>
                <div class="footer-links">
                    <a href="/signal">Stack Signal</a>
                    <a href="/privacy">Privacy Policy</a>
                    <a href="/terms">Terms of Service</a>
                    <a href="mailto:support@stacktrackergold.com">Contact</a>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; ${new Date().getFullYear()} Mancini Tech Solutions</p>
            </div>
        </div>
    </footer>

    <script>
        document.querySelectorAll('.nav-links a').forEach(function(link) {
            link.addEventListener('click', function() {
                document.getElementById('nav-toggle').checked = false;
            });
        });
    </script>

</body>
</html>`;
}

function renderArticleCard(article) {
  const { slug, title, troy_one_liner, category, image_url, relevance_score, published_at } = article;
  return `<a href="/signal/${escapeHtml(slug)}" class="signal-card">
    <img class="signal-card-image" src="${escapeHtml(image_url)}" alt="${escapeHtml(title)}" loading="lazy">
    <div class="signal-card-body">
        <div class="signal-card-meta">
            <span class="category-badge">${escapeHtml(category)}</span>
            <span class="troy-score">Troy Score: ${relevance_score}</span>
        </div>
        <h3 class="signal-card-title">${escapeHtml(title)}</h3>
        <p class="signal-card-date">${formatDate(published_at)}</p>
        <p class="signal-card-oneliner">"${escapeHtml(troy_one_liner)}"</p>
    </div>
</a>`;
}

module.exports = {
  renderPage,
  renderArticleCard,
  escapeHtml,
  formatDate,
  formatPrice,
  APP_STORE_URL,
  WEB_APP_URL,
  SITE_URL,
};
