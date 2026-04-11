const UPSTREAM = 'https://api.stacktrackergold.com/v1/prices';

const FALLBACK = {
  success: true,
  cached: false,
  fallback: true,
  timestamp: '2026-04-11T00:00:00Z',
  prices: {
    gold:   { price: 4748.49, unit: 'USD/oz' },
    silver: { price: 75.93,   unit: 'USD/oz' },
  },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const response = await fetch(UPSTREAM, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const data = await response.json();
    const gold = data?.prices?.gold?.price;
    const silver = data?.prices?.silver?.price;
    if (typeof gold !== 'number' || typeof silver !== 'number') {
      throw new Error('upstream missing gold/silver');
    }
    return res.status(200).send(JSON.stringify({
      success: true,
      fallback: false,
      timestamp: data.timestamp || new Date().toISOString(),
      prices: {
        gold:   { price: gold,   unit: 'USD/oz' },
        silver: { price: silver, unit: 'USD/oz' },
      },
    }));
  } catch (err) {
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(200).send(JSON.stringify(FALLBACK));
  }
};
