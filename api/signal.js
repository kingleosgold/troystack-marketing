const UPSTREAM = 'https://api.troystack.ai/v1/stack-signal';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  try {
    const r = await fetch(`${UPSTREAM}?limit=${limit}&offset=${offset}`, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(JSON.stringify(data));
  } catch (err) {
    res.setHeader('Cache-Control', 's-maxage=30');
    return res.status(200).send(JSON.stringify({
      success: false,
      error: 'upstream unavailable',
      articles: [],
      limit,
      offset,
    }));
  }
};
