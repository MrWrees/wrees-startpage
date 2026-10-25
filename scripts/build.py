import argparse
import json
from pathlib import Path
import zipfile


def build(source, destination):
    files = sorted(source.iterdir())
    if any(not path.is_file() or path.is_symlink() for path in files):
        raise ValueError("Only regular extension files are allowed")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            entry = zipfile.ZipInfo(path.name, (2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, path.read_bytes())


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=root / "extension")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.source / "manifest.json").read_text())
    destination = args.output or root / "dist" / f"wrees-startpage-{manifest['version']}-unsigned.xpi"
    build(args.source, destination)
    print(destination)


if __name__ == "__main__":
    main()
