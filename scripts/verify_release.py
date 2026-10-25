from pathlib import Path, PurePosixPath
import json
import sys
import zipfile


def normalized_manifest(data):
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate manifest key")
            result[key] = value
        return result

    def reject_constant(value):
        raise ValueError("Invalid JSON constant")

    manifest = json.loads(data.decode("utf-8"), object_pairs_hook=unique_pairs, parse_constant=reject_constant)
    if type(manifest) is not dict:
        raise ValueError("Invalid manifest")
    return json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def verify_release(xpi, source):
    expected = {p.name: p.read_bytes() for p in source.iterdir() if p.is_file()}
    with zipfile.ZipFile(xpi) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(names) > 64 or len(names) != len(set(names)):
            raise ValueError("Invalid XPI entries")
        if sum(entry.file_size for entry in entries) > 512 * 1024:
            raise ValueError("XPI is too large")
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError("Invalid XPI path")
        signatures = {"META-INF/mozilla.rsa", "META-INF/cose.sig"}
        if not signatures.intersection(names):
            raise ValueError("Mozilla-signed XPI required; sign the unsigned build on AMO first")
        actual = {entry.filename: archive.read(entry) for entry in entries if not entry.is_dir() and not entry.filename.startswith("META-INF/")}
        if actual.keys() != expected.keys():
            raise ValueError("Signed XPI does not match the pinned extension source")
        for name, data in expected.items():
            same = normalized_manifest(actual[name]) == normalized_manifest(data) if name == "manifest.json" else actual[name] == data
            if not same:
                raise ValueError("Signed XPI does not match the pinned extension source")


if __name__ == "__main__":
    try:
        verify_release(Path(sys.argv[1]), Path(sys.argv[2]))
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        raise SystemExit(str(error)) from None
