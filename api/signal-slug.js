const UPSTREAM = 'https://api.troystack.ai/v1/stack-signal';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const slug = req.query.slug;
  if (!slug) {
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(400).send(JSON.stringify({ success: false, error: 'slug required' }));
  }

  try {
    const r = await fetch(`${UPSTREAM}/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json' },
    });
    if (r.status === 404) {
      res.setHeader('Cache-Control', 's-maxage=60');
      return res.status(404).send(JSON.stringify({ success: false, error: 'not found' }));
    }
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(JSON.stringify(data));
  } catch (err) {
    res.setHeader('Cache-Control', 's-maxage=30');
    return res.status(200).send(JSON.stringify({
      success: false,
      error: 'upstream unavailable',
    }));
  }
};
