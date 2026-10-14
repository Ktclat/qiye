#!/usr/bin/env python3
"""Check documentation links, heading anchors, changelog order and wiki pairs.

Handles inline Markdown links, HTML href/src attributes and ATX headings used in
this repository. External URLs are deliberately not fetched.
"""
import html
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
WIKI = ROOT / 'docs/wiki'
LINK = re.compile(r'\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+"[^"\n]*")?\)')
ATTRIBUTE = re.compile(r'\b(?:href|src)=["\']([^"\']+)["\']')


def without_fences(text):
    lines, fence = [], None
    for line in text.splitlines():
        marker = re.match(r'^\s{0,3}(`{3,}|~{3,})', line)
        if marker:
            value = marker.group(1)
            if fence is None:
                fence = value
            elif value[0] == fence[0] and len(value) >= len(fence):
                fence = None
            lines.append('')
        else:
            lines.append('' if fence else line)
    return '\n'.join(lines)


def anchors(text):
    found, counts = set(), {}
    for line in without_fences(text).splitlines():
        heading = re.match(r'^#{1,6}\s+(.+?)(?:\s+#+)?$', line)
        if not heading:
            continue
        value = re.sub(r'<[^>]+>', '', heading.group(1))
        value = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', value)
        value = html.unescape(value).lower()
        value = ''.join(c for c in value if c in '_- ' or unicodedata.category(c)[0] in 'LNM')
        value = value.replace(' ', '-')
        count = counts.get(value, 0)
        counts[value] = count + 1
        found.add(f'{value}-{count}' if count else value)
    found.update(re.findall(r'\b(?:id|name)=["\']([^"\']+)["\']', text))
    return found


def main():
    paths = sorted([*ROOT.glob('*.md'), *(ROOT / 'docs').rglob('*.md')])
    errors, checked, cache = [], 0, {}
    for path in paths:
        text = path.read_text(encoding='utf-8')
        for line_number, line in enumerate(without_fences(text).splitlines(), 1):
            targets = [m.group(1) for m in LINK.finditer(line)]
            targets += [m.group(1) for m in ATTRIBUTE.finditer(line)]
            for target in targets:
                url = urlsplit(html.unescape(target))
                if url.scheme or url.netloc:
                    continue
                checked += 1
                destination = (path.parent / unquote(url.path)).resolve() if url.path else path
                location = f'{path.relative_to(ROOT).as_posix()}:{line_number}'
                if not destination.is_relative_to(ROOT) or not destination.exists():
                    errors.append(f'{location}: missing local target {target}')
                    continue
                if url.fragment and destination.suffix.lower() == '.md':
                    if destination not in cache:
                        cache[destination] = anchors(destination.read_text(encoding='utf-8'))
                    if unquote(url.fragment) not in cache[destination]:
                        errors.append(f'{location}: missing heading {target}')
        if path.name in {'README.md', 'README.en.md'} and path.parent == ROOT:
            if re.search(r'^#{1,6}\s+v?\d+\.\d+\.\d+', text, re.M):
                errors.append(f'{path.name}: move version history to CHANGELOG.md')
    for path in WIKI.glob('*.md'):
        if path.stem.startswith('_'):
            continue
        partner = path.with_stem(path.stem[:-3] if path.stem.endswith('-en') else path.stem + '-en')
        if not partner.is_file():
            errors.append(f'{path.relative_to(ROOT)}: missing language partner {partner.name}')
    changelog = (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8')
    versions = [tuple(map(int, value.split('.'))) for value in re.findall(r'^## v(\d+\.\d+\.\d+)\b', changelog, re.M)]
    if not versions or versions != sorted(set(versions), reverse=True):
        errors.append('CHANGELOG.md: version headings must be unique and ordered newest first')
    if errors:
        print('\n'.join(errors))
        return 1
    print(f'Checked {len(paths)} Markdown files, {checked} local links and wiki language pairs.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
