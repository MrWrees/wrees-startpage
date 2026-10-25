import json
import os
import re
import stat
import struct
import sys


MAX_REQUEST = 1024
MAX_PALETTE = 8192
COLOR_KEYS = (
    "mSurface", "mSurfaceVariant", "mOnSurface", "mOnSurfaceVariant",
    "mPrimary", "mSecondary", "mTertiary",
)
HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}\Z")


def read_exact(stream, size):
    data = bytearray()
    while len(data) < size:
        chunk = stream.read(size - len(data))
        if not chunk:
            raise ValueError("Incomplete message")
        data.extend(chunk)
    return bytes(data)


def read_request(stream):
    length = struct.unpack("=I", read_exact(stream, 4))[0]
    if not 0 < length <= MAX_REQUEST:
        raise ValueError("Invalid message size")
    request = json.loads(read_exact(stream, length).decode("utf-8"))
    if type(request) is not dict or request != {"op": "palette"}:
        raise ValueError("Invalid operation")


def read_palette(path):
    if not os.path.isabs(path):
        raise ValueError("Absolute path required")
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            raise ValueError("Invalid palette file")
        if info.st_mode & (stat.S_IWGRP | stat.S_IWOTH) or not 0 < info.st_size <= MAX_PALETTE:
            raise ValueError("Invalid palette file")
        raw = stream.read(MAX_PALETTE + 1)
        if len(raw) > MAX_PALETTE:
            raise ValueError("Palette too large")
    palette = json.loads(raw.decode("utf-8"))
    if type(palette) is not dict:
        raise ValueError("Invalid palette")
    output = {}
    for key in COLOR_KEYS:
        value = palette.get(key)
        if type(value) is not str or HEX_COLOR.fullmatch(value) is None:
            raise ValueError("Invalid color")
        output[key] = value
    return output


def write_response(stream, response):
    payload = json.dumps(response, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    stream.write(struct.pack("=I", len(payload)))
    stream.write(payload)
    stream.flush()


def main():
    if len(sys.argv) < 2:
        return 2
    try:
        read_request(sys.stdin.buffer)
    except (ValueError, UnicodeError, OSError, RecursionError):
        return 1
    try:
        response = {"ok": True, "colors": read_palette(sys.argv[1])}
    except (ValueError, UnicodeError, OSError, RecursionError):
        response = {"ok": False, "error": "palette_unavailable"}
    write_response(sys.stdout.buffer, response)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
