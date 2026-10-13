#!/usr/bin/env python3
"""Build reproducible, allowlisted Chrome/Edge and corresponding source archives."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def release_version(root=ROOT):
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if version != package['version'] or not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('manifest.json and package.json must have the same x.y.z version')
    if any(int(part) > 65535 for part in version.split('.')) or version == '0.0.0':
        raise ValueError('Version is outside the Chrome extension version range')
    return version


def archive(path, files):
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for relative in sorted(set(files)):
            source = ROOT / relative
            if not source.is_file() or source.is_symlink() or ROOT not in source.resolve().parents:
                raise ValueError(f'Unsafe or missing package entry: {relative}')
            info = zipfile.ZipInfo(relative, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, source.read_bytes())


def build(output):
    version = release_version()
    output.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, str(ROOT / 'scripts/build-preview.py')], check=True)
    runtime = ['manifest.json', 'index.html', 'styles.css', 'background.js', 'popup.html', 'popup.css', 'popup.js', 'LICENSE', 'docs/THIRD_PARTY.md']
    for folder, suffixes in [('src', {'.js', '.css'}), ('icons', {'.png', '.svg'}), ('fonts', {'.woff2', '.txt', '.md'}), ('_locales', {'.json'})]:
        runtime.extend(p.relative_to(ROOT).as_posix() for p in (ROOT / folder).rglob('*') if p.is_file() and p.suffix in suffixes)
    extension = output / f'qiye-{version}-chrome-edge.zip'
    archive(extension, runtime)
    source = runtime + ['package.json', 'README.md', 'README.en.md', 'CONTRIBUTING.md', 'REQUIREMENTS.md', '.gitignore', '.gitattributes', '.nojekyll']
    for folder in ['scripts', 'tests', 'docs', '.github']:
        source.extend(p.relative_to(ROOT).as_posix() for p in (ROOT / folder).rglob('*') if p.is_file() and p.suffix in {'.py', '.mjs', '.md', '.json', '.yml', '.yaml', '.png', '.jpg'})
    source_zip = output / f'qiye-{version}-source.zip'
    archive(source_zip, source)
    preview = output / f'qiye-{version}-preview.html'
    shutil.copyfile(ROOT / 'Qiye-preview.html', preview)
    assets = [extension, source_zip, preview]
    sums = output / f'qiye-{version}-SHA256SUMS.txt'
    sums.write_text(''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in assets), encoding='utf-8')
    print(f'Packaged Qiye {version}: ' + ', '.join(path.name for path in [*assets, sums]))
    return assets


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--check-version', action='store_true')
    args = parser.parse_args()
    if args.check_version:
        print(release_version())
    else:
        build(args.output.resolve())
