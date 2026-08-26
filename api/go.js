// Liens d'entrée tracés : le lien qu'on met dans la bio d'un réseau (ex. /x pour X)
// renvoie vers la page de liens et enregistre d'où vient le visiteur.
// Ajouter un réseau = une ligne ici + un rewrite dans vercel.json.
const PAGE_LIENS = 'https://okanpasoklm.com/liens';
const DESTINATIONS = {
  x: PAGE_LIENS,
};

const BOT_UA = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegrambot|discordbot|slackbot|twitterbot|embedly|quora link preview|vercel|headless/i;

function header(req, name) {
  const v = req.headers[name];
  return v && String(v).trim() ? String(v).slice(0, 500) : null;
}

async function logClick(req, slug, src) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return;

  const city = header(req, 'x-vercel-ip-city');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(`${url}/rest/v1/linkbio_clicks`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        slug,
        src,
        referrer: header(req, 'referer'),
        user_agent: header(req, 'user-agent'),
        country: header(req, 'x-vercel-ip-country'),
        city: city ? decodeURIComponent(city) : null,
      }),
      signal: controller.signal,
    });
  } catch (_) {
    // un log qui rate ne doit jamais casser la redirection
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://okanpasoklm.com');
  const slug = (url.searchParams.get('slug') || '').toLowerCase();
  const dest = DESTINATIONS[slug];

  if (!dest) {
    res.statusCode = 302;
    res.setHeader('Location', '/liens');
    return res.end();
  }

  const ua = header(req, 'user-agent') || '';
  if (!BOT_UA.test(ua)) {
    const src = (url.searchParams.get('src') || url.searchParams.get('utm_source') || '').slice(0, 60) || null;
    await logClick(req, slug, src);
  }

  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Location', dest);
  res.end();
};
