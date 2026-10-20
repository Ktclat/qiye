import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


package = load('package-release')
publish = load('publish-release')
identity = load('extension_identity')


class ReleaseTests(unittest.TestCase):
    def test_identity_is_permanent(self):
        self.assertEqual(identity.validate_identity(ROOT), 'olphdlcjiaijcppklllciaeaonbbjjia')

    def test_identity_survives_version_and_directory_changes(self):
        original = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as directory:
            for name, version in [('old', '0.10.10'), ('new', '0.10.11')]:
                root = Path(directory) / name
                root.mkdir()
                (root / 'manifest.json').write_text(json.dumps({**original, 'version': version}))
                (root / 'extension-identity.json').write_bytes((ROOT / 'extension-identity.json').read_bytes())
                self.assertEqual(identity.validate_identity(root), identity.validate_identity(ROOT))

    def test_missing_or_replaced_identity_fails_closed(self):
        original = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'extension-identity.json').write_bytes((ROOT / 'extension-identity.json').read_bytes())
            for key in [None, '', 'invalid key', original['key'][:-4] + 'AAAA']:
                candidate = {**original, 'key': key}
                if key is None: candidate.pop('key')
                (root / 'manifest.json').write_text(json.dumps(candidate))
                with self.assertRaises(ValueError): identity.validate_identity(root)

    def test_trigger_policy(self):
        self.assertFalse(publish.release_requested('refs/heads/main', '0.5.0', '0.4.0', False))
        self.assertFalse(publish.release_requested('refs/heads/main', '0.5.0', '0.5.0', True))
        self.assertFalse(publish.release_requested('refs/heads/main', '0.5.0', '0.5.0', False))
        self.assertFalse(publish.release_requested('refs/heads/feature', '0.5.0', None, False))
        self.assertTrue(publish.release_requested('refs/tags/v0.5.0', '0.5.0', None, False))
        with self.assertRaises(ValueError):
            publish.release_requested('refs/tags/v0.4.0', '0.5.0', None, False)

    def test_versions_must_match(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for version in ['0.4.0', '0.4.1', '1.0.0-rc.1', '01.0.0', '65536.0.0']:
                (root / 'manifest.json').write_text(json.dumps({'version': version}))
                (root / 'package.json').write_text(json.dumps({'version': '0.4.0'}))
                if version == '0.4.0': self.assertEqual(package.release_version(root), '0.4.0')
                else:
                    with self.assertRaises(ValueError): package.release_version(root)

    def test_archives_are_deterministic_and_reject_outside_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            a, b = Path(directory) / 'a.zip', Path(directory) / 'b.zip'
            package.archive(a, ['manifest.json', 'LICENSE'])
            package.archive(b, ['LICENSE', 'manifest.json', 'LICENSE'])
            self.assertEqual(a.read_bytes(), b.read_bytes())
            with zipfile.ZipFile(a) as archive:
                self.assertIn('manifest.json', archive.namelist())
                self.assertEqual(json.loads(archive.read('manifest.json'))['version'], package.release_version())
            with self.assertRaises(ValueError): package.archive(a, ['../outside.txt'])


if __name__ == '__main__':
    unittest.main()
