# Bundles index.html + js/*.js into one self-contained page (dist/crab-dash.html) for hosts that take a
# single file. The page skeleton (doctype, html/head/body, charset and viewport tags) and the link-preview
# and icon tags are dropped, because such hosts supply their own.
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')

def inline(m):
    src = (root / m.group(1)).read_text(encoding='utf-8')
    assert '</script' not in src, m.group(1)
    return f'<script>\n/* {m.group(1)} */\n{src}\n</script>'

out = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
drop = [
    r'<!doctype html>\s*', r'</?html[^>]*>\s*', r'</?head>\s*', r'</?body>\s*',
    r'<meta charset="[^"]*">\s*', r'<meta name="viewport"[^>]*>\s*',
    r'<meta property="og:[^>]*>\s*', r'<meta name="twitter:[^>]*>\s*', r'<link rel="(?:icon|apple-touch-icon)"[^>]*>\s*',
]
for pat in drop:
    out = re.sub(pat, '', out, flags=re.I)
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'crab-dash.html').write_text(out, encoding='utf-8')
print('dist/crab-dash.html', len(out.encode('utf-8')), 'bytes')
