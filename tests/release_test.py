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


class ReleaseTests(unittest.TestCase):
    def test_trigger_policy(self):
        self.assertTrue(publish.release_requested('refs/heads/main', '0.4.0', '0.3.3'))
        self.assertFalse(publish.release_requested('refs/heads/main', '0.4.0', '0.4.0'))
        self.assertFalse(publish.release_requested('refs/heads/feature', '0.4.0', None))
        self.assertTrue(publish.release_requested('refs/tags/v0.4.0', '0.4.0', None))
        with self.assertRaises(ValueError):
            publish.release_requested('refs/tags/v0.3.3', '0.4.0', None)

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
