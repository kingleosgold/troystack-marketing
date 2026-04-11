const SUPABASE_URL = 'https://sixwgsqfutnvdxhrvkzd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_0r33KI_abURhBHAd2wlcTw_tUiOMt_2';

const TABLE = 'stack_signal_articles';
const COLUMNS = [
  'slug',
  'title',
  'troy_commentary',
  'troy_one_liner',
  'category',
  'sources',
  'image_url',
  'relevance_score',
  'published_at',
  'created_at',
].join(',');

async function supabaseFetch(query) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function normalize(row) {
  if (!row) return null;
  const sources = Array.isArray(row.sources) ? row.sources : [];
  return {
    slug: row.slug,
    title: row.title,
    body: row.troy_commentary || '',
    one_liner: row.troy_one_liner || '',
    category: row.category || '',
    image_url: row.image_url || '',
    source_count: sources.length,
    sources,
    importance_score: row.relevance_score,
    created_at: row.created_at || row.published_at,
    published_at: row.published_at || row.created_at,
  };
}

async function listArticles({ limit = 200 } = {}) {
  const query = `select=${COLUMNS}&order=created_at.desc&limit=${limit}`;
  const rows = await supabaseFetch(query);
  return rows
    .map(normalize)
    .filter(a => a.body && a.body.length > 500);
}

async function getArticleBySlug(slug) {
  const query = `select=${COLUMNS}&slug=eq.${encodeURIComponent(slug)}&limit=1`;
  const rows = await supabaseFetch(query);
  return normalize(rows[0]);
}

module.exports = {
  listArticles,
  getArticleBySlug,
  SUPABASE_URL,
};
