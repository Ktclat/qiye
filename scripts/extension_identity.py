"""Validate the permanent identity of Qiye's locally installed distribution."""
import base64
import hashlib
import json
from pathlib import Path


def validate_identity(root):
    root = Path(root)
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    expected = json.loads((root / 'extension-identity.json').read_text(encoding='utf-8'))['id']
    try:
        public_key = base64.b64decode(manifest['key'], validate=True)
        digest = hashlib.sha256(public_key).hexdigest()[:32]
        actual = ''.join(chr(ord('a') + int(char, 16)) for char in digest)
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError('The permanent extension public key is missing or invalid') from error
    if len(public_key) < 256 or actual != expected:
        raise ValueError('Extension identity changed; do not regenerate the key between releases')
    return actual
