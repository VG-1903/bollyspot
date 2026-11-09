// Minimal Upstash Redis REST client (no dependencies).
// Vercel's Upstash integration sets KV_REST_API_URL / KV_REST_API_TOKEN;
// a direct Upstash database uses UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
function config() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function pipeline(commands) {
  const c = config();
  if (!c) throw new Error('storage not configured');
  const r = await fetch(c.url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error('redis http ' + r.status);
  const rows = await r.json();
  return rows.map(row => {
    if (row.error) throw new Error('redis: ' + row.error);
    return row.result;
  });
}

module.exports = { configured: () => !!config(), pipeline };
