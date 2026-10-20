#!/usr/bin/env python3
"""Publish verified assets only from a matching vX.Y.Z tag."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_release', ROOT / 'scripts/package-release.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


def output(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def release_requested(ref, version, previous_version, published):
    if ref.startswith('refs/tags/'):
        if ref != f'refs/tags/v{version}':
            raise ValueError('Release tag must match manifest.json and package.json')
        return True
    return False  # Only a matching version tag authorizes publication.


def publish(assets):
    version = package.release_version()
    ref = os.environ['GITHUB_REF']
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
    before = event.get('before', '')
    previous = None
    if ref == 'refs/heads/main' and before and set(before) != {'0'}:
        # Failure to resolve the previous commit must fail closed, not publish.
        previous = json.loads(output('git', 'show', f'{before}:manifest.json'))['version']
    tag = f'v{version}'
    repository = os.environ['GITHUB_REPOSITORY']
    # API/authentication failures are fatal; they never mean "release absent".
    releases = output('gh', 'api', '--paginate', f'repos/{repository}/releases', '--jq', '.[] | select(.tag_name == "' + tag + '") | [.id, .draft] | @tsv')
    published = bool(releases) and releases.splitlines()[0].split('\t')[1] == 'false'
    if not release_requested(ref, version, previous, published):
        print('Version unchanged and already published; verification completed.')
        return
    sha = output('git', 'rev-parse', 'HEAD')
    existing_tag = subprocess.run(['git', 'rev-parse', '--verify', f'refs/tags/{tag}^{{commit}}'], cwd=ROOT, capture_output=True, text=True)
    if existing_tag.returncode == 0 and existing_tag.stdout.strip() != sha:
        raise ValueError(f'{tag} already points to a different commit; increment the version')
    files = [assets / f'qiye-{version}-{suffix}' for suffix in ['chrome-edge.zip', 'source.zip', 'preview.html', 'SHA256SUMS.txt']]
    if not all(path.is_file() for path in files):
        raise ValueError('Verified release assets are missing')
    if releases:
        _, draft = releases.splitlines()[0].split('\t')
        if draft != 'true':
            print(f'{tag} is already published; keeping its assets unchanged.')
            return
    else:
        notes = assets / 'release-notes.md'
        notes.write_text(f'''栖页 Qiye {version}

下载 `qiye-{version}-chrome-edge.zip`，解压后在 Chrome / Edge 的扩展管理页开启开发者模式，选择“加载已解压的扩展程序”。选择包含 manifest.json 的目录。

**从 0.10.9 或更早版本升级：请先在旧版导出桌面 JSON 备份，再在新版导入并核对，最后移除旧安装。** 本版开始固定扩展 ID，旧安装的数据不会自动跨 ID 迁移。后续更新保留原安装目录，覆盖文件后在现有扩展卡片点击“重新加载”，不要先卸载。安装包内附 `UPDATING.md`，[完整升级说明](https://github.com/{repository}/blob/{tag}/UPDATING.md)。

版本变化 / Changes: [CHANGELOG.md](https://github.com/{repository}/blob/{tag}/CHANGELOG.md)。

`preview.html` 可直接打开体验网页功能。`source.zip` 包含本版本对应源码、许可证、文档与构建脚本。校验文件为 `SHA256SUMS.txt`。主程序不附带组件实现；官方组件源默认关闭，可在设置中启用。旧桌面组件记录保留，组件更新单独发布。在线网页与扩展共用生产模块：[打开网页端](https://ktclat.github.io/qiye/)。

English: extract the Chrome/Edge ZIP, enable Developer mode and choose “Load unpacked”. When migrating from 0.10.9 or older, export your desktop in the old installation first, import it into the new one, verify it, and only then remove an old copy. Later updates retain the same extension ID: replace files in the existing folder and click Reload without uninstalling. See UPDATING.md in the ZIP and [English documentation](https://github.com/Ktclat/qiye/blob/main/README.en.md).
''', encoding='utf-8')
        subprocess.run(['gh', 'release', 'create', tag, '--repo', repository, '--target', sha, '--title', f'栖页 Qiye {version}', '--notes-file', str(notes), '--generate-notes', '--draft'], check=True, cwd=ROOT)
    subprocess.run(['gh', 'release', 'upload', tag, *map(str, files), '--repo', repository, '--clobber'], check=True, cwd=ROOT)
    subprocess.run(['gh', 'release', 'edit', tag, '--repo', repository, '--draft=false'], check=True, cwd=ROOT)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('assets', type=Path)
    publish(parser.parse_args().assets.resolve())
