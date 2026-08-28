#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Récupère les miniatures des vidéos TikTok / Instagram / YouTube
et met à jour le tableau TOP_VIDEOS dans liens.html.

Usage :
  1) éditer tools/videos.txt  ->  une vidéo par ligne :
        https://www.tiktok.com/@okanpasoklm_biker/video/123... | 2,4M | Le run de nuit
     (les parties " | vues | titre " sont optionnelles)
  2) python3 tools/covers.py
"""
import json, os, re, subprocess, sys, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIST = os.path.join(ROOT, 'tools', 'videos.txt')
COVERS = os.path.join(ROOT, 'covers')
PAGE = os.path.join(ROOT, 'liens.html')

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
    })
    return urllib.request.urlopen(req, timeout=timeout).read()


def platform_of(url):
    if 'tiktok.' in url:
        return 'tiktok'
    if 'instagram.' in url:
        return 'insta'
    if 'youtu' in url:
        return 'yt'
    return 'tiktok'


def slug_of(url, plat):
    m = re.search(r'/video/(\d+)', url) or re.search(r'/(?:reel|reels|p)/([\w-]+)', url) \
        or re.search(r'(?:v=|youtu\.be/|shorts/)([\w-]+)', url)
    key = m.group(1) if m else re.sub(r'\W+', '', url)[-12:]
    return '%s-%s' % (plat, key)


def thumb_tiktok(url):
    api = 'https://www.tiktok.com/oembed?url=' + urllib.parse.quote(url, safe='')
    data = json.loads(get(api))
    return data.get('thumbnail_url'), (data.get('title') or '').strip()


def thumb_insta(url):
    base = url.split('?')[0].rstrip('/')
    html = get(base + '/embed/captioned/').decode('utf-8', 'ignore')
    m = re.search(r'"display_url":"(.*?)"', html) \
        or re.search(r'property="og:image"\s+content="(.*?)"', html) \
        or re.search(r'class="EmbeddedMediaImage"[^>]+src="(.*?)"', html)
    if not m:
        return None, ''
    img = m.group(1).encode().decode('unicode_escape').replace('&amp;', '&')
    return img, ''


def thumb_yt(url):
    m = re.search(r'(?:v=|youtu\.be/|shorts/)([\w-]+)', url)
    if not m:
        return None, ''
    return 'https://i.ytimg.com/vi/%s/maxresdefault.jpg' % m.group(1), ''


FETCH = {'tiktok': thumb_tiktok, 'insta': thumb_insta, 'yt': thumb_yt}


def save_cover(img_url, slug):
    path = os.path.join(COVERS, slug + '.jpg')
    with open(path, 'wb') as f:
        f.write(get(img_url, timeout=30))
    # redimensionne / compresse (macOS)
    try:
        subprocess.run(['sips', '-Z', '540', '-s', 'format', 'jpeg',
                        '-s', 'formatOptions', '72', path, '--out', path],
                       check=True, capture_output=True)
    except Exception:
        pass
    return 'covers/%s.jpg' % slug


def main():
    if not os.path.exists(LIST):
        sys.exit('❌ Crée %s (une vidéo par ligne).' % LIST)
    os.makedirs(COVERS, exist_ok=True)

    entries = []
    for raw in open(LIST, encoding='utf-8'):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = [p.strip() for p in line.split('|')]
        url, views, title = parts[0], (parts[1] if len(parts) > 1 else ''), (parts[2] if len(parts) > 2 else '')
        plat = platform_of(url)
        slug = slug_of(url, plat)
        cover = ''
        try:
            img, auto_title = FETCH[plat](url)
            if img:
                cover = save_cover(img, slug)
                print('✅ %s -> %s' % (plat, cover))
            else:
                print('⚠️  miniature introuvable : %s' % url)
            if not title and auto_title:
                title = auto_title[:70]
        except Exception as e:
            print('⚠️  %s : %s' % (url, e))
        entries.append({'plat': plat, 'url': url, 'views': views, 'title': title, 'cover': cover})

    js = ',\n'.join(
        '      { plat: %s, url: %s, views: %s, title: %s, cover: %s }' % (
            json.dumps(e['plat'], ensure_ascii=False), json.dumps(e['url'], ensure_ascii=False),
            json.dumps(e['views'], ensure_ascii=False), json.dumps(e['title'], ensure_ascii=False),
            json.dumps(e['cover'], ensure_ascii=False))
        for e in entries)

    html = open(PAGE, encoding='utf-8').read()
    new = 'var TOP_VIDEOS = [\n%s\n    ];' % js if entries else 'var TOP_VIDEOS = [];'
    html2, n = re.subn(r'var TOP_VIDEOS = \[[\s\S]*?\];', lambda m: new, html, count=1)
    if not n:
        sys.exit('❌ tableau TOP_VIDEOS introuvable dans liens.html')
    open(PAGE, 'w', encoding='utf-8').write(html2)
    print('\n🎬 %d vidéos écrites dans liens.html' % len(entries))


if __name__ == '__main__':
    main()
