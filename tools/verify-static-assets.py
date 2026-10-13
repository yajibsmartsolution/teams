#!/usr/bin/env python3
"""Inspect linked JS/CSS/IMG assets for all role-manifest dashboard pages."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import re

root = Path(__file__).resolve().parents[1] / 'frontend'
manifest = (root / 'kedco-page-routes.js').read_text('utf-8')
paths = set(re.findall(r'["\'](/pages/[^"\']+\.html)["\']', manifest))

class Tags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        key = 'src' if tag in ('script', 'img', 'iframe') else 'href' if tag == 'link' else None
        if key:
            link = dict(attrs).get(key)
            if link:
                self.links.append((tag, link))

missing = []
for path in sorted(paths):
    page = root / path.lstrip('/')
    if not page.is_file():
        missing.append((path, 'missing page'))
        continue
    parser = Tags()
    parser.feed(page.read_text('utf-8', errors='replace'))
    for tag, value in parser.links:
        if value.startswith(('http:', 'https:', 'data:', 'blob:', '//', '#', 'javascript:', 'mailto:')):
            continue
        location = unquote(urlsplit(value).path)
        asset = root / location.lstrip('/') if location.startswith('/') else page.parent / location
        if not asset.is_file():
            missing.append((path, value))

if missing:
    for page, asset in missing:
        print('MISSING', page, asset)
    raise SystemExit(1)
print(f'PASS: {len(paths)} unique role-page HTML targets; all linked local asset files exist.')
