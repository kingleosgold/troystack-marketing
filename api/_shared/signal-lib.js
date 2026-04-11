const UPSTREAM_BASE = 'https://api.troystack.ai/v1/stack-signal';

async function fetchList({ limit = 10, offset = 0 } = {}) {
  const url = `${UPSTREAM_BASE}?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.articles) ? data.articles : [];
}

async function fetchArticle(slug) {
  const url = `${UPSTREAM_BASE}/${encodeURIComponent(slug)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = await res.json();
  return data?.article || null;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function stripMarkdown(md) {
  if (!md) return '';
  return String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSentences(text, count = 2, maxLen = 220) {
  const clean = stripMarkdown(text);
  if (!clean) return '';
  const matches = clean.match(/[^.!?]+[.!?]+/g);
  let out;
  if (matches && matches.length) {
    out = matches.slice(0, count).join(' ').trim();
  } else {
    out = clean;
  }
  if (out.length > maxLen) {
    const slice = out.slice(0, maxLen);
    const lastSpace = slice.lastIndexOf(' ');
    out = (lastSpace > 140 ? slice.slice(0, lastSpace) : slice) + '…';
  }
  return out;
}

function readingTime(body) {
  const words = stripMarkdown(body).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function renderInline(text) {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => {
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) return txt;
    const safe = url.replace(/"/g, '');
    return `<a href="${safe}" target="_blank" rel="noopener nofollow">${txt}</a>`;
  });
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return t;
}

function renderMarkdown(md) {
  if (!md) return '';
  const blocks = String(md).replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    const h = block.match(/^(#{1,6})\s+(.+)$/);
    if (h && !block.includes('\n')) {
      const level = Math.min(h[1].length + 1, 6);
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }

    const lines = block.split('\n');
    if (lines.every(l => /^[-*+]\s+/.test(l))) {
      const items = lines.map(l => `<li>${renderInline(l.replace(/^[-*+]\s+/, ''))}</li>`).join('');
      out.push(`<ul>${items}</ul>`);
      continue;
    }
    if (lines.every(l => /^\d+\.\s+/.test(l))) {
      const items = lines.map(l => `<li>${renderInline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('');
      out.push(`<ol>${items}</ol>`);
      continue;
    }
    if (lines.every(l => /^>\s?/.test(l))) {
      const inner = lines.map(l => l.replace(/^>\s?/, '')).join(' ');
      out.push(`<blockquote>${renderInline(inner)}</blockquote>`);
      continue;
    }

    out.push(`<p>${lines.map(renderInline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

function categoryLabel(cat) {
  if (!cat) return '';
  return String(cat)
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const SITE_URL = 'https://troystack.com';
const APP_STORE_URL = 'https://apps.apple.com/us/app/troystack/id6738029817';

const SHARED_STYLES = `
    :root {
        --bg: #0B1120;
        --bg-card: #141B2D;
        --bg-card-2: #1a2236;
        --gold: #C9A84C;
        --gold-soft: rgba(201, 168, 76, 0.18);
        --gold-border: rgba(201, 168, 76, 0.32);
        --text: #FFFFFF;
        --text-secondary: #94A3B8;
        --text-muted: #64748B;
        --border: #1f2740;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: var(--bg);
        color: var(--text);
        line-height: 1.55;
        min-height: 100vh;
        overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }
    button { font-family: inherit; cursor: pointer; }
    .container { max-width: 820px; margin: 0 auto; padding: 0 20px; }

    header {
        position: sticky; top: 0; z-index: 50;
        background: rgba(11, 17, 32, 0.85);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-bottom: 1px solid var(--border);
    }
    .header-inner {
        display: flex; justify-content: space-between; align-items: center;
        height: 60px; max-width: 1100px; margin: 0 auto; padding: 0 20px;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo img { width: 30px; height: 30px; border-radius: 6px; }
    .logo span { font-weight: 700; font-size: 1rem; letter-spacing: -0.01em; }
    .nav-links {
        display: flex; align-items: center; gap: 22px;
    }
    .nav-links a {
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-weight: 500;
        transition: color 0.15s ease;
    }
    .nav-links a:hover { color: var(--text); }
    .nav-links a.active { color: var(--gold); }
    .header-cta {
        color: var(--gold); font-size: 0.85rem; font-weight: 600;
        padding: 6px 12px; border: 1px solid var(--gold-border); border-radius: 6px;
    }
    .nav-toggle { display: none; }
    .nav-toggle-label {
        display: none;
        flex-direction: column;
        gap: 4px;
        cursor: pointer;
        padding: 8px 4px;
    }
    .nav-toggle-label span {
        display: block; width: 22px; height: 2px;
        background: var(--text); border-radius: 2px;
    }

    footer {
        padding: 40px 0 40px;
        border-top: 1px solid var(--border);
        margin-top: 56px;
        text-align: center;
    }
    footer p { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; }
    footer a { color: var(--text-secondary); }
    footer a:hover { color: var(--gold); }

    .cta {
        margin: 56px 0 28px;
        padding: 28px 22px;
        background: linear-gradient(180deg, var(--bg-card) 0%, var(--bg-card-2) 100%);
        border: 1px solid var(--gold-border);
        border-radius: 18px;
        text-align: center;
    }
    .cta h2 {
        font-size: clamp(1.25rem, 4vw, 1.55rem);
        font-weight: 800;
        line-height: 1.25;
        margin-bottom: 8px;
        letter-spacing: -0.01em;
    }
    .cta h2 .accent { color: var(--gold); }
    .cta p {
        color: var(--text-secondary);
        font-size: 0.95rem;
        margin-bottom: 20px;
        max-width: 520px;
        margin: 0 auto 20px;
    }
    .cta-btn {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 14px 28px;
        background: var(--gold);
        color: #0B1120;
        font-weight: 800;
        border-radius: 12px;
        font-size: 1rem;
        transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .cta-btn:hover { opacity: 0.92; }
    .cta-btn:active { transform: scale(0.985); }

    .category-badge {
        display: inline-block;
        padding: 3px 10px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--gold);
        background: var(--gold-soft);
        border: 1px solid var(--gold-border);
        border-radius: 999px;
    }

    @media (max-width: 760px) {
        .nav-links { display: none; }
        .nav-toggle-label { display: flex; }
        .nav-toggle:checked ~ .nav-links {
            display: flex;
            position: absolute;
            top: 60px; left: 0; right: 0;
            background: var(--bg);
            border-bottom: 1px solid var(--border);
            flex-direction: column;
            padding: 18px 24px;
            gap: 16px;
        }
    }
`;

function renderShell({ title, head = '', body = '', activeNav = '' }) {
  const navItem = (href, label, key) =>
    `<a href="${href}"${activeNav === key ? ' class="active"' : ''}>${label}</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="apple-itunes-app" content="app-id=6738029817">
${head}
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<style>${SHARED_STYLES}</style>
</head>
<body>
<header>
  <div class="header-inner">
    <a href="/" class="logo">
      <img src="/icon.png" alt="TroyStack">
      <span>TroyStack</span>
    </a>
    <input type="checkbox" id="nav-toggle" class="nav-toggle">
    <label for="nav-toggle" class="nav-toggle-label" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </label>
    <nav class="nav-links">
      ${navItem('/signal', 'Signal', 'signal')}
      ${navItem('/calculator', 'Calculator', 'calculator')}
      ${navItem('/speculation', 'What If?', 'speculation')}
      ${navItem('/junk-silver', 'Junk Silver', 'junk-silver')}
      <a href="${APP_STORE_URL}" target="_blank" rel="noopener" class="header-cta">Get the App</a>
    </nav>
  </div>
</header>
<main>${body}</main>
<footer>
  <div class="container">
    <p>Built by <a href="https://mancinitechsolutions.com" target="_blank" rel="noopener">Mancini Tech Solutions</a></p>
    <p>
      <a href="${APP_STORE_URL}" target="_blank" rel="noopener">App Store</a>
      &nbsp;·&nbsp;
      <a href="/">troystack.com</a>
      &nbsp;·&nbsp;
      <a href="https://x.com/troystack_" target="_blank" rel="noopener">@troystack_</a>
    </p>
    <p style="margin-top: 10px;">Content by Troy AI. Not financial advice.</p>
  </div>
</footer>
</body>
</html>`;
}

module.exports = {
  fetchList,
  fetchArticle,
  escapeHtml,
  formatDate,
  stripMarkdown,
  firstSentences,
  readingTime,
  renderMarkdown,
  categoryLabel,
  renderShell,
  SITE_URL,
  APP_STORE_URL,
};
