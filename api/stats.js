// Tableau de bord des clics sur les liens tracés.
// /stats?k=<STATS_TOKEN>            -> mini dashboard HTML
// /stats?k=<STATS_TOKEN>&format=json -> JSON brut
const WINDOW_DAYS = 90;

function group(rows, pick) {
  const map = new Map();
  for (const r of rows) {
    const k = pick(r) || '—';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function domain(ref) {
  if (!ref) return 'direct';
  try { return new URL(ref).hostname.replace(/^www\./, ''); } catch (_) { return 'direct'; }
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://okanpasoklm.com');
  const token = process.env.STATS_TOKEN;
  if (!token || url.searchParams.get('k') !== token) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Non autorisé');
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const api = `${process.env.SUPABASE_URL}/rest/v1/linkbio_clicks` +
    `?select=slug,clicked_at,referrer,country,src&clicked_at=gte.${since}` +
    `&order=clicked_at.desc&limit=50000`;

  let rows = [];
  try {
    const r = await fetch(api, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    rows = await r.json();
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end(`Erreur Supabase : ${e.message}`);
  }

  const now = Date.now();
  const within = (d) => rows.filter((r) => now - Date.parse(r.clicked_at) <= d * 86400000);
  const data = {
    total: rows.length,
    jour: within(1).length,
    semaine: within(7).length,
    mois: within(30).length,
    par_lien: Object.fromEntries(group(rows, (r) => r.slug)),
    par_source: Object.fromEntries(group(rows, (r) => r.src)),
    par_provenance: Object.fromEntries(group(rows, (r) => domain(r.referrer)).slice(0, 12)),
    par_pays: Object.fromEntries(group(rows, (r) => r.country).slice(0, 12)),
    par_jour: Object.fromEntries(group(within(30), (r) => r.clicked_at.slice(0, 10)).sort()),
  };

  if (url.searchParams.get('format') === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify(data, null, 2));
  }

  const table = (title, obj) => `
    <section><h2>${esc(title)}</h2><table>${
      Object.entries(obj).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') ||
      '<tr><td colspan="2">Aucun clic</td></tr>'
    }</table></section>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Clics — OkanPasOKLM</title><style>
:root{--fire:#ff5e1a}
body{background:#070707;color:#fff;font-family:Inter,-apple-system,system-ui,sans-serif;margin:0;padding:28px 18px;max-width:820px;margin-inline:auto}
h1{font-size:22px;margin:0 0 4px}p.sub{color:#888;margin:0 0 24px;font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:28px}
.kpi{background:#121212;border:1px solid #222;border-radius:14px;padding:14px}
.kpi b{display:block;font-size:26px;color:var(--fire)}.kpi span{font-size:12px;color:#999}
h2{font-size:14px;color:#bbb;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;background:#101010;border:1px solid #222;border-radius:12px;overflow:hidden}
td{padding:9px 12px;border-bottom:1px solid #1c1c1c;font-size:14px}
tr:last-child td{border-bottom:0}td:last-child{text-align:right;color:var(--fire);font-weight:700}
</style></head><body>
<h1>Clics sur les liens tracés</h1>
<p class="sub">${WINDOW_DAYS} derniers jours · ${rows.length} clic(s) enregistré(s)</p>
<div class="kpis">
  <div class="kpi"><b>${data.jour}</b><span>24 h</span></div>
  <div class="kpi"><b>${data.semaine}</b><span>7 jours</span></div>
  <div class="kpi"><b>${data.mois}</b><span>30 jours</span></div>
  <div class="kpi"><b>${data.total}</b><span>total</span></div>
</div>
${table('Par lien', data.par_lien)}
${table('Par source (?src=)', data.par_source)}
${table('Provenance', data.par_provenance)}
${table('Pays', data.par_pays)}
${table('Par jour (30 j)', data.par_jour)}
</body></html>`);
};
