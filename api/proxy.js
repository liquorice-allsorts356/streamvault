// StreamVault CORS Proxy v2 — Vercel Serverless Function
// Routes IPTV API requests through Vercel to bypass browser CORS restrictions

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'Missing "url" query parameter' });
    }

    const targetUrl = decodeURIComponent(url);

    // Basic validation
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Invalid URL — must start with http:// or https://' });
    }

    // Fetch from IPTV server with generous timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(targetUrl, {
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: {
        'User-Agent': 'StreamVault/3.2',
        'Accept': '*/*',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream returned ${response.status} ${response.statusText}`,
      });
    }

    const contentType = response.headers.get('content-type') || '';

    // Read body as text (works for JSON, M3U, XML etc)
    const body = await response.text();

    // Detect type and set appropriate content-type
    if (
      contentType.includes('json') ||
      targetUrl.includes('player_api.php') ||
      targetUrl.includes('panel_api.php') ||
      body.trimStart().startsWith('{') ||
      body.trimStart().startsWith('[')
    ) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    } else if (
      contentType.includes('xml') ||
      targetUrl.includes('xmltv') ||
      body.trimStart().startsWith('<?xml')
    ) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    } else if (
      contentType.includes('mpegurl') ||
      targetUrl.endsWith('.m3u') ||
      targetUrl.endsWith('.m3u8') ||
      body.trimStart().startsWith('#EXTM3U')
    ) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

    return res.status(200).send(body);

  } catch (error) {
    console.error('Proxy error:', error.message);

    if (error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Request timed out — IPTV server took too long (30s limit)',
      });
    }

    return res.status(500).json({
      error: 'Proxy error: ' + (error.message || 'Unknown error'),
    });
  }
}
