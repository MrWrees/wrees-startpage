import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("host", ROOT / "native/host.py")
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)
release_spec = importlib.util.spec_from_file_location("release", ROOT / "scripts/verify_release.py")
release = importlib.util.module_from_spec(release_spec)
release_spec.loader.exec_module(release)


def frame(value):
    data = json.dumps(value).encode()
    return struct.pack("=I", len(data)) + data


class HostTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "colors.json"
        self.colors = {key: "#abcdef" for key in host.COLOR_KEYS}
        self.path.write_text(json.dumps(self.colors))
        self.path.chmod(0o600)

    def tearDown(self):
        self.directory.cleanup()

    def test_native_protocol_and_private_data_filter(self):
        self.path.write_text(json.dumps({**self.colors, "secret": "must not leave this process"}))
        result = subprocess.run([sys.executable, "-I", "-B", str(ROOT / "native/host.py"), str(self.path)], input=frame({"op": "palette"}), capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        size = struct.unpack("=I", result.stdout[:4])[0]
        self.assertEqual(size, len(result.stdout) - 4)
        self.assertEqual(json.loads(result.stdout[4:]), {"ok": True, "colors": self.colors})
        self.assertEqual(result.stderr, b"")

    def test_request_cannot_select_path_or_command(self):
        for request in [{"op": "read", "path": "/etc/passwd"}, {"op": "palette", "path": "/etc/passwd"}, {"op": "palette", "command": "id"}, [], None]:
            with self.assertRaises(ValueError):
                host.read_request(io.BytesIO(frame(request)))

    def test_framing_limits_and_truncation(self):
        for data in [b"", b"\x01", struct.pack("=I", 2**32 - 1), struct.pack("=I", 20) + b"{}", struct.pack("=I", 2) + b"\xff\xff"]:
            with self.assertRaises((ValueError, UnicodeError)):
                host.read_request(io.BytesIO(data))

    def test_symlink_and_fifo_are_rejected(self):
        link = self.path.with_name("link.json")
        link.symlink_to(self.path)
        with self.assertRaises(OSError):
            host.read_palette(str(link))
        fifo = self.path.with_name("pipe")
        os.mkfifo(fifo)
        with self.assertRaises(ValueError):
            host.read_palette(str(fifo))

    def test_writeable_and_oversized_files_are_rejected(self):
        self.path.chmod(0o666)
        with self.assertRaises(ValueError):
            host.read_palette(str(self.path))
        self.path.chmod(0o600)
        self.path.write_bytes(b" " * (host.MAX_PALETTE + 1))
        with self.assertRaises(ValueError):
            host.read_palette(str(self.path))

    def test_invalid_colors_never_leave_the_host(self):
        self.path.write_text(json.dumps({**self.colors, "mPrimary": "url(https://attacker.invalid)"}))
        with self.assertRaises(ValueError):
            host.read_palette(str(self.path))
        result = subprocess.run([sys.executable, "-I", "-B", str(ROOT / "native/host.py"), str(self.path)], input=frame({"op": "palette"}), capture_output=True, timeout=5)
        self.assertEqual(json.loads(result.stdout[4:]), {"ok": False, "error": "palette_unavailable"})
        self.assertNotIn(str(self.path).encode(), result.stdout)


class ReleaseTests(unittest.TestCase):
    def test_manifest_formatting_is_accepted_but_content_changes_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            xpi = Path(directory) / "test.xpi"
            manifest = json.loads((ROOT / "extension/manifest.json").read_text())

            def make_xpi(value):
                with zipfile.ZipFile(xpi, "w") as archive:
                    for path in (ROOT / "extension").iterdir():
                        archive.writestr(path.name, value if path.name == "manifest.json" else path.read_bytes())
                    archive.writestr("META-INF/cose.sig", b"test metadata, not a valid Mozilla signature")

            make_xpi(json.dumps(manifest, indent=4).encode())
            release.verify_release(xpi, ROOT / "extension")
            manifest["permissions"].append("tabs")
            make_xpi(json.dumps(manifest).encode())
            with self.assertRaisesRegex(ValueError, "pinned extension source"):
                release.verify_release(xpi, ROOT / "extension")

    def test_manifest_duplicates_and_nonstandard_constants_are_rejected(self):
        for data in [b'{"permissions":[],"permissions":["tabs"]}', b'{"value":NaN}', b'[]']:
            with self.assertRaises(ValueError):
                release.normalized_manifest(data)

    def test_unsigned_release_and_modified_code_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            xpi = Path(directory) / "test.xpi"
            with zipfile.ZipFile(xpi, "w") as archive:
                for path in (ROOT / "extension").iterdir():
                    archive.writestr(path.name, path.read_bytes())
            with self.assertRaisesRegex(ValueError, "Mozilla-signed"):
                release.verify_release(xpi, ROOT / "extension")
            with zipfile.ZipFile(xpi, "a") as archive:
                archive.writestr("META-INF/cose.sig", b"not a real signature")
            release.verify_release(xpi, ROOT / "extension")
            with zipfile.ZipFile(xpi, "a") as archive:
                archive.writestr("unexpected.js", b"malicious code")
            with self.assertRaisesRegex(ValueError, "pinned extension source"):
                release.verify_release(xpi, ROOT / "extension")


if __name__ == "__main__":
    unittest.main()
