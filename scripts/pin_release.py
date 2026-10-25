import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import zipfile

from verify_release import verify_release


def pin_release(xpi, root):
    source = root / "extension"
    verify_release(xpi, source)
    version = json.loads((source / "manifest.json").read_text())["version"]
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){1,3}", version):
        raise ValueError("Unsupported extension version")
    digest = base64.b64encode(hashlib.sha256(xpi.read_bytes()).digest()).decode("ascii")
    url = f"https://github.com/MrWrees/wrees-startpage/releases/download/v{version}/wrees-startpage-{version}-signed.xpi"
    text = "{\n" + f'  version = "{version}";\n  url = "{url}";\n  hash = "sha256-{digest}";\n' + "}\n"
    target = root / "nix" / "release.nix"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=target.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(text)
        os.chmod(temporary, 0o644)
        os.replace(temporary, target)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return version


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("xpi", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        version = pin_release(args.xpi, root)
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        raise SystemExit(str(error)) from None
    print(f"Pinned signed version {version} in nix/release.nix")
    print(f"Publish the same bytes as wrees-startpage-{version}-signed.xpi in release v{version}")


if __name__ == "__main__":
    main()
