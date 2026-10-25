import base64
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from pin_release import pin_release


class ReleasePinningTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "extension"
        self.source.mkdir()
        (self.root / "nix").mkdir()
        self.metadata = self.root / "nix" / "release.nix"
        self.metadata.write_text("original metadata\n")
        (self.source / "manifest.json").write_text(json.dumps({"version": "1.0.1"}))
        (self.source / "defaults.js").write_text("export const defaults = { categories: [] };\n")
        self.xpi = self.root / "release.xpi"

    def tearDown(self):
        self.temporary.cleanup()

    def archive(self, signature=True, changed=False):
        with zipfile.ZipFile(self.xpi, "w") as archive:
            for path in self.source.iterdir():
                data = b"changed source" if changed and path.name == "defaults.js" else path.read_bytes()
                archive.writestr(path.name, data)
            if signature:
                archive.writestr("META-INF/mozilla.rsa", b"test metadata marker")

    def test_pins_exact_archive_bytes_and_versioned_release_url(self):
        self.archive()
        self.assertEqual(pin_release(self.xpi, self.root), "1.0.1")
        digest = base64.b64encode(hashlib.sha256(self.xpi.read_bytes()).digest()).decode("ascii")
        metadata = self.metadata.read_text()
        self.assertIn(f'hash = "sha256-{digest}";', metadata)
        self.assertIn('/v1.0.1/wrees-startpage-1.0.1-signed.xpi";', metadata)
        self.assertEqual(sorted(p.name for p in self.metadata.parent.iterdir()), ["release.nix"])

    def test_unsigned_archive_does_not_change_release_metadata(self):
        self.archive(signature=False)
        with self.assertRaisesRegex(ValueError, "Mozilla-signed XPI required"):
            pin_release(self.xpi, self.root)
        self.assertEqual(self.metadata.read_text(), "original metadata\n")

    def test_different_source_does_not_change_release_metadata(self):
        self.archive(changed=True)
        with self.assertRaisesRegex(ValueError, "does not match"):
            pin_release(self.xpi, self.root)
        self.assertEqual(self.metadata.read_text(), "original metadata\n")

    def test_version_cannot_inject_nix_or_url_text(self):
        (self.source / "manifest.json").write_text(json.dumps({"version": '${builtins.abort "invalid"}'}))
        self.archive()
        with self.assertRaisesRegex(ValueError, "Unsupported extension version"):
            pin_release(self.xpi, self.root)
        self.assertEqual(self.metadata.read_text(), "original metadata\n")


if __name__ == "__main__":
    unittest.main()
