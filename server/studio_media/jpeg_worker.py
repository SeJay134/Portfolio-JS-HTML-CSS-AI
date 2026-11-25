"""Isolated JPEG byte normalization primitive. No HTTP, credentials or Storage access."""
from __future__ import annotations

import io
import sys
import warnings

from PIL import Image, ImageFile

MAX_BYTES = 5_000_000
MAX_SIDE = 2200
MAX_PIXELS = MAX_SIDE * MAX_SIDE
MIN_TARGET = 20_000


class InvalidJPEG(ValueError):
    pass


def inspect_jpeg(data: bytes) -> tuple[int, int]:
    """Bound JPEG structure before calling the native decoder.

    Accept only 8-bit baseline/progressive Huffman JPEG, one frame, one or
    three components, no bytes after EOI. Never pass other formats to Pillow.
    """
    if not isinstance(data, bytes) or not 4 <= len(data) <= MAX_BYTES or data[:2] != b"\xff\xd8":
        raise InvalidJPEG("Invalid JPEG envelope")
    pos = 2
    in_scan = False
    dimensions = None
    scans = segments = 0
    while pos < len(data):
        if in_scan:
            pos = data.find(b"\xff", pos)
            if pos < 0:
                break
        elif data[pos] != 255:
            raise InvalidJPEG("Invalid marker")
        while pos < len(data) and data[pos] == 255:
            pos += 1
        if pos == len(data):
            break
        marker = data[pos]
        pos += 1
        if in_scan and (marker == 0 or 0xD0 <= marker <= 0xD7):
            continue
        in_scan = False
        if marker == 0xD9:
            if pos != len(data) or dimensions is None or not scans:
                raise InvalidJPEG("Invalid JPEG end")
            return dimensions
        segments += 1
        if segments > 2048 or pos + 2 > len(data):
            raise InvalidJPEG("Excessive or incomplete segments")
        length = int.from_bytes(data[pos:pos + 2], "big")
        end = pos + length
        if length < 2 or end > len(data):
            raise InvalidJPEG("Invalid segment length")
        payload = data[pos + 2:end]
        if marker in (0xC0, 0xC2):
            if dimensions is not None or len(payload) < 6 or payload[0] != 8:
                raise InvalidJPEG("Unsupported frame")
            height = int.from_bytes(payload[1:3], "big")
            width = int.from_bytes(payload[3:5], "big")
            components = payload[5]
            if (not 1 <= width <= MAX_SIDE or not 1 <= height <= MAX_SIDE
                    or width * height > MAX_PIXELS or components not in (1, 3)
                    or len(payload) != 6 + 3 * components):
                raise InvalidJPEG("Unsupported dimensions or components")
            dimensions = (width, height)
        elif marker == 0xDA:
            scans += 1
            if dimensions is None or scans > 64 or len(payload) < 6:
                raise InvalidJPEG("Invalid scan")
            in_scan = True
        elif marker not in (0xC4, 0xDB, 0xDD, 0xFE) and not 0xE0 <= marker <= 0xEF:
            raise InvalidJPEG("Unsupported JPEG marker")
        pos = end
    raise InvalidJPEG("Incomplete JPEG")


def normalize_jpeg(data: bytes, target: int = MAX_BYTES) -> bytes:
    if type(target) is not int or not MIN_TARGET <= target <= MAX_BYTES:
        raise InvalidJPEG("Invalid output limit")
    dimensions = inspect_jpeg(data)
    # This module runs in a dedicated subprocess, not a shared image service.
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            with Image.open(io.BytesIO(data), formats=["JPEG"]) as probe:
                if probe.format != "JPEG" or probe.size != dimensions:
                    raise InvalidJPEG("Decoder/header mismatch")
                probe.verify()
            with Image.open(io.BytesIO(data), formats=["JPEG"]) as decoded:
                if decoded.size != dimensions or decoded.mode not in ("RGB", "L"):
                    raise InvalidJPEG("Unsupported decoded image")
                decoded.load()
                with decoded.convert("RGB") as rgb:
                    # Fresh pixel-only image; no copied EXIF, ICC, comment or other metadata.
                    with Image.frombytes("RGB", dimensions, rgb.tobytes()) as clean:
                        for quality in (90, 82, 74, 60, 45, 30, 20):
                            output = io.BytesIO()
                            clean.save(output, format="JPEG", quality=quality, progressive=False, optimize=False)
                            normalized = output.getvalue()
                            if len(normalized) <= target and inspect_jpeg(normalized) == dimensions:
                                return normalized
    except (OSError, SyntaxError, ValueError, Warning, Image.DecompressionBombError) as exc:
        raise InvalidJPEG("Invalid or unsupported JPEG") from exc
    raise InvalidJPEG("Cannot meet output size limit")


def main() -> int:
    # Linux defense-in-depth resource limits. A full network/filesystem sandbox
    # is a separate release gate; this worker is not an HTTP service.
    if sys.platform.startswith("linux"):
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
    try:
        if len(sys.argv) != 2:
            return 2
        target = int(sys.argv[1])
        data = sys.stdin.buffer.read(MAX_BYTES + 1)
        output = normalize_jpeg(data, target)
        sys.stdout.buffer.write(output)
        return 0
    except (ValueError, OSError, MemoryError):
        # No filename, input bytes, EXIF or native decoder error in output/log.
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
