#!/usr/bin/env python3
"""Generate GitHub Wiki pages from docs/wiki without committing or pushing."""
import argparse
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/wiki'
REPOSITORY = 'https://github.com/Ktclat/qiye'
LINK = re.compile(r'(\[[^\]\n]*\]\()([^\s)]+)(\))')


def render(text, source):
    def replace(match):
        url = urlsplit(match.group(2))
        if url.scheme or url.netloc or not url.path:
            return match.group(0)
        target = (source.parent / unquote(url.path)).resolve()
        if not target.is_relative_to(ROOT) or not target.exists():
            raise ValueError(f'{source.name}: invalid local link {match.group(2)}')
        if target.parent == SOURCE and target.suffix == '.md':
            address = f'{REPOSITORY}/wiki/{quote(target.stem)}'
        else:
            kind = 'tree' if target.is_dir() else 'blob'
            address = f'{REPOSITORY}/{kind}/main/{quote(target.relative_to(ROOT).as_posix())}'
        if url.fragment:
            address += '#' + url.fragment
        return match.group(1) + address + match.group(3)

    # Code examples may contain Markdown-looking strings; preserve fenced blocks.
    output, fence = [], None
    for line in text.splitlines(keepends=True):
        marker = re.match(r'^\s{0,3}(`{3,}|~{3,})', line)
        if marker:
            value = marker.group(1)
            if fence is None:
                fence = value
            elif value[0] == fence[0] and len(value) >= len(fence):
                fence = None
            output.append(line)
        else:
            output.append(line if fence else LINK.sub(replace, line))
    return ''.join(output)


def build(destination):
    destination = destination.resolve()
    # Accept only ignored workspace output, so generation cannot overwrite source.
    output_root = (ROOT / 'output').resolve()
    if destination == output_root or not destination.is_relative_to(output_root):
        raise ValueError('Choose a subdirectory of this repository\'s output/, e.g. output/wiki')
    pages = {path.name: render(path.read_text(encoding='utf-8'), path) for path in sorted(SOURCE.glob('*.md'))}
    if 'Home.md' not in pages or 'Home-en.md' not in pages:
        raise ValueError('Both wiki home pages are required')
    destination.mkdir(parents=True, exist_ok=True)
    for name in pages:
        target = destination / name
        if target.is_symlink() or target.resolve().parent != destination:
            raise ValueError(f'Unsafe output path: {target}')
    for name, content in pages.items():
        (destination / name).write_text(content, encoding='utf-8', newline='\n')
    print(f'Generated {len(pages)} wiki pages in {destination}; no commit or push performed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'output/wiki')
    args = parser.parse_args()
    build(args.output)
